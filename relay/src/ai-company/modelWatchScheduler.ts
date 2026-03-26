/**
 * modelWatchScheduler.ts
 * AIモデルの最新情報を定期的にチェックし、
 * 更新が必要な場合にAI CompanyのTechグループへ更新タスクを投入する。
 *
 * スケジュール: 毎週月曜 10:00 JST
 *
 * 仕組み:
 * 1. Perplexity (sonar) でプロバイダー別に最新モデル情報をweb検索
 * 2. modelRegistry.ts の現在値と比較
 * 3. 差分があれば autonomousQueue に更新タスクを投入
 *    → Tech グループ (CTO, Lead Engineer) が自動対応
 */

import { autonomousQueue } from "./autonomousQueue.js";
import { runClaudeCode } from "./claude.js";
import {
  MODEL_REGISTRY,
  getRegistrySummary,
  type ModelEntry,
} from "./modelRegistry.js";

// ── 定数 ─────────────────────────────────────────────────────────────

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CHECK_DAY_JST = 1; // 月曜 (0=日, 1=月, ...)
const CHECK_HOUR_JST = 10; // 10:00 JST

// ── モデルチェックロジック ─────────────────────────────────────────────

interface ModelUpdate {
  registryKey: string;
  entry: ModelEntry;
  currentModel: string;
  recommendedModel: string;
  reason: string;
}

async function checkForUpdates(): Promise<ModelUpdate[]> {
  const registrySummary = getRegistrySummary();

  const systemPrompt = `あなたはAIモデルの最新動向に詳しいテクニカルアドバイザーです。
プロジェクトで使用中のAIモデル一覧を受け取り、各モデルについて以下を判定してください:

1. より新しいバージョンや後継モデルがリリースされているか
2. 非推奨(deprecated)になっていないか
3. コスト効率の良い代替モデルが出ていないか

**重要**: 安定版のみ推奨してください。preview/beta/experimentalは除外。
**重要**: モデル名は各プロバイダーのAPI仕様に準拠した正確な名前を使用してください。

以下のJSON配列で回答してください（更新不要なモデルは含めない）:
\`\`\`json
[
  {
    "current": "現在のモデル名",
    "recommended": "推奨モデル名（API仕様準拠の正確な名前）",
    "provider": "openai|anthropic|google|perplexity",
    "reason": "更新理由（日本語、1-2文）"
  }
]
\`\`\`

更新が不要な場合は空配列 \`[]\` を返してください。`;

  const userMessage = `以下がプロジェクトで現在使用中のAIモデル一覧です。
最新の情報と比較して、更新すべきモデルがあるか確認してください。

${registrySummary}

今日の日付: ${new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10)}`;

  console.log("[model-watch] Checking for model updates via Claude Code...");

  const response = await runClaudeCode(systemPrompt, userMessage, {
    allowedTools: ["WebSearch", "WebFetch"],
    timeout: 180_000, // 3分
  });

  // JSONブロックを抽出
  const jsonMatch =
    response.match(/```json\s*([\s\S]*?)```/) ??
    response.match(/\[\s*\{[\s\S]*?\}\s*\]/) ??
    response.match(/\[\s*\]/);

  if (!jsonMatch) {
    console.log("[model-watch] No JSON found in response, assuming no updates");
    return [];
  }

  const jsonStr = jsonMatch[1] ?? jsonMatch[0];

  let updates: {
    current: string;
    recommended: string;
    provider: string;
    reason: string;
  }[];

  try {
    updates = JSON.parse(jsonStr);
  } catch {
    console.error("[model-watch] Failed to parse JSON response:", jsonStr);
    return [];
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return [];
  }

  // レジストリとマッチング
  const result: ModelUpdate[] = [];

  for (const update of updates) {
    if (
      !update.current ||
      !update.recommended ||
      update.current === update.recommended
    ) {
      continue;
    }

    // レジストリ内で該当モデルを使用しているエントリを探す
    for (const [key, entry] of Object.entries(MODEL_REGISTRY)) {
      if (
        entry.current === update.current &&
        entry.provider === update.provider
      ) {
        result.push({
          registryKey: key,
          entry,
          currentModel: update.current,
          recommendedModel: update.recommended,
          reason: update.reason,
        });
      }
    }
  }

  return result;
}

// ── タスク投入 ─────────────────────────────────────────────────────────

function enqueueUpdateTask(updates: ModelUpdate[]): void {
  // プロバイダー別にグループ化
  const byProvider = new Map<string, ModelUpdate[]>();
  for (const u of updates) {
    const list = byProvider.get(u.entry.provider) ?? [];
    list.push(u);
    byProvider.set(u.entry.provider, list);
  }

  for (const [provider, providerUpdates] of byProvider) {
    const changeList = providerUpdates
      .map(
        (u) =>
          `- ${u.currentModel} → ${u.recommendedModel} (理由: ${u.reason})\n` +
          `  使用箇所: ${u.entry.usedIn.join(", ")}`,
      )
      .join("\n");

    const description = `## AIモデル更新タスク (${provider})

以下のモデルに更新が推奨されています。コードを修正してください。

### 変更内容
${changeList}

### 作業手順
1. 上記の使用箇所でモデル名を新しいものに置き換える
2. relay/src/ai-company/modelRegistry.ts のレジストリも更新する
3. src/lib/aiDefaults.ts のデフォルト値も該当があれば更新する
4. 変更後、型チェック (\`pnpm exec tsc --noEmit\`) を実行して問題がないことを確認
5. Edge Functionsの場合は \`supabase functions deploy\` でデプロイも実施

### 注意事項
- モデル名はAPIドキュメントに準拠した正確な名前を使用すること
- 既存の動作を壊さないよう、各プロバイダーのAPI互換性を確認すること
- preview/beta/experimentalモデルは使用しないこと`;

    const taskId = autonomousQueue.enqueue({
      title: `AIモデル更新: ${provider} (${providerUpdates.length}件)`,
      description,
      targetGroup: "tech",
      priority: "medium",
      depth: 1,
    });

    if (taskId) {
      console.log(
        `[model-watch] Enqueued update task for ${provider}: ${taskId}`,
      );
    } else {
      console.log(
        `[model-watch] Task for ${provider} was rejected by autonomous queue`,
      );
    }
  }
}

// ── スケジューリング ──────────────────────────────────────────────────

function getNextRunMs(): number {
  const nowMs = Date.now();
  const jstNow = new Date(nowMs + JST_OFFSET_MS);

  // 今週の月曜10:00 JSTを計算
  const jstTarget = new Date(jstNow);
  const currentDay = jstNow.getUTCDay();
  const daysUntilTarget =
    currentDay <= CHECK_DAY_JST
      ? CHECK_DAY_JST - currentDay
      : 7 - currentDay + CHECK_DAY_JST;

  jstTarget.setUTCDate(jstTarget.getUTCDate() + daysUntilTarget);
  jstTarget.setUTCHours(CHECK_HOUR_JST, 0, 0, 0);

  // 今日が月曜で既に過ぎていたら来週
  if (daysUntilTarget === 0 && jstNow.getTime() >= jstTarget.getTime()) {
    jstTarget.setUTCDate(jstTarget.getUTCDate() + 7);
  }

  return jstTarget.getTime() - JST_OFFSET_MS - nowMs;
}

// ── スケジューラー状態 ────────────────────────────────────────────────

interface ModelWatchStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "success" | "no-updates" | "error" | null;
  lastUpdatesFound: number;
  nextRunAt: string;
  nextRunMs: number;
}

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunAt: string | null = null;
let lastRunStatus: "success" | "no-updates" | "error" | null = null;
let lastUpdatesFound = 0;

export function getModelWatchStatus(): ModelWatchStatus {
  const nextRunMs = getNextRunMs();
  return {
    enabled: schedulerTimer !== null,
    lastRunAt,
    lastRunStatus,
    lastUpdatesFound,
    nextRunAt: new Date(Date.now() + nextRunMs).toISOString(),
    nextRunMs,
  };
}

// ── チェック実行 ──────────────────────────────────────────────────────

async function runModelCheck(): Promise<void> {
  console.log("[model-watch] Starting model update check...");
  lastRunAt = new Date().toISOString();

  try {
    const updates = await checkForUpdates();

    if (updates.length === 0) {
      lastRunStatus = "no-updates";
      lastUpdatesFound = 0;
      console.log("[model-watch] All models are up to date");
      return;
    }

    console.log(`[model-watch] Found ${updates.length} model update(s):`);
    for (const u of updates) {
      console.log(`  ${u.currentModel} → ${u.recommendedModel} (${u.reason})`);
    }

    enqueueUpdateTask(updates);

    lastRunStatus = "success";
    lastUpdatesFound = updates.length;
    console.log(
      `[model-watch] Enqueued update tasks for ${updates.length} model(s)`,
    );
  } catch (error) {
    lastRunStatus = "error";
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[model-watch] Check failed: ${msg}`);
  }
}

// ── スケジューラー制御 ────────────────────────────────────────────────

function scheduleNext(): void {
  const delayMs = getNextRunMs();
  const nextRun = new Date(Date.now() + delayMs);
  console.log(
    `[model-watch] Next check: ${nextRun.toISOString()} (in ${Math.round(delayMs / 3600_000)}h)`,
  );

  schedulerTimer = setTimeout(() => {
    scheduleNext();
    void runModelCheck();
  }, delayMs);
}

export function startModelWatchScheduler(): void {
  if (schedulerTimer !== null) {
    console.log("[model-watch] Already running");
    return;
  }
  console.log("[model-watch] Started (weekly Mon 10:00 JST)");
  scheduleNext();
}

export function stopModelWatchScheduler(): void {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("[model-watch] Stopped");
  }
}

/** 手動トリガー（APIから呼べるように） */
export async function triggerModelCheckNow(): Promise<{
  updatesFound: number;
  status: string;
}> {
  await runModelCheck();
  return {
    updatesFound: lastUpdatesFound,
    status: lastRunStatus ?? "unknown",
  };
}
