/**
 * autonomousQueue.ts
 * エージェントが自律的に生成したタスクを管理・実行するキュー。
 *
 * 安全機構:
 * - depth制限 (max 3): タスクが再帰的に生成される深さを制限
 * - レート制限: 5/hour, 20/day
 * - 重複排除: 同タイトル24h以内は実行しない
 * - drain間隔: 30秒ごとにpendingタスクをチェック
 */

import { createHash } from "node:crypto";
import { taskQueue } from "./taskQueue.js";
import { persistAutonomousTask } from "./supabasePersist.js";
import type { AgentGroup, AutonomousTask, OrchestrateEvent } from "./types.js";

// ── 設定 ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_PER_HOUR = 5;
const DEFAULT_MAX_PER_DAY = 20;
const DRAIN_INTERVAL_MS = 30_000;
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── キュークラス ─────────────────────────────────────────────────────

class AutonomousQueueManager {
  private tasks: AutonomousTask[] = [];
  private executedHashes = new Map<string, number>(); // hash -> timestamp
  private hourlyTimestamps: number[] = [];
  private dailyCount = 0;
  private dailyResetAt = 0;
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  // Configurable limits
  maxDepth = DEFAULT_MAX_DEPTH;
  maxPerHour = DEFAULT_MAX_PER_HOUR;
  maxPerDay = DEFAULT_MAX_PER_DAY;

  /** Start the drain timer */
  start(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => this.drain(), DRAIN_INTERVAL_MS);
    console.log(
      `[autonomous-queue] Started (depth=${this.maxDepth}, ${this.maxPerHour}/h, ${this.maxPerDay}/day)`,
    );
  }

  /** Stop the drain timer */
  stop(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  /** Enqueue an autonomous task. Returns task ID or null if rejected. */
  enqueue(input: {
    title: string;
    description: string;
    targetGroup?: AgentGroup;
    priority?: "high" | "medium" | "low";
    depth: number;
    sourceAgentId?: string;
    delayUntil?: number;
  }): string | null {
    // Depth check
    if (input.depth > this.maxDepth) {
      console.log(
        `[autonomous-queue] Rejected (depth ${input.depth} > ${this.maxDepth}): ${input.title}`,
      );
      return null;
    }

    // Rate check
    if (this.isRateLimited()) {
      console.log(`[autonomous-queue] Rejected (rate limit): ${input.title}`);
      return null;
    }

    // Dedup check
    if (this.isDuplicate(input.title)) {
      console.log(`[autonomous-queue] Rejected (duplicate): ${input.title}`);
      return null;
    }

    const task: AutonomousTask = {
      id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: input.title,
      description: input.description,
      targetGroup: input.targetGroup,
      priority: input.priority ?? "medium",
      depth: input.depth,
      sourceAgentId: input.sourceAgentId,
      delayUntil: input.delayUntil ?? Date.now(),
      status: "pending",
      createdAt: Date.now(),
    };

    this.tasks.push(task);
    console.log(
      `[autonomous-queue] Enqueued (depth=${task.depth}): ${task.title}`,
    );

    // Persist
    persistAutonomousTask(task).catch(() => {});

    return task.id;
  }

  /** Get queue status for API */
  getStatus(): {
    pending: number;
    running: number;
    completed: number;
    tasks: AutonomousTask[];
    config: { maxDepth: number; maxPerHour: number; maxPerDay: number };
  } {
    return {
      pending: this.tasks.filter((t) => t.status === "pending").length,
      running: this.tasks.filter((t) => t.status === "running").length,
      completed: this.tasks.filter((t) => t.status === "completed").length,
      tasks: this.tasks.slice(-30),
      config: {
        maxDepth: this.maxDepth,
        maxPerHour: this.maxPerHour,
        maxPerDay: this.maxPerDay,
      },
    };
  }

  /** Graceful shutdown */
  gracefulShutdown(): void {
    this.stop();
    const pending = this.tasks.filter((t) => t.status === "pending").length;
    if (pending > 0) {
      console.log(
        `[autonomous-queue] Shutdown: ${pending} pending tasks will be lost`,
      );
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  private async drain(): Promise<void> {
    // Reset daily counter at midnight JST
    const now = Date.now();
    const jstDay = Math.floor((now + 9 * 3600_000) / 86400_000);
    if (jstDay !== this.dailyResetAt) {
      this.dailyResetAt = jstDay;
      this.dailyCount = 0;
    }

    // Clean old hourly timestamps
    const hourAgo = now - 3600_000;
    this.hourlyTimestamps = this.hourlyTimestamps.filter((t) => t > hourAgo);

    // Clean old dedup hashes
    const dedupCutoff = now - DEDUP_WINDOW_MS;
    for (const [hash, ts] of this.executedHashes) {
      if (ts < dedupCutoff) this.executedHashes.delete(hash);
    }

    // Find next executable task
    const ready = this.tasks
      .filter((t) => t.status === "pending" && t.delayUntil <= now)
      .sort((a, b) => {
        // Priority: high > medium > low
        const prio = { high: 0, medium: 1, low: 2 };
        return (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1);
      });

    if (ready.length === 0) return;
    if (this.isRateLimited()) return;

    // Only process one per drain cycle
    const task = ready[0];
    await this.executeOne(task);
  }

  private async executeOne(task: AutonomousTask): Promise<void> {
    task.status = "running";
    task.startedAt = Date.now();
    this.hourlyTimestamps.push(Date.now());
    this.dailyCount++;

    // Record hash for dedup
    this.executedHashes.set(this.hashTitle(task.title), Date.now());

    console.log(
      `[autonomous-queue] Executing (depth=${task.depth}): ${task.title}`,
    );
    persistAutonomousTask(task).catch(() => {});

    const collectedOutput: string[] = [];

    try {
      await taskQueue.enqueue(
        task.description,
        task.targetGroup,
        (event: OrchestrateEvent) => {
          if (event.type === "agent-done" && event.content) {
            collectedOutput.push(event.content);
          }
        },
      );

      task.status = "completed";
      task.completedAt = Date.now();
      task.result = collectedOutput.join("\n").slice(0, 2000);

      console.log(
        `[autonomous-queue] Completed (depth=${task.depth}): ${task.title}`,
      );
    } catch (error) {
      task.status = "error";
      task.completedAt = Date.now();
      task.result = error instanceof Error ? error.message : "Unknown error";

      console.error(
        `[autonomous-queue] Error (depth=${task.depth}): ${task.title} - ${task.result}`,
      );
    }

    persistAutonomousTask(task).catch(() => {});

    // Trim old tasks from memory
    if (this.tasks.length > 100) {
      this.tasks = this.tasks.slice(-80);
    }
  }

  private isRateLimited(): boolean {
    const hourAgo = Date.now() - 3600_000;
    const hourlyCount = this.hourlyTimestamps.filter((t) => t > hourAgo).length;
    if (hourlyCount >= this.maxPerHour) return true;
    if (this.dailyCount >= this.maxPerDay) return true;
    return false;
  }

  private isDuplicate(title: string): boolean {
    return this.executedHashes.has(this.hashTitle(title));
  }

  private hashTitle(title: string): string {
    return createHash("sha256")
      .update(title.trim().toLowerCase())
      .digest("hex")
      .slice(0, 16);
  }
}

export const autonomousQueue = new AutonomousQueueManager();
