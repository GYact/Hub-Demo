/**
 * reviewScheduler.ts
 * AI Company自律レビュースケジューラー（毎日09:00 JST）
 *
 * COO/PMが未対応事項をチェックし、必要なフォローアップを
 * agent_tasksとして自動生成する。
 */

import { taskQueue } from "./taskQueue.js";
import { autonomousQueue } from "./autonomousQueue.js";
import type { OrchestrateEvent } from "./types.js";

// ── 定数 ─────────────────────────────────────────────────────────────

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const REVIEW_HOUR_JST = 9; // 09:00 JST

// ── スケジューリングユーティリティ ──────────────────────────────────

function getNextRunMs(): number {
  const nowMs = Date.now();
  const jstNow = new Date(nowMs + JST_OFFSET_MS);

  const jstTarget = new Date(jstNow);
  jstTarget.setUTCHours(REVIEW_HOUR_JST, 0, 0, 0);

  if (jstNow.getTime() >= jstTarget.getTime()) {
    jstTarget.setUTCDate(jstTarget.getUTCDate() + 1);
  }

  return jstTarget.getTime() - JST_OFFSET_MS - nowMs;
}

function getJstDateStr(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// ── レビュータスクプロンプト ─────────────────────────────────────────

function buildReviewPrompt(dateStr: string): string {
  return `今日（${dateStr}）のAI Company自律レビューを実施してください。

## あなたの役割
COOとして、会社の状況を俯瞰的にレビューし、エージェントチームが自律的に取り組むべきタスクを特定してください。

## 確認事項
1. Google Calendarで今後1週間の予定を確認し、準備が必要な事項を特定
2. Gmailで未対応の重要メールがないか確認
3. プロジェクトの現在の状態を確認（コードの品質、未修正のバグなど）
4. SNS投稿の状況確認（最近の投稿頻度、エンゲージメント）

## 出力
- 各確認事項の簡潔なサマリー
- エージェントが対応すべきフォローアップがあれば、以下の形式で出力:

\`\`\`agent_tasks
[{"title": "タスク名", "description": "詳細指示", "targetGroup": "tech", "priority": "medium", "delay_minutes": 0}]
\`\`\`

targetGroup: executive|product|tech|design|sales|marketing|hr|legal|operations|support
priority: high|medium|low

不要なタスクは生成しないでください。本当に必要なものだけ提案してください。

## ユーザーへのタスク
レビューの結果、ユーザー（社長）自身が確認・判断・操作すべき事項があれば以下の形式で出力：
\`\`\`user_tasks
[{"title": "タスク名", "notes": "詳細", "due_date": "YYYY-MM-DD"}]
\`\`\`
例：重要メールへの返信、会議準備、意思決定が必要な事項など。`;
}

// ── スケジューラー状態 ────────────────────────────────────────────────

interface ReviewSchedulerStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  nextRunAt: string;
  nextRunMs: number;
}

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunAt: string | null = null;
let lastRunStatus: "success" | "error" | null = null;

export function getReviewSchedulerStatus(): ReviewSchedulerStatus {
  const nextRunMs = getNextRunMs();
  return {
    enabled: schedulerTimer !== null,
    lastRunAt,
    lastRunStatus,
    nextRunAt: new Date(Date.now() + nextRunMs).toISOString(),
    nextRunMs,
  };
}

// ── レビュー実行 ─────────────────────────────────────────────────────

async function runReview(): Promise<void> {
  const dateStr = getJstDateStr();
  console.log(`[review-scheduler] Running daily review for ${dateStr}`);
  lastRunAt = new Date().toISOString();

  const task = buildReviewPrompt(dateStr);
  let agentTasksQueued = 0;

  try {
    await taskQueue.enqueue(task, "executive", (event: OrchestrateEvent) => {
      if (event.type === "autonomous-task-queued") {
        agentTasksQueued++;
      }
    });

    lastRunStatus = "success";
    console.log(
      `[review-scheduler] Completed for ${dateStr}: ${agentTasksQueued} agent tasks queued`,
    );
  } catch (error) {
    lastRunStatus = "error";
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[review-scheduler] Failed for ${dateStr}: ${msg}`);
  }
}

// ── スケジューラー制御 ────────────────────────────────────────────────

function scheduleNext(): void {
  const delayMs = getNextRunMs();
  const nextRun = new Date(Date.now() + delayMs);
  console.log(
    `[review-scheduler] Next run: ${nextRun.toISOString()} (in ${Math.round(delayMs / 60_000)} min)`,
  );

  schedulerTimer = setTimeout(() => {
    scheduleNext(); // 先に次回をスケジュール（タスク実行時間によるdrift防止）
    void runReview();
  }, delayMs);
}

export function startReviewScheduler(): void {
  if (schedulerTimer !== null) {
    console.log("[review-scheduler] Already running");
    return;
  }
  console.log("[review-scheduler] Started (daily 09:00 JST)");
  scheduleNext();
}

export function stopReviewScheduler(): void {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("[review-scheduler] Stopped");
  }
}

export async function triggerReviewNow(): Promise<void> {
  await runReview();
}
