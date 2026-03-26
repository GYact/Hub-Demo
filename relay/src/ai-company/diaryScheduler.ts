/**
 * diaryScheduler.ts
 * AI自動日記生成スケジューラー（毎日22:00 JST）
 *
 * 設計方針:
 * - 既存の taskQueue.enqueue() + orchestrate() フローを再利用
 * - Google Workspace MCP (Calendar / Gmail / Docs) はオーケストレーター経由で使用
 * - setTimeout で次回22:00 JSTまでの遅延を再帰的にスケジュール
 */

import { execFileSync } from "node:child_process";
import { taskQueue } from "./taskQueue.js";
import { persistDiaryEntry } from "./supabasePersist.js";
import type { OrchestrateEvent } from "./types.js";

/** Quick check if GWS OAuth credentials are valid */
function isGwsAuthValid(): boolean {
  try {
    const input =
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calendar_calendarList_list","arguments":{"params":{"maxResults":1}}}}';
    const result = execFileSync("gws", ["mcp", "-s", "calendar", "-e"], {
      encoding: "utf-8",
      timeout: 15_000,
      input,
    });
    return (
      !result.includes("Authentication failed") &&
      !result.includes("Access denied")
    );
  } catch {
    return false;
  }
}

// ── 定数 ─────────────────────────────────────────────────────────────

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9
const DIARY_HOUR_JST = 22; // 22:00 JST

// ── スケジューリングユーティリティ ──────────────────────────────────

/** 次回 22:00 JST までの残りミリ秒を計算 */
function getNextRunMs(): number {
  const nowMs = Date.now();
  const jstNow = new Date(nowMs + JST_OFFSET_MS);

  const jstTarget = new Date(jstNow);
  jstTarget.setUTCHours(DIARY_HOUR_JST, 0, 0, 0);

  // 既に過ぎていたら翌日にシフト
  if (jstNow.getTime() >= jstTarget.getTime()) {
    jstTarget.setUTCDate(jstTarget.getUTCDate() + 1);
  }

  return jstTarget.getTime() - JST_OFFSET_MS - nowMs;
}

/** YYYY-MM-DD 形式の日付文字列（JST基準） */
function getJstDateStr(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// ── 日記タスクプロンプト ─────────────────────────────────────────────

function buildDiaryTask(dateStr: string): string {
  return `今日（${dateStr}）のAI自動日記を生成してください。

## 手順
1. Google Calendar の今日（${dateStr}）の予定を取得してください
   - ツール: mcp__gws-workspace__calendar_events_list
   - 条件: timeMin=${dateStr}T00:00:00+09:00, timeMax=${dateStr}T23:59:59+09:00
2. Gmail の今日受信した重要なメールを最大10件取得してください
   - ツール: mcp__gws-workspace__gmail_users_messages_list
   - 条件: q="after:${dateStr.replace(/-/g, "/")}"
3. 取得した情報をもとに以下スタイルで日記を作成してください

## 日記のスタイル
- 文章形式（箇条書きではなく自然な文章）
- 振り返り形式（その日の出来事・気づき・明日への展望を含む）
- 500〜800文字程度
- 日本語

## 出力形式
必ず以下のJSONブロックで日記を出力してください。保存はシステムが自動で行います。

\`\`\`diary_json
{
  "title": "日記 ${dateStr}",
  "content": "日記の本文をここに書く",
  "mood": "happy|neutral|sad|excited|tired|anxious|grateful|productive のいずれか",
  "tags": ["カレンダー", "仕事"]
}
\`\`\`

JSONブロック外にサマリーや補足は不要です。`;
}

// ── diary_json 抽出 ──────────────────────────────────────────────────

interface DiaryJson {
  title: string;
  content: string;
  mood?: string;
  tags?: string[];
}

function extractDiaryJson(text: string): DiaryJson | null {
  const match =
    text.match(/```diary_json\s*([\s\S]*?)```/) ??
    text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as DiaryJson;
    if (parsed.title && parsed.content) return parsed;
  } catch {
    // invalid JSON
  }
  return null;
}

// ── スケジューラー状態 ────────────────────────────────────────────────

interface DiarySchedulerStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  nextRunAt: string;
  nextRunMs: number;
  gwsAuthValid: boolean;
}

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false; // in-process mutex — prevents duplicate concurrent invocations
let lastRunAt: string | null = null;
let lastRunStatus: "success" | "error" | null = null;

export function getDiarySchedulerStatus(): DiarySchedulerStatus {
  const nextRunMs = getNextRunMs();
  return {
    enabled: schedulerTimer !== null,
    lastRunAt,
    lastRunStatus,
    nextRunAt: new Date(Date.now() + nextRunMs).toISOString(),
    nextRunMs,
    gwsAuthValid: isGwsAuthValid(),
  };
}

// ── 日記生成実行 ─────────────────────────────────────────────────────

async function runDiary(): Promise<void> {
  if (isRunning) {
    console.warn(
      `[diary-scheduler] Already running — skipping duplicate invocation`,
    );
    return;
  }
  isRunning = true;
  const dateStr = getJstDateStr();
  console.log(`[diary-scheduler] Generating diary for ${dateStr}`);
  lastRunAt = new Date().toISOString();

  // Pre-flight: check GWS auth
  if (!isGwsAuthValid()) {
    console.warn(
      `[diary-scheduler] GWS auth expired — run \`gws auth login\` to restore Google Workspace data`,
    );
  }

  const task = buildDiaryTask(dateStr);

  // Collect agent-done events to assess quality
  const agentResults: string[] = [];

  try {
    await taskQueue.enqueue(task, undefined, (event: OrchestrateEvent) => {
      if (event.type === "agent-done" && event.content) {
        agentResults.push(event.content);
      }
    });

    // Check if agents actually produced useful output
    const allText = agentResults.join("\n");
    const hasTimeout = allText.includes("[TIMEOUT]");
    const hasGwsAuthFail =
      allText.includes("GWS認証なし") ||
      allText.includes("credentials not configured");
    const hasError = allText.includes("[ERROR]");

    if (hasTimeout || hasGwsAuthFail || hasError) {
      lastRunStatus = "error";
      const issues = [
        hasTimeout && "TIMEOUT",
        hasGwsAuthFail && "GWS_AUTH",
        hasError && "ERROR",
      ]
        .filter(Boolean)
        .join(", ");
      console.warn(`[diary-scheduler] Partial for ${dateStr} (${issues})`);
      return;
    }

    // Extract diary JSON from agent output and save to Supabase
    const diary = extractDiaryJson(allText);
    if (diary) {
      const saved = await persistDiaryEntry({
        date: dateStr,
        title: diary.title,
        content: diary.content,
        mood: diary.mood,
        tags: diary.tags,
      });
      if (saved) {
        lastRunStatus = "success";
        console.log(
          `[diary-scheduler] Saved to Supabase journal_entries: ${dateStr}`,
        );
      } else {
        lastRunStatus = "error";
        console.error(
          `[diary-scheduler] Failed to save diary to Supabase for ${dateStr}`,
        );
      }
    } else {
      // Fallback: save raw agent output as content
      const rawContent = allText.trim();
      if (rawContent.length > 50) {
        const saved = await persistDiaryEntry({
          date: dateStr,
          title: `日記 ${dateStr}`,
          content: rawContent,
        });
        lastRunStatus = saved ? "success" : "error";
        if (saved) {
          console.log(
            `[diary-scheduler] Saved raw output to Supabase: ${dateStr}`,
          );
        }
      } else {
        lastRunStatus = "error";
        console.warn(
          `[diary-scheduler] No diary content extracted for ${dateStr}`,
        );
      }
    }
  } catch (error) {
    lastRunStatus = "error";
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[diary-scheduler] Failed for ${dateStr}: ${msg}`);
  } finally {
    isRunning = false;
  }
}

// ── スケジューラー制御 ────────────────────────────────────────────────

function scheduleNext(): void {
  const delayMs = getNextRunMs();
  const nextRun = new Date(Date.now() + delayMs);
  console.log(
    `[diary-scheduler] Next run: ${nextRun.toISOString()} (in ${Math.round(delayMs / 60_000)} min)`,
  );

  schedulerTimer = setTimeout(() => {
    scheduleNext(); // 先に次回をスケジュール（タスク実行時間によるdrift防止）
    void runDiary();
  }, delayMs);
}

export function startDiaryScheduler(): void {
  if (schedulerTimer !== null) {
    console.log("[diary-scheduler] Already running");
    return;
  }
  console.log("[diary-scheduler] Started (daily 22:00 JST)");
  scheduleNext();
}

export function stopDiaryScheduler(): void {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("[diary-scheduler] Stopped");
  }
}

/** 手動トリガー（テスト・オンデマンド用） */
export async function triggerDiaryNow(): Promise<void> {
  await runDiary();
}
