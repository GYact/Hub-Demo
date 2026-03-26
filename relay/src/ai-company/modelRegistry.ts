/**
 * modelRegistry.ts
 * プロジェクト全体で使われているAIモデルの一元管理レジストリ。
 *
 * modelWatchScheduler が定期的にこのレジストリを参照し、
 * 各プロバイダーの最新モデルと比較して差分があれば
 * AI Company に更新タスクを投入する。
 */

// ── モデルエントリ型 ──────────────────────────────────────────────────

export interface ModelEntry {
  /** 現在使用中のモデル名 */
  current: string;
  /** プロバイダー */
  provider: "openai" | "anthropic" | "google" | "perplexity";
  /** 用途カテゴリ（コスト最適化 or 品質最優先） */
  tier: "primary" | "mini" | "default";
  /** 使用箇所（ファイルパス:行番号 の目安） */
  usedIn: string[];
  /** 備考 */
  note?: string;
}

// ── プロジェクト全体のモデルレジストリ ─────────────────────────────────

export const MODEL_REGISTRY: Record<string, ModelEntry> = {
  // ── Frontend defaults (src/lib/aiDefaults.ts) ───────────────────
  "frontend-gemini-default": {
    current: "gemini-2.5-pro",
    provider: "google",
    tier: "primary",
    usedIn: ["src/lib/aiDefaults.ts:17"],
    note: "フロントエンドのデフォルトGeminiモデル",
  },
  "frontend-openai-default": {
    current: "gpt-4o",
    provider: "openai",
    tier: "primary",
    usedIn: ["src/lib/aiDefaults.ts:18"],
    note: "フロントエンドのデフォルトOpenAIモデル",
  },
  "frontend-anthropic-default": {
    current: "claude-opus-4-6",
    provider: "anthropic",
    tier: "primary",
    usedIn: ["src/lib/aiDefaults.ts:19"],
    note: "フロントエンドのデフォルトAnthropicモデル",
  },
  "frontend-perplexity-default": {
    current: "sonar-reasoning-pro",
    provider: "perplexity",
    tier: "primary",
    usedIn: ["src/lib/aiDefaults.ts:20"],
    note: "フロントエンドのデフォルトPerplexityモデル",
  },

  // ── Edge Function: ai_hub_chat ──────────────────────────────────
  "hub-chat-gemini": {
    current: "gemini-2.5-pro",
    provider: "google",
    tier: "primary",
    usedIn: ["supabase/functions/ai_hub_chat/index.ts:955"],
    note: "メインチャットのデフォルトモデル",
  },

  // ── Edge Function: run_automation ───────────────────────────────
  "automation-openai-mini": {
    current: "gpt-4o-mini",
    provider: "openai",
    tier: "mini",
    usedIn: ["supabase/functions/run_automation/index.ts:241"],
    note: "自動化ワークフローのOpenAI軽量モデル (旧)",
  },
  "automation-openai-mini-v2": {
    current: "gpt-4.1-mini",
    provider: "openai",
    tier: "mini",
    usedIn: ["supabase/functions/run_automation/index.ts:1484"],
    note: "自動化ワークフローのOpenAI軽量モデル (新)",
  },
  "automation-anthropic": {
    current: "claude-sonnet-4-6",
    provider: "anthropic",
    tier: "primary",
    usedIn: ["supabase/functions/run_automation/index.ts:274"],
    note: "自動化ワークフローのAnthropicモデル",
  },
  "automation-perplexity": {
    current: "sonar",
    provider: "perplexity",
    tier: "mini",
    usedIn: ["supabase/functions/run_automation/index.ts:303"],
    note: "自動化ワークフローのPerplexityモデル",
  },

  // ── Edge Function: generate_journal ─────────────────────────────
  "journal-openai": {
    current: "gpt-4.1-mini",
    provider: "openai",
    tier: "mini",
    usedIn: ["supabase/functions/generate_journal/index.ts:107"],
    note: "ジャーナル生成のOpenAIモデル",
  },
  "journal-anthropic": {
    current: "claude-sonnet-4-6",
    provider: "anthropic",
    tier: "primary",
    usedIn: ["supabase/functions/generate_journal/index.ts:137"],
    note: "ジャーナル生成のAnthropicモデル",
  },

  // ── Edge Function: proactive_agent ──────────────────────────────
  "proactive-openai": {
    current: "gpt-4.1-mini",
    provider: "openai",
    tier: "mini",
    usedIn: ["supabase/functions/proactive_agent/index.ts:310"],
    note: "プロアクティブエージェントのOpenAIモデル",
  },
  "proactive-anthropic": {
    current: "claude-sonnet-4-6",
    provider: "anthropic",
    tier: "primary",
    usedIn: ["supabase/functions/proactive_agent/index.ts:345"],
    note: "プロアクティブエージェントのAnthropicモデル",
  },

  // ── App.tsx (inline) ────────────────────────────────────────────
  "app-gemini-flash": {
    current: "gemini-2.5-flash",
    provider: "google",
    tier: "mini",
    usedIn: ["src/App.tsx:366"],
    note: "アプリ内の軽量Geminiモデル",
  },
};

// ── ヘルパー ──────────────────────────────────────────────────────────

/** プロバイダー別にモデル一覧を返す */
export function getModelsByProvider(
  provider: ModelEntry["provider"],
): Record<string, ModelEntry> {
  return Object.fromEntries(
    Object.entries(MODEL_REGISTRY).filter(([, v]) => v.provider === provider),
  );
}

/** 使用中のユニークモデル名一覧を返す */
export function getUniqueModels(): string[] {
  return [...new Set(Object.values(MODEL_REGISTRY).map((e) => e.current))];
}

/** レジストリのサマリーをMarkdown形式で生成 */
export function getRegistrySummary(): string {
  const lines: string[] = ["# 現在使用中のAIモデル一覧\n"];

  const byProvider = new Map<string, ModelEntry[]>();
  for (const entry of Object.values(MODEL_REGISTRY)) {
    const list = byProvider.get(entry.provider) ?? [];
    list.push(entry);
    byProvider.set(entry.provider, list);
  }

  for (const [provider, entries] of byProvider) {
    lines.push(`## ${provider}`);
    const unique = [...new Set(entries.map((e) => e.current))];
    for (const model of unique) {
      const locations = entries
        .filter((e) => e.current === model)
        .flatMap((e) => e.usedIn);
      lines.push(
        `- **${model}** (${locations.length}箇所): ${locations.join(", ")}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
