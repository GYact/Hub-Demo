import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

// ── Types ──────────────────────────────────────────────────

type ProactiveInsight = {
  id: string;
  title: string;
  body: string;
  priority: "low" | "medium" | "high" | "urgent";
  category_hint?: string;
};

type LlmResponse = {
  insights: ProactiveInsight[];
};

type ProactiveAgentSettings = {
  enabled: boolean;
  ai_model: "gemini" | "openai" | "anthropic";
  data_sources: {
    tasks: boolean;
    calendar: boolean;
    gmail: boolean;
    invoices: boolean;
    switchbot: boolean;
    projects: boolean;
    memos: boolean;
    media_feed?: boolean;
    automations?: boolean;
    journal?: boolean;
    subscriptions?: boolean;
    clients?: boolean;
    certifications?: boolean;
    assets?: boolean;
    investments?: boolean;
  };
  push_high_only: boolean;
  temperature?: number;
  max_insights?: number;
  max_tokens?: number;
  category_cooldown_hours?: number;
  min_interval_minutes?: number;
  response_language?: "ja" | "en";
  custom_instructions?: string;
  team_mode?: boolean;
  agent_roles?: Record<string, { enabled: boolean }>;
};

type LlmCallOptions = {
  temperature: number;
  maxTokens: number;
};

type TaskItem = {
  title: string;
  due_date: string;
  due_time?: string;
  is_starred?: boolean;
  notes_preview?: string;
};

type CalendarItem = {
  summary: string;
  start_time: string;
  end_time: string;
  location?: string;
  description_preview?: string;
  attendee_count?: number;
};

type DataSnapshot = {
  tasks?: {
    overdue: TaskItem[];
    due_today: TaskItem[];
    due_tomorrow: TaskItem[];
    total_pending: number;
    starred_count: number;
  };
  calendar?: {
    today: CalendarItem[];
    tomorrow: CalendarItem[];
  };
  gmail?: {
    unread_count: number;
    recent_unread: {
      subject: string;
      sender: string;
      date: string;
      snippet?: string;
      has_attachments?: boolean;
    }[];
  };
  invoices?: {
    outstanding: {
      invoice_number: string;
      amount: number;
      currency: string;
      due_date: string;
      status: string;
    }[];
    total_outstanding_jpy: number;
    note: string;
  };
  expenses?: {
    this_month_total: number;
    this_month_count: number;
    by_category: { category: string; total: number; count: number }[];
  };
  projects?: {
    recently_updated: {
      name: string;
      updated_at: string;
      status?: string;
      description_preview?: string;
    }[];
  };
  switchbot?: {
    anomalies: { device_name: string; metric: string; value: number }[];
    latest_readings: {
      device_name: string;
      device_type?: string;
      temperature?: number;
      humidity?: number;
    }[];
    low_battery: { device_name: string; battery: number }[];
  };
  memos?: {
    recent: {
      title: string;
      content_preview?: string;
      updated_at: string;
    }[];
  };
  media_feed?: {
    unread_count: number;
    recent: {
      source: string;
      title: string;
      priority: string;
      created_at: string;
    }[];
  };
  automations?: {
    recent_errors: {
      automation_name: string;
      error_message: string;
      started_at: string;
    }[];
    total_runs_24h: number;
    error_count_24h: number;
  };
  journal?: {
    recent: {
      entry_date: string;
      title: string;
      mood: string;
      content_preview?: string;
    }[];
    days_since_last_entry: number | null;
  };
  subscriptions?: {
    upcoming_renewals: {
      name: string;
      amount: number;
      currency: string;
      next_billing_date: string;
      billing_cycle: string;
    }[];
    total_monthly_jpy: number;
    active_count: number;
  };
  clients?: {
    prospects: { name: string; created_at: string }[];
    active_count: number;
    inactive_count: number;
  };
  certifications_data?: {
    expiring_soon: {
      name: string;
      issuing_organization: string;
      expiry_year: number;
      expiry_month: number;
    }[];
    total_count: number;
  };
  assets_data?: {
    summary: {
      asset_type: string;
      total_jpy: number;
      count: number;
    }[];
    total_jpy: number;
  };
  investments?: {
    holdings: {
      symbol: string;
      name: string;
      quantity: number;
      avg_cost: number;
      currency: string;
    }[];
    active_alerts: {
      symbol: string;
      target_price: number;
      condition: string;
    }[];
    holding_count: number;
    alert_count: number;
  };
};

// ── Environment ────────────────────────────────────────────

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const DEFAULT_SETTINGS: ProactiveAgentSettings = {
  enabled: true,
  ai_model: "gemini",
  data_sources: {
    tasks: true,
    calendar: true,
    gmail: true,
    invoices: true,
    switchbot: true,
    projects: true,
    memos: true,
    media_feed: true,
    automations: true,
    journal: true,
    subscriptions: true,
    clients: true,
    certifications: true,
    assets: true,
    investments: true,
  },
  push_high_only: true,
  temperature: 0.3,
  max_insights: 5,
  max_tokens: 2048,
  category_cooldown_hours: 6,
  min_interval_minutes: 30,
  response_language: "ja",
  custom_instructions: "",
  team_mode: true,
};

// ── LLM Calls ──────────────────────────────────────────────

const callGeminiJson = async (
  systemPrompt: string,
  userMessage: string,
  opts: LlmCallOptions,
): Promise<string> => {
  if (!geminiApiKey) throw new Error("Gemini API key not configured");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
          },
        ],
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxTokens,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '{"insights":[]}';
};

const callOpenAIJson = async (
  systemPrompt: string,
  userMessage: string,
  opts: LlmCallOptions,
): Promise<string> => {
  if (!openaiApiKey) throw new Error("OpenAI API key not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '{"insights":[]}';
};

const callAnthropicJson = async (
  systemPrompt: string,
  userMessage: string,
  opts: LlmCallOptions,
): Promise<string> => {
  if (!anthropicApiKey) throw new Error("Anthropic API key not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      system: systemPrompt,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '{"insights":[]}';
};

// ── LLM Helpers ───────────────────────────────────────────

const callLlm = async (
  model: string,
  systemPrompt: string,
  userMessage: string,
  opts: LlmCallOptions,
): Promise<string> => {
  if (model === "anthropic")
    return callAnthropicJson(systemPrompt, userMessage, opts);
  if (model === "openai")
    return callOpenAIJson(systemPrompt, userMessage, opts);
  return callGeminiJson(systemPrompt, userMessage, opts);
};

const parseLlmResponse = (raw: string): LlmResponse => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.insights)) return parsed;
    return { insights: [] };
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.insights)) return parsed;
      } catch {
        /* fall through */
      }
    }
    return { insights: [] };
  }
};

// ── Agent Team Definitions ────────────────────────────────

type AgentRole = {
  name: string;
  label: string;
  dataSources: string[];
  categories: string[];
  snapshotKeys: string[];
  maxTokens: number;
};

const AGENT_ROLES: AgentRole[] = [
  {
    name: "taskmaster",
    label: "TaskMaster",
    dataSources: ["tasks", "calendar"],
    categories: ["task", "calendar", "suggestion"],
    snapshotKeys: ["tasks", "calendar"],
    maxTokens: 768,
  },
  {
    name: "finance_ops",
    label: "FinanceOps",
    dataSources: [
      "invoices",
      "subscriptions",
      "assets",
      "clients",
      "investments",
    ],
    categories: ["finance", "client"],
    snapshotKeys: [
      "invoices",
      "expenses",
      "subscriptions",
      "clients",
      "assets_data",
      "investments",
    ],
    maxTokens: 768,
  },
  {
    name: "wellness_coach",
    label: "WellnessCoach",
    dataSources: ["journal"],
    categories: ["journal", "suggestion"],
    snapshotKeys: ["journal"],
    maxTokens: 512,
  },
  {
    name: "tech_ops",
    label: "TechOps",
    dataSources: ["switchbot", "automations"],
    categories: ["smart_home", "automation"],
    snapshotKeys: ["switchbot", "automations"],
    maxTokens: 512,
  },
  {
    name: "info_curator",
    label: "InfoCurator",
    dataSources: ["media_feed", "gmail", "projects", "memos", "certifications"],
    categories: ["media", "general", "certification"],
    snapshotKeys: [
      "media_feed",
      "gmail",
      "projects",
      "memos",
      "certifications_data",
    ],
    maxTokens: 768,
  },
];

const SPECIALIST_CRITERIA: Record<string, string> = {
  taskmaster: `## 判断基準
- ★付き(is_starred)タスクの期限切れ → priority: "urgent"
- 期限切れのタスク → priority: "urgent"
- 今日期限のタスク・今日の予定のリマインド → priority: "high"
  - due_timeがある場合は時刻込みでリマインドする
  - カレンダーにlocationがある場合は移動時間を考慮した助言を含める
- 明日期限のタスク → priority: "medium"
- タスクのnotesも参考にして具体的な助言を提供する
- タスクとカレンダーを横断的に分析し、スケジュール提案がある場合 → category_hint: "suggestion"`,

  finance_ops: `## 判断基準
- 未回収の請求書（発行済みで入金待ちの売掛金）→ priority: "high"（期限超過の場合のみ。期限内なら "medium" に下げる）
- 支出カテゴリの偏りや急増（by_category） → priority: "low"
- サブスクリプションの更新が近い（3日以内） → priority: "medium"（月額・年額問わず更新3日前から通知。それ以前は通知しない）
- 月額サブスク総額が高い場合の節約提案 → priority: "low"
- 見込み客（prospect）のフォローアップ提案 → priority: "low"（category_hint: "client"）
- 資産ポートフォリオの偏りや変動 → priority: "low"
- 投資アラート（price_above/below）が発火条件に近い → priority: "medium"
- 保有銘柄が1-2銘柄に集中している場合の分散提案 → priority: "low"`,

  wellness_coach: `## 判断基準
- 日記の記録が3日以上途絶えている → priority: "low"（リマインド）
- 日記のmood傾向（stressed/sadが続く場合） → priority: "medium"
- ポジティブなmoodが続く場合も肯定的なフィードバック → priority: "low"
- ウェルネスに関する提案 → category_hint: "suggestion"`,

  tech_ops: `## 判断基準
- スマートホーム異常値 → priority: "high"
- IoTデバイスのバッテリー残量低下（low_battery） → priority: "medium"
- 自動化エラーが発生している → priority: "high"（category_hint: "automation"）`,

  info_curator: `## 判断基準
- 未返信の重要メール → priority: "medium"
  - 添付ファイル付き(has_attachments)の未読メールは対応が必要な可能性が高い
  - snippetの内容から緊急性を判断する
- メディアフィード（RSS/X）の未読が多い・重要度highの投稿 → priority: "medium"（※Slackの未読についてはinsightを生成しない）
- プロジェクト進捗やメモの内容から関連する気づき → priority: "low"
- 資格・証明書の有効期限が近い（6ヶ月以内） → priority: "high"（category_hint: "certification"）`,
};

const buildSpecialistPrompt = (
  role: AgentRole,
  settings: ProactiveAgentSettings,
): string => {
  const lang = settings.response_language ?? "ja";
  const langInstruction =
    lang === "en" ? "- Respond in English" : "- 日本語で回答する";
  const allowedCategories = role.categories.map((c) => `"${c}"`).join(", ");

  return `あなたは${role.label}エージェントです。担当データを分析し、通知すべき事項をJSON形式で返してください。

${SPECIALIST_CRITERIA[role.name] ?? ""}

## ルール
- 最大3件のinsightに絞る
- 各insightに一意のidを付ける（例: "${role.name}-overdue-tasks"）
- bodyはMarkdown形式で簡潔に（80〜200文字）
- 複数の同種データはまとめて1件にする
${langInstruction}
- 必ず有効なJSONのみを返す
- category_hintは必ず以下から選ぶ: ${allowedCategories}
- 同じcategory_hintのinsightを複数生成しない

## 重複回避ルール
- 「直近12時間に送信済みの通知」セクションを確認し、同カテゴリは状況変化がない限り生成しない
- 変化がなければ空配列を返す

## 出力JSON形式
{
  "insights": [
    {
      "id": "string",
      "title": "string",
      "body": "string (markdown)",
      "priority": "low" | "medium" | "high" | "urgent",
      "category_hint": ${allowedCategories}
    }
  ]
}`;
};

const buildCoordinatorPrompt = (settings: ProactiveAgentSettings): string => {
  const maxInsights = settings.max_insights ?? 5;
  const lang = settings.response_language ?? "ja";
  const langInstruction =
    lang === "en" ? "- Respond in English" : "- 日本語で回答する";
  const customInstructions = (settings.custom_instructions ?? "").slice(0, 500);
  const customSection = customInstructions.trim()
    ? `\n\n## ユーザー追加指示\n${customInstructions.trim()}`
    : "";

  return `あなたはProactive Agent Teamのコーディネーターです。
複数のスペシャリストエージェントが生成したinsightsを統合・編集し、最終出力を作成してください。

## あなたの役割
1. 重複排除: 同じ事象を複数エージェントが報告している場合、最も優先度が高い方を採用
2. 優先度順位付け: urgent > high > medium > low の順にソート
3. クロスドメイン提案: 複数ドメインのデータを横断した提案がある場合、category_hint: "suggestion" で追加
   - 例: 「タスク期限とカレンダー予定の組み合わせ提案」「支出傾向とサブスク更新の関連分析」
4. **アクション提案の強化**: insightは「AI Tasks」タスクリストに自動追加される。以下を積極的に提案する:
   - 事業やプロジェクトに繋がるアイデア・機会
   - やると面白そうな試みや実験
   - データから読み取れる改善アクション
   - 各insightのbodyには具体的な次のステップを1〜2行で含める
5. 最終出力を最大${maxInsights}件に絞る
6. 各insightのbodyは必要に応じて編集・改善する（情報の正確性は維持）

## ルール
${langInstruction}
- 必ず有効なJSONのみを返す
- スペシャリストが出力したinsightのid, category_hintはそのまま維持する
- クロスドメイン提案のidは "coordinator-suggestion-xxx" 形式にする
- category_hintは必ず以下から選ぶ: "task", "calendar", "finance", "smart_home", "general", "suggestion", "media", "automation", "journal", "client", "certification"

## 出力JSON形式
{
  "insights": [
    {
      "id": "string",
      "title": "string",
      "body": "string (markdown)",
      "priority": "low" | "medium" | "high" | "urgent",
      "category_hint": "string"
    }
  ]
}${customSection}`;
};

// ── Data Collection ────────────────────────────────────────

const collectTaskData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  todayStr: string,
  tomorrowStr: string,
) => {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("title, status, due_date, due_time, is_starred, notes")
    .eq("user_id", userId)
    .eq("status", "needsAction")
    .not("due_date", "is", null)
    .order("due_date", { ascending: true })
    .limit(50);

  if (!tasks || tasks.length === 0) {
    return {
      overdue: [],
      due_today: [],
      due_tomorrow: [],
      total_pending: 0,
      starred_count: 0,
    };
  }

  const mapTask = (t: (typeof tasks)[0]): TaskItem => ({
    title: t.title,
    due_date: t.due_date,
    ...(t.due_time ? { due_time: t.due_time } : {}),
    ...(t.is_starred ? { is_starred: true } : {}),
    ...(t.notes ? { notes_preview: t.notes.slice(0, 80) } : {}),
  });

  const overdue = tasks
    .filter((t) => t.due_date < todayStr)
    .slice(0, 10)
    .map(mapTask);
  const due_today = tasks.filter((t) => t.due_date === todayStr).map(mapTask);
  const due_tomorrow = tasks
    .filter((t) => t.due_date === tomorrowStr)
    .map(mapTask);

  return {
    overdue,
    due_today,
    due_tomorrow,
    total_pending: tasks.length,
    starred_count: tasks.filter((t) => t.is_starred).length,
  };
};

/** Convert a UTC timestamp string to JST date string (YYYY-MM-DD) */
const toJstDate = (utcStr: string): string => {
  const jst = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
};

/** Convert a UTC timestamp string to JST time string (HH:mm) */
const toJstTime = (utcStr: string): string => {
  const jst = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(11, 16);
};

const collectCalendarData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  todayStr: string,
  tomorrowStr: string,
) => {
  const dayAfterTomorrow = new Date(tomorrowStr + "T00:00:00+09:00");
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  const dayAfterEndUtc = dayAfterTomorrow.toISOString();

  // Query using JST boundaries (start_time is timestamptz, Postgres handles +09:00)
  const { data: events } = await supabase
    .from("google_calendar_events")
    .select("summary, start_time, end_time, location, description, attendees")
    .eq("user_id", userId)
    .gte("start_time", `${todayStr}T00:00:00+09:00`)
    .lt("start_time", dayAfterEndUtc)
    .order("start_time", { ascending: true })
    .limit(20);

  if (!events || events.length === 0) {
    return { today: [], tomorrow: [] };
  }

  const mapEvent = (e: (typeof events)[0]): CalendarItem => ({
    summary: e.summary || "（タイトルなし）",
    start_time: e.start_time ? toJstTime(e.start_time) : "",
    end_time: e.end_time ? toJstTime(e.end_time) : "",
    ...(e.location ? { location: e.location } : {}),
    ...(e.description
      ? { description_preview: e.description.slice(0, 100) }
      : {}),
    ...(Array.isArray(e.attendees) && e.attendees.length > 0
      ? { attendee_count: e.attendees.length }
      : {}),
  });

  // Filter by JST date and format times as JST HH:mm
  const today = events
    .filter((e) => e.start_time && toJstDate(e.start_time) === todayStr)
    .map(mapEvent);
  const tomorrow = events
    .filter((e) => e.start_time && toJstDate(e.start_time) === tomorrowStr)
    .map(mapEvent);

  return { today, tomorrow };
};

const collectGmailData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { count } = await supabase
    .from("google_gmail_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  const { data: recent } = await supabase
    .from("google_gmail_messages")
    .select("subject, sender, date, snippet, has_attachments")
    .eq("user_id", userId)
    .eq("is_read", false)
    .order("date", { ascending: false })
    .limit(10);

  return {
    unread_count: count ?? 0,
    recent_unread: (recent ?? []).map((m) => ({
      subject: m.subject || "（件名なし）",
      sender: m.sender || "",
      date: m.date || "",
      ...(m.snippet ? { snippet: m.snippet.slice(0, 120) } : {}),
      ...(m.has_attachments ? { has_attachments: true } : {}),
    })),
  };
};

const collectInvoiceData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: invoices } = await supabase
    .from("invoices")
    .select("invoice_number, amount, currency, due_date, status")
    .eq("user_id", userId)
    .in("status", ["issued", "overdue"])
    .order("due_date", { ascending: true })
    .limit(20);

  if (!invoices || invoices.length === 0) {
    return {
      outstanding: [],
      total_outstanding_jpy: 0,
      note: "自分が発行した請求書の入金待ち（売掛金）",
    };
  }

  const rates: Record<string, number> = { JPY: 1, USD: 155, EUR: 165 };
  const total_outstanding_jpy = invoices.reduce(
    (sum, inv) => sum + (inv.amount ?? 0) * (rates[inv.currency ?? "JPY"] ?? 1),
    0,
  );

  return {
    outstanding: invoices.map((inv) => ({
      invoice_number: inv.invoice_number,
      amount: inv.amount,
      currency: inv.currency,
      due_date: inv.due_date,
      status: inv.status,
    })),
    total_outstanding_jpy: Math.round(total_outstanding_jpy),
    note: "自分が発行した請求書の入金待ち（売掛金）。期限超過(overdue)でなければリスクではない",
  };
};

const collectExpenseData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const firstOfMonth = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, category")
    .eq("user_id", userId)
    .gte("expense_date", firstOfMonth);

  if (!expenses || expenses.length === 0) {
    return { this_month_total: 0, this_month_count: 0, by_category: [] };
  }

  const catMap: Record<string, { total: number; count: number }> = {};
  for (const e of expenses) {
    const cat = e.category || "other";
    if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
    catMap[cat].total += e.amount ?? 0;
    catMap[cat].count++;
  }

  return {
    this_month_total: Math.round(
      expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    ),
    this_month_count: expenses.length,
    by_category: Object.entries(catMap).map(([category, v]) => ({
      category,
      total: Math.round(v.total),
      count: v.count,
    })),
  };
};

const collectProjectData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: projects } = await supabase
    .from("projects")
    .select("name, updated_at, status, description")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(5);

  return {
    recently_updated: (projects ?? []).map((p) => ({
      name: p.name,
      updated_at: p.updated_at,
      ...(p.status ? { status: p.status } : {}),
      ...(p.description
        ? { description_preview: p.description.slice(0, 80) }
        : {}),
    })),
  };
};

const collectSwitchBotData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: records } = await supabase
    .from("switchbot_status_history")
    .select("device_name, device_type, temperature, humidity, battery")
    .eq("user_id", userId)
    .gte("recorded_at", oneHourAgo)
    .order("recorded_at", { ascending: false })
    .limit(20);

  const anomalies: { device_name: string; metric: string; value: number }[] =
    [];
  const low_battery: { device_name: string; battery: number }[] = [];
  const seen = new Set<string>();
  const latest_readings: {
    device_name: string;
    device_type?: string;
    temperature?: number;
    humidity?: number;
  }[] = [];

  for (const r of records ?? []) {
    // Latest reading per device (first occurrence = most recent)
    if (!seen.has(r.device_name)) {
      seen.add(r.device_name);
      latest_readings.push({
        device_name: r.device_name,
        ...(r.device_type ? { device_type: r.device_type } : {}),
        ...(r.temperature != null ? { temperature: r.temperature } : {}),
        ...(r.humidity != null ? { humidity: r.humidity } : {}),
      });
      if (r.battery != null && r.battery < 20) {
        low_battery.push({ device_name: r.device_name, battery: r.battery });
      }
    }

    if (r.temperature != null && (r.temperature > 32 || r.temperature < 5)) {
      anomalies.push({
        device_name: r.device_name,
        metric: "temperature",
        value: r.temperature,
      });
    }
    if (r.humidity != null && (r.humidity > 80 || r.humidity < 20)) {
      anomalies.push({
        device_name: r.device_name,
        metric: "humidity",
        value: r.humidity,
      });
    }
  }

  return { anomalies, latest_readings, low_battery };
};

const collectMemoData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: memos } = await supabase
    .from("memos")
    .select("title, content, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(5);

  return {
    recent: (memos ?? []).map((m) => ({
      title: m.title || "（無題）",
      ...(m.content ? { content_preview: m.content.slice(0, 100) } : {}),
      updated_at: m.updated_at,
    })),
  };
};

// ── New Data Collectors ────────────────────────────────────

const collectMediaFeedData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("media_feed_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  const { data: recent } = await supabase
    .from("media_feed_items")
    .select("source, title, priority, created_at")
    .eq("user_id", userId)
    .eq("is_read", false)
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    unread_count: count ?? 0,
    recent: (recent ?? []).map((r) => ({
      source: r.source,
      title: (r.title || "").slice(0, 80),
      priority: r.priority,
      created_at: r.created_at,
    })),
  };
};

const collectAutomationData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: runs } = await supabase
    .from("ai_automation_runs")
    .select("status, error_message, started_at, automation_id")
    .eq("user_id", userId)
    .gte("started_at", oneDayAgo)
    .order("started_at", { ascending: false })
    .limit(50);

  const allRuns = runs ?? [];
  const errors = allRuns.filter((r) => r.status === "error");

  // Get automation names for errors
  const errorAutomationIds = [...new Set(errors.map((e) => e.automation_id))];
  let automationNames: Record<string, string> = {};
  if (errorAutomationIds.length > 0) {
    const { data: automations } = await supabase
      .from("ai_automations")
      .select("id, name")
      .in("id", errorAutomationIds);
    automationNames = Object.fromEntries(
      (automations ?? []).map((a) => [a.id, a.name]),
    );
  }

  return {
    recent_errors: errors.slice(0, 5).map((e) => ({
      automation_name: automationNames[e.automation_id] || e.automation_id,
      error_message: (e.error_message || "").slice(0, 100),
      started_at: e.started_at,
    })),
    total_runs_24h: allRuns.length,
    error_count_24h: errors.length,
  };
};

const collectJournalData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("entry_date, title, mood, content")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .limit(5);

  const recent = (entries ?? []).map((e) => ({
    entry_date: e.entry_date,
    title: e.title || "",
    mood: e.mood,
    ...(e.content ? { content_preview: e.content.slice(0, 100) } : {}),
  }));

  let daysSinceLast: number | null = null;
  if (entries && entries.length > 0) {
    const lastDate = new Date(entries[0].entry_date);
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
    daysSinceLast = Math.floor(
      (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return { recent, days_since_last_entry: daysSinceLast };
};

const collectSubscriptionData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("name, amount, currency, billing_cycle, next_billing_date, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("next_billing_date", { ascending: true });

  const activeSubs = subs ?? [];

  // Simple JPY conversion rates
  const toJpy: Record<string, number> = {
    JPY: 1,
    USD: 150,
    EUR: 163,
    GBP: 190,
  };

  // Calculate monthly equivalent
  const cycleMultiplier: Record<string, number> = {
    monthly: 1,
    quarterly: 1 / 3,
    "semi-annual": 1 / 6,
    annual: 1 / 12,
  };

  let totalMonthlyJpy = 0;
  for (const s of activeSubs) {
    const rate = toJpy[s.currency] ?? 1;
    const mult = cycleMultiplier[s.billing_cycle] ?? 1;
    totalMonthlyJpy += s.amount * rate * mult;
  }

  // Upcoming renewals within 3 days
  const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const upcoming = activeSubs.filter(
    (s) => s.next_billing_date && s.next_billing_date <= threeDaysLater,
  );

  return {
    upcoming_renewals: upcoming.slice(0, 10).map((s) => ({
      name: s.name,
      amount: s.amount,
      currency: s.currency,
      next_billing_date: s.next_billing_date,
      billing_cycle: s.billing_cycle,
    })),
    total_monthly_jpy: Math.round(totalMonthlyJpy),
    active_count: activeSubs.length,
  };
};

const collectClientData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: clients } = await supabase
    .from("clients")
    .select("name, status, created_at")
    .eq("user_id", userId);

  const all = clients ?? [];
  const prospects = all
    .filter((c) => c.status === "prospect")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  return {
    prospects: prospects.map((c) => ({
      name: c.name,
      created_at: c.created_at,
    })),
    active_count: all.filter((c) => c.status === "active").length,
    inactive_count: all.filter((c) => c.status === "inactive").length,
  };
};

const collectCertificationData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: certs } = await supabase
    .from("certifications")
    .select(
      "name, issuing_organization, expiry_year, expiry_month, has_no_expiry",
    )
    .eq("user_id", userId);

  const all = certs ?? [];

  // Find expiring within 6 months
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const sixMonthsLater = currentMonth + 6;
  const targetYear = sixMonthsLater > 12 ? currentYear + 1 : currentYear;
  const targetMonth =
    sixMonthsLater > 12 ? sixMonthsLater - 12 : sixMonthsLater;

  const expiring = all.filter((c) => {
    if (c.has_no_expiry || !c.expiry_year) return false;
    if (c.expiry_year < currentYear) return true; // already expired
    if (c.expiry_year === currentYear && (c.expiry_month ?? 12) < currentMonth)
      return true;
    // Within 6 months
    if (c.expiry_year < targetYear) return true;
    if (c.expiry_year === targetYear && (c.expiry_month ?? 12) <= targetMonth)
      return true;
    return false;
  });

  return {
    expiring_soon: expiring.slice(0, 5).map((c) => ({
      name: c.name,
      issuing_organization: c.issuing_organization || "",
      expiry_year: c.expiry_year!,
      expiry_month: c.expiry_month ?? 12,
    })),
    total_count: all.length,
  };
};

const collectAssetData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: assets } = await supabase
    .from("assets")
    .select("asset_type, amount, currency")
    .eq("user_id", userId);

  const all = assets ?? [];
  const toJpy: Record<string, number> = {
    JPY: 1,
    USD: 150,
    EUR: 163,
    GBP: 190,
  };

  // Group by asset_type
  const byType: Record<string, { total: number; count: number }> = {};
  let totalJpy = 0;
  for (const a of all) {
    const rate = toJpy[a.currency] ?? 1;
    const jpy = a.amount * rate;
    totalJpy += jpy;
    if (!byType[a.asset_type]) byType[a.asset_type] = { total: 0, count: 0 };
    byType[a.asset_type].total += jpy;
    byType[a.asset_type].count += 1;
  }

  return {
    summary: Object.entries(byType).map(([type, v]) => ({
      asset_type: type,
      total_jpy: Math.round(v.total),
      count: v.count,
    })),
    total_jpy: Math.round(totalJpy),
  };
};

const collectInvestmentData = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
) => {
  const [{ data: holdingsData }, { data: alertsData }] = await Promise.all([
    supabase
      .from("invest_holdings")
      .select("symbol, name, quantity, avg_cost, currency")
      .eq("user_id", userId)
      .gt("quantity", 0),
    supabase
      .from("invest_alerts")
      .select("symbol, target_price, condition")
      .eq("user_id", userId)
      .eq("enabled", true)
      .is("triggered_at", null)
      .limit(10),
  ]);

  const holdings = (holdingsData ?? []).map((h: Record<string, unknown>) => ({
    symbol: h.symbol as string,
    name: h.name as string,
    quantity: Number(h.quantity) || 0,
    avg_cost: Number(h.avg_cost) || 0,
    currency: (h.currency as string) ?? "JPY",
  }));

  const activeAlerts = (alertsData ?? []).map((a: Record<string, unknown>) => ({
    symbol: a.symbol as string,
    target_price: Number(a.target_price) || 0,
    condition: (a.condition as string) ?? "above",
  }));

  return {
    holdings,
    active_alerts: activeAlerts,
    holding_count: holdings.length,
    alert_count: activeAlerts.length,
  };
};

// ── Dedup Utilities ───────────────────────────────────────

/** Create a stable fingerprint of the data snapshot for change detection */
const computeSnapshotFingerprint = async (
  snapshot: DataSnapshot,
): Promise<string> => {
  // Build a deterministic string from the meaningful parts of the snapshot
  const parts: string[] = [];

  if (snapshot.tasks) {
    parts.push(
      `tasks:overdue=${snapshot.tasks.overdue.length},today=${snapshot.tasks.due_today.length},tomorrow=${snapshot.tasks.due_tomorrow.length},pending=${snapshot.tasks.total_pending}`,
    );
    // Include overdue task titles for change detection
    for (const t of snapshot.tasks.overdue) parts.push(`t:${t.title}`);
    for (const t of snapshot.tasks.due_today) parts.push(`t:${t.title}`);
  }
  if (snapshot.calendar) {
    parts.push(
      `cal:today=${snapshot.calendar.today.length},tomorrow=${snapshot.calendar.tomorrow.length}`,
    );
    for (const e of snapshot.calendar.today)
      parts.push(`c:${e.summary}@${e.start_time}`);
    for (const e of snapshot.calendar.tomorrow)
      parts.push(`c:${e.summary}@${e.start_time}`);
  }
  if (snapshot.gmail) {
    parts.push(`gmail:unread=${snapshot.gmail.unread_count}`);
    for (const m of snapshot.gmail.recent_unread) parts.push(`m:${m.subject}`);
  }
  if (snapshot.invoices) {
    parts.push(
      `inv:count=${snapshot.invoices.outstanding.length},total=${snapshot.invoices.total_outstanding_jpy}`,
    );
  }
  if (snapshot.projects) {
    for (const p of snapshot.projects.recently_updated)
      parts.push(`p:${p.name}@${p.updated_at}`);
  }
  if (snapshot.switchbot) {
    parts.push(
      `sb:anomalies=${snapshot.switchbot.anomalies.length},lowbat=${snapshot.switchbot.low_battery.length}`,
    );
  }
  if (snapshot.memos) {
    for (const m of snapshot.memos.recent)
      parts.push(`memo:${m.title}@${m.updated_at}`);
  }
  if (snapshot.media_feed) {
    parts.push(`mf:unread=${snapshot.media_feed.unread_count}`);
    for (const r of snapshot.media_feed.recent)
      parts.push(`mf:${r.source}:${r.title}`);
  }
  if (snapshot.automations) {
    parts.push(
      `auto:runs=${snapshot.automations.total_runs_24h},err=${snapshot.automations.error_count_24h}`,
    );
  }
  if (snapshot.journal) {
    parts.push(`journal:days=${snapshot.journal.days_since_last_entry}`);
    for (const j of snapshot.journal.recent)
      parts.push(`j:${j.entry_date}:${j.mood}`);
  }
  if (snapshot.subscriptions) {
    parts.push(
      `subs:active=${snapshot.subscriptions.active_count},monthly=${snapshot.subscriptions.total_monthly_jpy}`,
    );
    for (const s of snapshot.subscriptions.upcoming_renewals)
      parts.push(`sub:${s.name}@${s.next_billing_date}`);
  }
  if (snapshot.clients) {
    parts.push(
      `clients:active=${snapshot.clients.active_count},prospect=${snapshot.clients.prospects.length}`,
    );
  }
  if (snapshot.certifications_data) {
    parts.push(
      `certs:total=${snapshot.certifications_data.total_count},expiring=${snapshot.certifications_data.expiring_soon.length}`,
    );
  }
  if (snapshot.assets_data) {
    parts.push(`assets:total=${snapshot.assets_data.total_jpy}`);
  }
  if (snapshot.investments) {
    parts.push(
      `invest:holdings=${snapshot.investments.holding_count},alerts=${snapshot.investments.alert_count}`,
    );
  }

  const raw = parts.join("|");
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/** Category-based cooldown: minimum hours between same category_hint */
const getCategoryCooldowns = (hours: number): Record<string, number> => ({
  task: hours,
  calendar: hours,
  finance: hours,
  smart_home: hours,
  general: hours,
  suggestion: Math.max(1, Math.floor(hours / 2)),
  media: hours,
  automation: Math.max(1, Math.floor(hours / 2)),
  journal: hours * 2,
  client: hours,
  certification: hours * 4,
});

// ── System Prompt ──────────────────────────────────────────

const buildSystemPrompt = (settings: ProactiveAgentSettings): string => {
  const maxInsights = settings.max_insights ?? 5;
  const lang = settings.response_language ?? "ja";
  const customInstructions = (settings.custom_instructions ?? "").slice(0, 500);

  const langInstruction =
    lang === "en" ? "- Respond in English" : "- 日本語で回答する";

  const customSection = customInstructions.trim()
    ? `\n\n## ユーザー追加指示\n${customInstructions.trim()}`
    : "";

  return `あなたはユーザーの個人データを分析するプロアクティブAIアシスタントです。
以下のデータを分析し、ユーザーに通知すべき重要な事項をJSON形式で返してください。

## 判断基準
- ★付き(is_starred)タスクの期限切れ → priority: "urgent"（通常タスクより重要度が高い）
- 期限切れのタスク → priority: "urgent"
- 今日期限のタスク・今日の予定のリマインド → priority: "high"
  - due_timeがある場合は時刻込みでリマインドする
  - カレンダーにlocationがある場合は移動時間を考慮した助言を含める
- 明日期限のタスク・未返信の重要メール → priority: "medium"
  - 添付ファイル付き(has_attachments)の未読メールは対応が必要な可能性が高い
  - snippetの内容から緊急性を判断する
- 未回収の請求書（発行済みで入金待ち）→ priority: "high"（期限超過の場合のみ。期限内なら "medium" に下げる）
- スマートホーム異常値 → priority: "high"
- IoTデバイスのバッテリー残量低下（low_battery） → priority: "medium"
- 支出カテゴリの偏りや急増（by_category） → priority: "low"
- プロジェクト進捗やメモの内容から関連する気づき → priority: "low"
- メディアフィード（RSS/X）の未読が多い・重要度highの投稿 → priority: "medium"（※Slackの未読についてはinsightを生成しない）
- 自動化エラーが発生している → priority: "high"（category_hint: "automation"）
- 日記の記録が3日以上途絶えている → priority: "low"（リマインド）
- 日記のmood傾向（stressed/sadが続く場合） → priority: "medium"
- サブスクリプションの更新が近い（3日以内） → priority: "medium"（category_hint: "finance"）（月額・年額問わず更新3日前から通知。それ以前は通知しない）
- 月額サブスク総額が高い場合の節約提案 → priority: "low"
- 見込み客（prospect）のフォローアップ提案 → priority: "low"
- 資格・証明書の有効期限が近い（6ヶ月以内） → priority: "high"（category_hint: "certification"）
- 資産ポートフォリオの偏りや変動 → priority: "low"
- データを横断的に分析し、ユーザーが気づいていない提案やアイデアがあれば → category_hint: "suggestion", priority: "low"
  - 例: 「このタスクと来週の予定を組み合わせると〇〇できそう」「メモの内容から△△を検討しては？」
  - ユーザーにとって有益で面白い視点・行動提案を心がける
  - 毎回異なる切り口で提案する（前回と同じ提案は避ける）
- 何も報告すべきことがなければ、insightsを空配列にして返す

## 重要ルール
- 最大${maxInsights}件のinsightに絞る（本当に重要なもののみ）
- 各insightに一意のidを付ける（例: "overdue-tasks", "today-calendar", "unpaid-invoices"）
- bodyはMarkdown形式で簡潔に（100〜300文字）
- 複数の同種データはまとめて1件にする（タスク3件期限切れ → 1つのinsight）
- タスクのnotesやメモのcontent_previewも参考にして、より具体的な助言を提供する
${langInstruction}
- 必ず有効なJSONのみを返す（JSON以外のテキストを含めない）
- category_hintは必ず以下から選ぶ: "task", "calendar", "finance", "smart_home", "general", "suggestion", "media", "automation", "journal", "client", "certification"
  - "suggestion" = データを横断分析した提案・アイデア・気づき（ステータス報告ではないもの）
  - 同じcategory_hintのinsightを複数生成しない（1カテゴリ1件まで）

## 重複回避ルール（最重要 — 必ず従うこと）
- 「直近12時間に送信済みの通知」セクションを必ず確認する
- 送信済みの通知と同じカテゴリ[category_hint]の通知は、状況に明確な変化がない限り生成しない
  - 例: [task]の通知が送信済み → タスクの件数や内容が変わっていなければ[task]は生成しない
  - 例: [calendar]の通知が送信済み → 新たな予定追加がなければ[calendar]は生成しない
  - 例: [general]の通知が送信済み → プロジェクト/メモに新規更新がなければ[general]は生成しない
- 「未読メール確認」「プロジェクト進捗」「明日の予定」は特に重複しやすいテーマ — 送信済みなら絶対に繰り返さない
- 全てのテーマが送信済みで変化がなければ、insightsを空配列 [] にする
- 迷ったら生成しない（空配列を返す）

## 出力JSON形式
{
  "insights": [
    {
      "id": "string",
      "title": "string",
      "body": "string (markdown)",
      "priority": "low" | "medium" | "high" | "urgent",
      "category_hint": "task" | "calendar" | "finance" | "smart_home" | "general" | "suggestion"
    }
  ]
}${customSection}`;
};

// ── Main Handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase configuration", {
      status: 500,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Get all users (personal hub = typically 1 user)
  const {
    data: { users },
    error: usersError,
  } = await supabase.auth.admin.listUsers();

  if (usersError || !users || users.length === 0) {
    console.error("Failed to list users:", usersError);
    return new Response(JSON.stringify({ error: "No users found" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Record<string, unknown>[] = [];

  for (const user of users) {
    const userId = user.id;

    // Load settings
    const { data: settingsRow } = await supabase
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "proactive_agent_settings")
      .maybeSingle();

    const settings: ProactiveAgentSettings = {
      ...DEFAULT_SETTINGS,
      ...((settingsRow?.value as Partial<ProactiveAgentSettings>) ?? {}),
      data_sources: {
        ...DEFAULT_SETTINGS.data_sources,
        ...((settingsRow?.value as Partial<ProactiveAgentSettings>)
          ?.data_sources ?? {}),
      },
    };

    if (!settings.enabled) {
      results.push({ userId, skipped: true, reason: "disabled" });
      continue;
    }

    // Compute dates (JST)
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = jstNow.toISOString().split("T")[0];
    const tomorrow = new Date(jstNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    const currentDatetimeJst =
      jstNow.toISOString().replace("T", " ").slice(0, 16) + " JST";

    // Collect data in parallel
    const snapshot: DataSnapshot = {};

    const collectors: Promise<void>[] = [];

    if (settings.data_sources.tasks) {
      collectors.push(
        collectTaskData(supabase, userId, todayStr, tomorrowStr).then((d) => {
          snapshot.tasks = d;
        }),
      );
    }
    if (settings.data_sources.calendar) {
      collectors.push(
        collectCalendarData(supabase, userId, todayStr, tomorrowStr).then(
          (d) => {
            snapshot.calendar = d;
          },
        ),
      );
    }
    if (settings.data_sources.gmail) {
      collectors.push(
        collectGmailData(supabase, userId).then((d) => {
          snapshot.gmail = d;
        }),
      );
    }
    if (settings.data_sources.invoices) {
      collectors.push(
        collectInvoiceData(supabase, userId).then((d) => {
          snapshot.invoices = d;
        }),
      );
    }
    if (settings.data_sources.projects) {
      collectors.push(
        collectProjectData(supabase, userId).then((d) => {
          snapshot.projects = d;
        }),
      );
    }
    if (settings.data_sources.switchbot) {
      collectors.push(
        collectSwitchBotData(supabase, userId).then((d) => {
          snapshot.switchbot = d;
        }),
      );
    }
    if (settings.data_sources.memos) {
      collectors.push(
        collectMemoData(supabase, userId).then((d) => {
          snapshot.memos = d;
        }),
      );
    }

    // Also collect expenses (part of invoices data_source toggle)
    if (settings.data_sources.invoices) {
      collectors.push(
        collectExpenseData(supabase, userId).then((d) => {
          snapshot.expenses = d;
        }),
      );
    }

    // New data sources
    if (settings.data_sources.media_feed) {
      collectors.push(
        collectMediaFeedData(supabase, userId).then((d) => {
          snapshot.media_feed = d;
        }),
      );
    }
    if (settings.data_sources.automations) {
      collectors.push(
        collectAutomationData(supabase, userId).then((d) => {
          snapshot.automations = d;
        }),
      );
    }
    if (settings.data_sources.journal) {
      collectors.push(
        collectJournalData(supabase, userId).then((d) => {
          snapshot.journal = d;
        }),
      );
    }
    if (settings.data_sources.subscriptions) {
      collectors.push(
        collectSubscriptionData(supabase, userId).then((d) => {
          snapshot.subscriptions = d;
        }),
      );
    }
    if (settings.data_sources.clients) {
      collectors.push(
        collectClientData(supabase, userId).then((d) => {
          snapshot.clients = d;
        }),
      );
    }
    if (settings.data_sources.certifications) {
      collectors.push(
        collectCertificationData(supabase, userId).then((d) => {
          snapshot.certifications_data = d;
        }),
      );
    }
    if (settings.data_sources.assets) {
      collectors.push(
        collectAssetData(supabase, userId).then((d) => {
          snapshot.assets_data = d;
        }),
      );
    }
    if (settings.data_sources.investments) {
      collectors.push(
        collectInvestmentData(supabase, userId).then((d) => {
          snapshot.investments = d;
        }),
      );
    }

    await Promise.all(collectors);

    // Check if snapshot has any meaningful data
    const hasData = Object.keys(snapshot).length > 0;
    if (!hasData) {
      results.push({ userId, skipped: true, reason: "no_data_sources" });
      continue;
    }

    // ── Layer 0: Minimum interval check ──
    const { data: lastRunRow } = await supabase
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "proactive_agent_last_run")
      .maybeSingle();

    const lastRun = lastRunRow?.value as {
      timestamp?: string;
      fingerprint?: string;
      status?: string;
    } | null;

    const minInterval = settings.min_interval_minutes ?? 30;
    if (lastRun?.timestamp) {
      const elapsed =
        (Date.now() - new Date(lastRun.timestamp).getTime()) / (1000 * 60);
      if (elapsed < minInterval) {
        console.log(
          `[${userId}] Min interval not reached (${elapsed.toFixed(0)}m < ${minInterval}m)`,
        );
        results.push({ userId, skipped: true, reason: "min_interval" });
        continue;
      }
    }

    // ── Layer 1: Snapshot fingerprint — skip LLM if data unchanged ──
    const fingerprint = await computeSnapshotFingerprint(snapshot);

    if (lastRun?.fingerprint === fingerprint) {
      console.log(`[${userId}] Snapshot unchanged, skipping LLM call`);
      results.push({ userId, skipped: true, reason: "data_unchanged" });
      continue;
    }

    // ── Layer 2: Fetch recent notifications with full context ──
    const twelveHoursAgo = new Date(
      Date.now() - 12 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentNotifs } = await supabase
      .from("ai_notifications")
      .select("title, body, metadata, created_at")
      .eq("user_id", userId)
      .eq("source", "system")
      .gte("created_at", twelveHoursAgo)
      .order("created_at", { ascending: false })
      .limit(20);

    const recentSection =
      recentNotifs && recentNotifs.length > 0
        ? `\n\n## 直近12時間に送信済みの通知（これらと同じ内容は絶対に生成しないこと）\n${recentNotifs
            .map((n) => {
              const cat =
                (n.metadata as Record<string, unknown>)?.category_hint ??
                "unknown";
              const time = new Date(n.created_at).toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
                hour: "2-digit",
                minute: "2-digit",
              });
              const bodyPreview = (n.body || "").slice(0, 80);
              return `- [${cat}] ${n.title}（${time}）: ${bodyPreview}`;
            })
            .join("\n")}`
        : "";

    // Call LLM (single agent or team mode)
    let llmResponse: LlmResponse;

    if (settings.team_mode) {
      // ── Team Mode: Specialist agents + Coordinator ──
      const defaultRoles: Record<string, { enabled: boolean }> = {
        taskmaster: { enabled: true },
        finance_ops: { enabled: true },
        wellness_coach: { enabled: true },
        tech_ops: { enabled: true },
        info_curator: { enabled: true },
      };
      const roleConfigs = {
        ...defaultRoles,
        ...(settings.agent_roles ?? {}),
      };

      const activeRoles = AGENT_ROLES.filter((role) => {
        if (!roleConfigs[role.name]?.enabled) return false;
        const hasSource = role.dataSources.some(
          (ds) =>
            settings.data_sources[
              ds as keyof ProactiveAgentSettings["data_sources"]
            ],
        );
        if (!hasSource) return false;
        return role.snapshotKeys.some(
          (key) => (snapshot as Record<string, unknown>)[key] !== undefined,
        );
      });

      if (activeRoles.length === 0) {
        results.push({ userId, skipped: true, reason: "no_active_roles" });
        continue;
      }

      console.log(
        `[${userId}] Team mode: ${activeRoles.map((r) => r.name).join(", ")}`,
      );

      // Run specialists in parallel
      const specialistResults = await Promise.all(
        activeRoles.map(async (role) => {
          const roleSnapshot: Record<string, unknown> = {};
          for (const key of role.snapshotKeys) {
            const val = (snapshot as Record<string, unknown>)[key];
            if (val !== undefined) roleSnapshot[key] = val;
          }
          const prompt = buildSpecialistPrompt(role, settings);
          const userMsg = `## 現在日時\n${currentDatetimeJst}\n\n## データ\n${JSON.stringify(roleSnapshot, null, 2)}${recentSection}`;

          try {
            const raw = await callLlm(settings.ai_model, prompt, userMsg, {
              temperature: settings.temperature ?? 0.3,
              maxTokens: role.maxTokens,
            });
            return {
              role: role.name,
              insights: parseLlmResponse(raw).insights,
            };
          } catch (err) {
            console.error(`[${role.name}] LLM error:`, err);
            return { role: role.name, insights: [] as ProactiveInsight[] };
          }
        }),
      );

      const totalSpecialistInsights = specialistResults.reduce(
        (sum, r) => sum + r.insights.length,
        0,
      );

      if (totalSpecialistInsights === 0) {
        llmResponse = { insights: [] };
      } else {
        // Run coordinator
        const coordPrompt = buildCoordinatorPrompt(settings);
        const agentOutputs = specialistResults
          .filter((r) => r.insights.length > 0)
          .map((r) => `### ${r.role}\n${JSON.stringify(r.insights, null, 2)}`)
          .join("\n\n");
        const coordUserMsg = `## 現在日時\n${currentDatetimeJst}\n\n## スペシャリストエージェントの出力\n${agentOutputs}${recentSection}`;

        try {
          const coordRaw = await callLlm(
            settings.ai_model,
            coordPrompt,
            coordUserMsg,
            {
              temperature: settings.temperature ?? 0.3,
              maxTokens: settings.max_tokens ?? 2048,
            },
          );
          llmResponse = parseLlmResponse(coordRaw);
        } catch (err) {
          console.error("Coordinator LLM error:", err);
          // Fallback: use specialist results directly, sorted by priority
          const priorityOrder: Record<string, number> = {
            urgent: 0,
            high: 1,
            medium: 2,
            low: 3,
          };
          const allInsights = specialistResults
            .flatMap((r) => r.insights)
            .sort(
              (a, b) =>
                (priorityOrder[a.priority] ?? 3) -
                (priorityOrder[b.priority] ?? 3),
            )
            .slice(0, settings.max_insights ?? 5);
          llmResponse = { insights: allInsights };
        }
      }
    } else {
      // ── Single Agent Mode (existing behavior) ──
      const userMessage = `## 現在日時\n${currentDatetimeJst}\n\n## データ\n${JSON.stringify(snapshot, null, 2)}${recentSection}`;
      const systemPrompt = buildSystemPrompt(settings);
      const llmOpts: LlmCallOptions = {
        temperature: settings.temperature ?? 0.3,
        maxTokens: settings.max_tokens ?? 2048,
      };

      let llmRaw: string;
      try {
        llmRaw = await callLlm(
          settings.ai_model,
          systemPrompt,
          userMessage,
          llmOpts,
        );
      } catch (err) {
        console.error("LLM call failed:", err);
        results.push({
          userId,
          error: err instanceof Error ? err.message : "LLM error",
        });
        continue;
      }

      llmResponse = parseLlmResponse(llmRaw);
      if (llmResponse.insights.length === 0) {
        // Check if parse truly failed (parseLlmResponse returns empty on failure)
        const rawCheck = llmRaw.trim();
        if (
          rawCheck &&
          !rawCheck.startsWith("{") &&
          !rawCheck.startsWith("[")
        ) {
          console.error("Failed to parse LLM JSON:", llmRaw.slice(0, 200));
          results.push({ userId, error: "json_parse_error" });
          continue;
        }
      }
    }

    const nowIso = new Date().toISOString();

    if (llmResponse.insights.length === 0) {
      results.push({ userId, insights: 0, message: "nothing_to_report" });

      // Save last run with fingerprint
      await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          key: "proactive_agent_last_run",
          value: {
            timestamp: nowIso,
            fingerprint,
            insights_count: 0,
            status: "ok",
          },
        },
        { onConflict: "user_id,key" },
      );
      continue;
    }

    // ── Layer 3: Category-based cooldown dedup ──
    // Use category_hint (stable, limited set) instead of LLM-generated insight.id
    const { data: dedupRow } = await supabase
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "proactive_agent_notified")
      .maybeSingle();

    const notifiedCategories: Record<string, string> =
      (dedupRow?.value as Record<string, string>) ?? {};

    // Clean up entries older than 24h
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    for (const [key, ts] of Object.entries(notifiedCategories)) {
      if (ts < dayAgo) {
        delete notifiedCategories[key];
      }
    }

    // Filter: block same category_hint within its cooldown window
    const cooldowns = getCategoryCooldowns(
      settings.category_cooldown_hours ?? 6,
    );
    const newInsights = llmResponse.insights.filter((insight) => {
      const category = insight.category_hint || "general";
      const lastNotified = notifiedCategories[category];
      if (!lastNotified) return true; // never notified → allow
      const cooldownHours =
        cooldowns[category] ?? settings.category_cooldown_hours ?? 6;
      const threshold = new Date(
        Date.now() - cooldownHours * 60 * 60 * 1000,
      ).toISOString();
      return lastNotified < threshold;
    });

    if (newInsights.length === 0) {
      console.log(`[${userId}] All insights blocked by category cooldown`);
      results.push({ userId, insights: 0, message: "all_deduped" });

      // Still save fingerprint so next unchanged run skips LLM
      await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          key: "proactive_agent_last_run",
          value: {
            timestamp: nowIso,
            fingerprint,
            insights_count: 0,
            status: "ok",
          },
        },
        { onConflict: "user_id,key" },
      );
      continue;
    }

    // Create notifications + tasks
    let notificationsCreated = 0;
    let pushSent = 0;
    let tasksCreated = 0;

    // Get or create "AI Tasks" task list
    let aiTasksListId: string | null = null;
    {
      const { data: existingList } = await supabase
        .from("task_lists")
        .select("id")
        .eq("user_id", userId)
        .eq("title", "AI Tasks")
        .limit(1)
        .single();

      if (existingList) {
        aiTasksListId = existingList.id;
      } else {
        const { data: newList, error: listErr } = await supabase
          .from("task_lists")
          .insert({
            user_id: userId,
            title: "AI Tasks",
            position: 9999,
          })
          .select("id")
          .single();
        if (!listErr && newList) {
          aiTasksListId = newList.id;
        }
      }
    }

    // Fetch existing open AI tasks to avoid duplicates
    const existingTaskNotes = new Set<string>();
    if (aiTasksListId) {
      const { data: openTasks } = await supabase
        .from("tasks")
        .select("notes")
        .eq("list_id", aiTasksListId)
        .eq("status", "needsAction");
      if (openTasks) {
        for (const t of openTasks) {
          const match = t.notes?.match(/insight_id:\s*(.+)/);
          if (match) existingTaskNotes.add(match[1].trim());
        }
      }
    }

    const maxInsights = settings.max_insights ?? 5;
    for (const insight of newInsights.slice(0, maxInsights)) {
      const validPriorities = ["low", "medium", "high", "urgent"];
      const priority = validPriorities.includes(insight.priority)
        ? insight.priority
        : "medium";

      const category = insight.category_hint || "general";
      const notificationId = `system-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

      const { error: insertError } = await supabase
        .from("ai_notifications")
        .insert({
          id: notificationId,
          user_id: userId,
          category_id: null,
          source: "system",
          priority,
          title: insight.title || "AI Agent",
          body: insight.body || "",
          metadata: {
            proactive_agent: true,
            insight_id: insight.id,
            category_hint: category,
          },
          is_read: false,
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (insertError) {
        console.error("Failed to insert notification:", insertError);
        continue;
      }

      notificationsCreated++;

      // Create task in "AI Tasks" list (skip if duplicate)
      if (aiTasksListId && !existingTaskNotes.has(insight.id)) {
        const { error: taskErr } = await supabase.from("tasks").insert({
          user_id: userId,
          list_id: aiTasksListId,
          title: insight.title || "AI Suggestion",
          notes: `${insight.body}\n\n---\ninsight_id: ${insight.id}`,
          status: "needsAction",
          is_starred: priority === "high" || priority === "urgent",
          position: Date.now(),
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (!taskErr) {
          tasksCreated++;
          existingTaskNotes.add(insight.id);
        } else {
          console.error("Failed to create AI task:", taskErr);
        }
      }

      // Mark category as notified (cooldown starts now)
      notifiedCategories[category] = nowIso;

      // Send push for high/urgent (or all if not push_high_only)
      const shouldPush =
        !settings.push_high_only ||
        priority === "high" ||
        priority === "urgent";

      if (
        shouldPush &&
        (await isPushCategoryEnabled(supabase, userId, "pushProactiveAgent"))
      ) {
        const sent = await sendPushToUser(supabase, userId, {
          title: insight.title,
          body:
            insight.body.slice(0, 100) +
            (insight.body.length > 100 ? "..." : ""),
          url: "/ai/notify-box",
          tag: `proactive-${notificationId}`,
        });
        pushSent += sent;
      }
    }

    // Save category cooldown state
    await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        key: "proactive_agent_notified",
        value: notifiedCategories,
      },
      { onConflict: "user_id,key" },
    );

    // Save last run with fingerprint
    await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        key: "proactive_agent_last_run",
        value: {
          timestamp: nowIso,
          fingerprint,
          insights_count: notificationsCreated,
          tasks_created: tasksCreated,
          push_sent: pushSent,
          status: "ok",
        },
      },
      { onConflict: "user_id,key" },
    );

    results.push({
      userId,
      insights: notificationsCreated,
      tasksCreated,
      pushSent,
    });
  }

  const response = {
    success: true,
    timestamp: new Date().toISOString(),
    results,
  };

  console.log("Proactive agent run complete:", response);

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
