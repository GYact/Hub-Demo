/**
 * postScheduler.ts
 * SNS投稿自動生成スケジューラー（毎週月・木 12:00 JST）
 *
 * 設計方針:
 * - postGenerator.generatePosts() を再利用
 * - AI Company のトレンド分析（notices/）からトピックを自動選択
 * - 各プラットフォーム向け投稿を一括生成
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePosts } from "./postGenerator.js";
import { postStore } from "./postStore.js";
import { AGENT_MAP } from "./agents.js";
import type { GeneratedPost, Platform } from "./types.js";

// ── 定数 ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const POST_HOUR_JST = 12; // 12:00 JST
const POST_DAYS = [1, 4]; // Monday, Thursday (0=Sun)

const PLATFORMS: Platform[] = ["x", "note", "instagram", "tiktok"];

// ── スケジューリングユーティリティ ──────────────────────────────────

/** 次回投稿スケジュールまでの残りミリ秒を計算 */
function getNextRunMs(): number {
  const nowMs = Date.now();
  const jstNow = new Date(nowMs + JST_OFFSET_MS);

  // 今日を含む直近の対象曜日を探す
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const candidate = new Date(jstNow);
    candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
    candidate.setUTCHours(POST_HOUR_JST, 0, 0, 0);

    if (
      POST_DAYS.includes(candidate.getUTCDay()) &&
      candidate.getTime() > jstNow.getTime()
    ) {
      return candidate.getTime() - JST_OFFSET_MS - nowMs;
    }
  }

  // Fallback: 次の月曜
  const nextMonday = new Date(jstNow);
  nextMonday.setUTCDate(
    nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7),
  );
  nextMonday.setUTCHours(POST_HOUR_JST, 0, 0, 0);
  return nextMonday.getTime() - JST_OFFSET_MS - nowMs;
}

// ── トピック自動選択 ────────────────────────────────────────────────

/** notices/ ディレクトリから最新のトレンド情報を読み取りトピックを生成 */
function pickTopic(): string {
  const noticesDir = join(__dirname, "notices");
  try {
    const files = readdirSync(noticesDir)
      .filter((f) => f.endsWith(".txt"))
      .sort()
      .slice(-5); // 最新5件

    if (files.length === 0) {
      return "AI技術とプロダクト開発の最新トレンド";
    }

    const snippets = files
      .map((f) => {
        const content = readFileSync(join(noticesDir, f), "utf-8");
        return content.slice(0, 200);
      })
      .join("\n");

    // 最新のnoticesから要約的トピックを構成
    return `以下の社内情報を参考に、会社の最新活動に関する投稿を作成してください:\n${snippets}`;
  } catch {
    return "AI技術とプロダクト開発の最新トレンド";
  }
}

// ── スケジューラー状態 ────────────────────────────────────────────────

interface PostSchedulerStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  nextRunAt: string;
  nextRunMs: number;
  schedule: string;
}

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunAt: string | null = null;
let lastRunStatus: "success" | "error" | null = null;

export function getPostSchedulerStatus(): PostSchedulerStatus {
  const nextRunMs = getNextRunMs();
  return {
    enabled: schedulerTimer !== null,
    lastRunAt,
    lastRunStatus,
    nextRunAt: new Date(Date.now() + nextRunMs).toISOString(),
    nextRunMs,
    schedule: "Mon/Thu 12:00 JST",
  };
}

// ── 投稿生成実行 ─────────────────────────────────────────────────────

async function runPostGeneration(): Promise<void> {
  const dateStr = new Date(Date.now() + JST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  console.log(`[post-scheduler] Generating posts for ${dateStr}`);
  lastRunAt = new Date().toISOString();

  const topic = pickTopic();
  const snsAgent = AGENT_MAP.get("sns");
  if (!snsAgent) {
    lastRunStatus = "error";
    console.error("[post-scheduler] sns agent not found");
    return;
  }

  // Create placeholders for each platform
  const placeholders: GeneratedPost[] = PLATFORMS.map((platform) => {
    return postStore.addPost({
      platform,
      content: "",
      agentId: snsAgent.id,
      agentName: snsAgent.name,
      topic,
      status: "generating",
    });
  });

  try {
    await generatePosts(topic, placeholders);
    const readyCount = placeholders.filter(
      (p) => postStore.getPost(p.id)?.status === "ready",
    ).length;

    if (readyCount === PLATFORMS.length) {
      lastRunStatus = "success";
      console.log(
        `[post-scheduler] Completed for ${dateStr}: ${readyCount}/${PLATFORMS.length} posts`,
      );
    } else {
      lastRunStatus = "error";
      console.warn(
        `[post-scheduler] Partial for ${dateStr}: ${readyCount}/${PLATFORMS.length} posts`,
      );
    }
  } catch (error) {
    lastRunStatus = "error";
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[post-scheduler] Failed for ${dateStr}: ${msg}`);
  }
}

// ── スケジューラー制御 ────────────────────────────────────────────────

function scheduleNext(): void {
  const delayMs = getNextRunMs();
  const nextRun = new Date(Date.now() + delayMs);
  console.log(
    `[post-scheduler] Next run: ${nextRun.toISOString()} (in ${Math.round(delayMs / 60_000)} min)`,
  );

  schedulerTimer = setTimeout(() => {
    scheduleNext(); // 先に次回をスケジュール（タスク実行時間によるdrift防止）
    void runPostGeneration();
  }, delayMs);
}

export function startPostScheduler(): void {
  if (schedulerTimer !== null) {
    console.log("[post-scheduler] Already running");
    return;
  }
  console.log("[post-scheduler] Started (Mon/Thu 12:00 JST)");
  scheduleNext();
}

export function stopPostScheduler(): void {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("[post-scheduler] Stopped");
  }
}

/** 手動トリガー */
export async function triggerPostsNow(): Promise<void> {
  await runPostGeneration();
}
