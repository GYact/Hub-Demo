import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";
import { postToSlack } from "../_shared/slackPost.ts";
import { postToLine } from "../_shared/linePost.ts";

type AutomationType =
  | "paper_search"
  | "news_collection"
  | "custom"
  | "hp_post"
  | "event_discovery"
  | "stock_analysis"
  | "event_collect"
  | "ai_news_digest";
type AiProvider = "gemini" | "openai" | "anthropic" | "perplexity";

type PaperSearchConfig = {
  prompt?: string;
};

type NewsCollectionConfig = {
  prompt?: string;
};

type HpPostConfig = {
  prompt?: string;
  category?: string;
};

type EventDiscoveryConfig = {
  prompt?: string;
  keywords: string[];
  location?: string;
  platforms: ("peatix" | "luma")[];
};

type StockAnalysisConfig = {
  prompt?: string;
  analysisType?: "portfolio" | "market_overview";
};

type EventCollectConfig = {
  prompt?: string;
  platforms: ("connpass" | "techplay" | "luma" | "peatix")[];
  keywords: string[];
  location?: string;
  slackChannelId?: string;
};

type AiNewsDigestConfig = {
  prompt?: string;
  arxivCategories: string[];
  rssFeeds: string[];
  slackChannelId?: string;
  lineEnabled?: boolean;
};

type DiscoveredEvent = {
  title: string;
  description: string;
  startDate: string;
  endDate?: string;
  location?: string;
  url: string;
  platform: "peatix" | "luma";
  relevanceReason: string;
};

type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  automation_type: AutomationType;
  config:
    | PaperSearchConfig
    | NewsCollectionConfig
    | HpPostConfig
    | EventDiscoveryConfig
    | StockAnalysisConfig
    | EventCollectConfig
    | AiNewsDigestConfig;
  ai_model: AiProvider;
  enabled: boolean;
};

type ArxivPaper = {
  title: string;
  authors: string[];
  summary: string;
  link: string;
  published: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY") ?? "";
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const hpSupabaseUrl = Deno.env.get("HP_SUPABASE_URL") ?? "";
const hpServiceRoleKey = Deno.env.get("HP_SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Search Arxiv for papers
const searchArxiv = async (
  keywords: string[],
  maxResults: number,
): Promise<ArxivPaper[]> => {
  const query = keywords
    .map((k) => `all:${encodeURIComponent(k)}`)
    .join("+AND+");
  const url = `http://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Arxiv API error:", response.status);
      return [];
    }

    const xml = await response.text();
    const papers: ArxivPaper[] = [];

    // Parse entries
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];

      const title =
        extractTag(entryXml, "title")?.replace(/\s+/g, " ").trim() || "";
      const summary =
        extractTag(entryXml, "summary")?.replace(/\s+/g, " ").trim() || "";
      const published = extractTag(entryXml, "published") || "";

      // Extract link
      const linkMatch = entryXml.match(/<id>([^<]+)<\/id>/);
      const link = linkMatch ? linkMatch[1] : "";

      // Extract authors
      const authors: string[] = [];
      const authorRegex = /<author>\s*<name>([^<]+)<\/name>/gi;
      let authorMatch;
      while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
        authors.push(authorMatch[1].trim());
      }

      papers.push({ title, authors, summary, link, published });
    }

    return papers;
  } catch (err) {
    console.error("Failed to search Arxiv:", err);
    return [];
  }
};

const extractTag = (xml: string, tagName: string): string | null => {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
};

// Call AI API to summarize/analyze
const callAI = async (
  provider: AiProvider,
  systemPrompt: string,
  userMessage: string,
  searchOptions?: PerplexitySearchOptions,
): Promise<string> => {
  switch (provider) {
    case "gemini":
      return callGemini(systemPrompt, userMessage);
    case "openai":
      return callOpenAI(systemPrompt, userMessage);
    case "anthropic":
      return callAnthropic(systemPrompt, userMessage);
    case "perplexity":
      return callPerplexity(systemPrompt, userMessage, searchOptions);
    default:
      return callGemini(systemPrompt, userMessage);
  }
};

const callGemini = async (
  systemPrompt: string,
  userMessage: string,
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
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated"
  );
};

const callOpenAI = async (
  systemPrompt: string,
  userMessage: string,
): Promise<string> => {
  if (!openaiApiKey) throw new Error("OpenAI API key not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated";
};

const callAnthropic = async (
  systemPrompt: string,
  userMessage: string,
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
      max_tokens: 2048,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "No response generated";
};

type PerplexitySearchOptions = {
  search_recency_filter?: "month" | "week" | "day" | "hour";
  search_domain_filter?: string[];
};

const callPerplexity = async (
  systemPrompt: string,
  userMessage: string,
  searchOptions?: PerplexitySearchOptions,
): Promise<string> => {
  if (!perplexityApiKey) throw new Error("Perplexity API key not configured");

  const body: Record<string, unknown> = {
    model: "sonar",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  };

  if (searchOptions?.search_recency_filter) {
    body.search_recency_filter = searchOptions.search_recency_filter;
  }
  if (searchOptions?.search_domain_filter?.length) {
    body.search_domain_filter = searchOptions.search_domain_filter;
  }

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${perplexityApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated";
};

// Run paper search automation (R&D)
const runPaperSearch = async (
  config: PaperSearchConfig,
  aiModel: AiProvider,
  automationName: string,
): Promise<{
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}> => {
  console.log("Running R&D automation");

  if (!config.prompt) {
    return {
      title: `${automationName} - エラー`,
      body: "プロンプトが設定されていません。",
      metadata: {},
    };
  }

  const systemPrompt = `あなたは研究・開発のエキスパートです。
ユーザーの指示に従って、最新の学術研究、技術トレンド、論文などについて調査・分析してください。
情報は正確で、実用的なものを提供してください。
可能な限り論文タイトル、著者、発表年、リンクを含めてください。
日本語で回答してください。`;

  // Perplexity: 学術サイトに特化したWeb検索
  const searchOptions: PerplexitySearchOptions | undefined =
    aiModel === "perplexity"
      ? {
          search_recency_filter: "month",
          search_domain_filter: [
            "arxiv.org",
            "scholar.google.com",
            "semanticscholar.org",
            "openreview.net",
          ],
        }
      : undefined;

  const summary = await callAI(
    aiModel,
    systemPrompt,
    config.prompt,
    searchOptions,
  );

  return {
    title: `${automationName}`,
    body: summary,
    metadata: {
      automationType: "paper_search",
      webSearchEnabled: aiModel === "perplexity",
    },
  };
};

// Run news/information collection automation
const runNewsCollection = async (
  config: NewsCollectionConfig,
  aiModel: AiProvider,
  automationName: string,
): Promise<{
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}> => {
  console.log("Running information collection automation");

  if (!config.prompt) {
    return {
      title: `${automationName} - エラー`,
      body: "プロンプトが設定されていません。",
      metadata: {},
    };
  }

  const systemPrompt = `あなたは情報収集のエキスパートです。
ユーザーの指示に従って、関連する最新ニュースや情報を調査・収集・分析してください。
情報は箇条書きで整理し、重要なポイントを強調してください。
各情報の出典URLを含めてください。
日本語で回答してください。`;

  // Perplexity: 直近1週間のニュースをWeb検索
  const searchOptions: PerplexitySearchOptions | undefined =
    aiModel === "perplexity" ? { search_recency_filter: "week" } : undefined;

  const summary = await callAI(
    aiModel,
    systemPrompt,
    config.prompt,
    searchOptions,
  );

  return {
    title: `${automationName}`,
    body: summary,
    metadata: {
      automationType: "news_collection",
      webSearchEnabled: aiModel === "perplexity",
    },
  };
};

// Run HP post automation
const runHpPost = async (
  config: HpPostConfig,
  aiModel: AiProvider,
  automationName: string,
): Promise<{
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}> => {
  console.log("Running HP post automation");

  if (!config.prompt) {
    return {
      title: `${automationName} - エラー`,
      body: "プロンプトが設定されていません。",
      metadata: {},
    };
  }

  if (!hpSupabaseUrl || !hpServiceRoleKey) {
    return {
      title: `${automationName} - エラー`,
      body: "HP Supabase の環境変数が設定されていません（HP_SUPABASE_URL, HP_SUPABASE_SERVICE_ROLE_KEY）。",
      metadata: {},
    };
  }

  const systemPrompt = `あなたはHP(ホームページ)の記事執筆者です。
ユーザーの指示に従って、HPに掲載する記事のタイトルと本文を作成してください。
以下のJSON形式のみで回答してください（他のテキストは含めないでください）:
{"title": "記事タイトル", "content": "1段落目の本文\\n\\n2段落目の本文"}`;

  const aiResponse = await callAI(aiModel, systemPrompt, config.prompt);

  // Parse AI response as JSON
  let articleTitle: string;
  let articleContent: string;
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]);
    articleTitle = parsed.title;
    articleContent = parsed.content;
    if (!articleTitle || !articleContent) {
      throw new Error("Missing title or content in AI response");
    }
  } catch (parseErr) {
    console.error("Failed to parse AI response as JSON:", parseErr);
    // Fallback: use the raw AI response
    articleTitle = automationName;
    articleContent = aiResponse;
  }

  // Generate date and year
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const year = String(now.getFullYear());
  const category = config.category || "Release";

  // POST to external HP Supabase media table
  const mediaPayload = {
    date,
    category,
    year,
    title: articleTitle,
    content: articleContent,
  };
  const postResponse = await fetch(`${hpSupabaseUrl}/rest/v1/media`, {
    method: "POST",
    headers: {
      apikey: hpServiceRoleKey,
      Authorization: `Bearer ${hpServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(mediaPayload),
  });

  if (!postResponse.ok) {
    const errorText = await postResponse.text();
    throw new Error(
      `HP media POST failed (${postResponse.status}): ${errorText}`,
    );
  }

  const mediaResult = await postResponse.json();

  return {
    title: `${automationName} - 投稿完了`,
    body: `HPに記事を投稿しました。\n\nタイトル: ${articleTitle}\nカテゴリ: ${category}\n\n${articleContent.slice(0, 200)}${articleContent.length > 200 ? "..." : ""}`,
    metadata: {
      automationType: "hp_post",
      category,
      articleTitle,
      mediaId: mediaResult?.[0]?.id ?? null,
    },
  };
};

// Fetch events from Luma by parsing __NEXT_DATA__
const fetchLumaEvents = async (
  location?: string,
): Promise<DiscoveredEvent[]> => {
  const slug = location || "tokyo";
  const url = `https://lu.ma/${slug}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) {
      console.error(`Luma fetch failed (${res.status}) for ${url}`);
      return [];
    }
    const html = await res.text();
    const ndMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
    );
    if (!ndMatch) {
      console.warn("Luma: __NEXT_DATA__ not found");
      return [];
    }
    const nextData = JSON.parse(ndMatch[1]);
    // deno-lint-ignore no-explicit-any
    const events: any[] =
      nextData?.props?.pageProps?.initialData?.data?.events ||
      nextData?.props?.pageProps?.events ||
      [];

    return events.slice(0, 20).map((e) => ({
      title: e.name || e.title || "",
      description: (e.description || "").slice(0, 300),
      startDate: e.start_at || e.startDate || "",
      endDate: e.end_at || e.endDate || undefined,
      location: e.geo_address_info?.full_address || e.location || slug,
      url: `https://lu.ma/${e.url || e.slug || ""}`,
      platform: "luma" as const,
      relevanceReason: "",
    }));
  } catch (err) {
    console.error("Failed to fetch Luma events:", err);
    return [];
  }
};

// Run event discovery automation
const runEventDiscovery = async (
  config: EventDiscoveryConfig,
  aiModel: AiProvider,
  automationName: string,
): Promise<{
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}> => {
  console.log("Running event discovery automation");

  const keywords = config.keywords || [];
  if (keywords.length === 0 && !config.prompt) {
    return {
      title: `${automationName} - エラー`,
      body: "キーワードまたはプロンプトが設定されていません。",
      metadata: {},
    };
  }

  const platforms = config.platforms || ["peatix", "luma"];
  const allEvents: DiscoveredEvent[] = [];

  // Fetch Luma events
  if (platforms.includes("luma")) {
    const lumaEvents = await fetchLumaEvents(config.location);
    allEvents.push(...lumaEvents);
  }

  // Fetch Peatix events via Perplexity web search
  if (platforms.includes("peatix")) {
    const keywordStr = keywords.join(" ");
    const locationStr = config.location || "東京";
    const peatixPrompt = `${locationStr}で開催される「${keywordStr}」に関連するPeatixイベントを探してください。
今後1ヶ月以内に開催されるイベントを優先してください。
各イベントについて以下の情報をJSON配列で返してください（他のテキストは含めないでください）:
[{"title":"イベント名","description":"概要","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","location":"開催場所","url":"https://peatix.com/..."}]`;

    try {
      const peatixResult = await callPerplexity(
        "あなたはイベント検索アシスタントです。指定された条件でPeatixのイベントを検索し、JSON配列のみで回答してください。",
        peatixPrompt,
        {
          search_recency_filter: "month",
          search_domain_filter: ["peatix.com"],
        },
      );

      const jsonMatch = peatixResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          for (const e of parsed.slice(0, 10)) {
            allEvents.push({
              title: e.title || "",
              description: (e.description || "").slice(0, 300),
              startDate: e.startDate || e.start_date || "",
              endDate: e.endDate || e.end_date || undefined,
              location: e.location || locationStr,
              url: e.url || "",
              platform: "peatix",
              relevanceReason: "",
            });
          }
        }
      }
    } catch (err) {
      console.error("Peatix search failed:", err);
    }
  }

  if (allEvents.length === 0) {
    return {
      title: `${automationName}`,
      body: "条件に一致するイベントが見つかりませんでした。キーワードや地域を変更してお試しください。",
      metadata: { automationType: "event_discovery", events: [] },
    };
  }

  // Use AI to curate and rank events
  const curationPrompt = `以下のイベント一覧からユーザーの興味に合う面白いイベントを選んでください。

ユーザーの興味・条件:
- キーワード: ${keywords.join(", ") || "指定なし"}
${config.prompt ? `- 追加条件: ${config.prompt}` : ""}
${config.location ? `- 希望地域: ${config.location}` : ""}

イベント一覧:
${JSON.stringify(allEvents, null, 2)}

以下のJSON形式で、おすすめ順に最大10件返してください（他のテキストは含めないでください）:
[{"title":"...","description":"...","startDate":"...","endDate":"...","location":"...","url":"...","platform":"peatix|luma","relevanceReason":"おすすめ理由"}]`;

  const curatedResult = await callAI(
    aiModel,
    "あなたはイベントキュレーターです。ユーザーの興味に基づいてイベントを厳選し、JSON配列のみで回答してください。",
    curationPrompt,
  );

  let curatedEvents: DiscoveredEvent[] = [];
  try {
    const jsonMatch = curatedResult.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      curatedEvents = JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error("Failed to parse curated events, using raw list");
    curatedEvents = allEvents.slice(0, 10).map((e) => ({
      ...e,
      relevanceReason: "キーワードに関連",
    }));
  }

  // Build human-readable body
  const bodyLines = curatedEvents.map(
    (e, i) =>
      `### ${i + 1}. ${e.title}\n` +
      `- **日時**: ${e.startDate}${e.endDate ? ` 〜 ${e.endDate}` : ""}\n` +
      `- **場所**: ${e.location || "未定"}\n` +
      `- **プラットフォーム**: ${e.platform}\n` +
      `- **おすすめ理由**: ${e.relevanceReason}\n` +
      `- **リンク**: ${e.url}\n` +
      (e.description ? `\n${e.description}\n` : ""),
  );

  return {
    title: `${automationName}`,
    body:
      `${curatedEvents.length}件のおすすめイベントが見つかりました。\n気になるイベントを選んでカレンダーに追加できます。\n\n` +
      bodyLines.join("\n"),
    metadata: {
      automationType: "event_discovery",
      events: curatedEvents,
      totalFound: allEvents.length,
      curatedCount: curatedEvents.length,
    },
  };
};

// ── Yahoo Finance helpers (internal fetch, no auth needed) ──

const YAHOO_BASE = "https://query1.finance.yahoo.com";

const yahooFetch = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Yahoo Finance API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

type StockQuote = {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
};

const fetchQuotes = async (symbols: string[]): Promise<StockQuote[]> => {
  if (!symbols.length) return [];
  const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const data = await yahooFetch(url);
  return (data?.quoteResponse?.result ?? []).map(
    (q: Record<string, unknown>) => ({
      symbol: q.symbol as string,
      name: (q.shortName || q.longName || q.symbol) as string,
      price: (q.regularMarketPrice as number) ?? 0,
      previousClose: (q.regularMarketPreviousClose as number) ?? 0,
      change: (q.regularMarketChange as number) ?? 0,
      changePercent: (q.regularMarketChangePercent as number) ?? 0,
      currency: (q.currency as string) ?? "USD",
    }),
  );
};

type Candle = {
  time: number;
  close: number;
  volume: number;
};

const fetchChart = async (
  symbol: string,
  range = "3mo",
  interval = "1d",
): Promise<Candle[]> => {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const data = await yahooFetch(url);
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp ?? [];
  const ohlcv = result.indicators?.quote?.[0] ?? {};
  return timestamps
    .map((t: number, i: number) => ({
      time: t,
      close: (ohlcv.close?.[i] as number) ?? 0,
      volume: (ohlcv.volume?.[i] as number) ?? 0,
    }))
    .filter((c) => c.close !== 0);
};

// ── Technical indicators ──

const calcSMA = (closes: number[], period: number): number | null => {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};

const calcRSI = (closes: number[], period = 14): number | null => {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  const recent = closes.slice(-(period + 1));
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const calcMACD = (
  closes: number[],
): { macd: number; signal: number; histogram: number } | null => {
  if (closes.length < 26) return null;
  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]).slice(26);
  if (macdLine.length < 9) return null;
  const signalLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  return {
    macd: macdLine[last],
    signal: signalLine[last],
    histogram: macdLine[last] - signalLine[last],
  };
};

// ── Fetch financial data ──

type StockFinancials = {
  symbol: string;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  totalRevenue: number | null;
  revenueGrowth: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  earningsGrowth: number | null;
  currentRatio: number | null;
};

const fetchFinancials = async (
  symbols: string[],
): Promise<Record<string, StockFinancials>> => {
  const result: Record<string, StockFinancials> = {};
  for (const sym of symbols.slice(0, 10)) {
    try {
      const modules = "summaryDetail,defaultKeyStatistics,financialData";
      const url = `${YAHOO_BASE}/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${modules}`;
      const data = await yahooFetch(url);
      const r = data?.quoteSummary?.result?.[0];
      if (!r) continue;
      const sd = r.summaryDetail ?? {};
      const ks = r.defaultKeyStatistics ?? {};
      const fd = r.financialData ?? {};
      const raw = (
        obj: Record<string, unknown>,
        key: string,
      ): number | null => {
        const v = obj[key];
        if (
          v &&
          typeof v === "object" &&
          "raw" in (v as Record<string, unknown>)
        ) {
          return (v as Record<string, unknown>).raw as number;
        }
        return typeof v === "number" ? v : null;
      };
      result[sym] = {
        symbol: sym,
        trailingPE: raw(sd, "trailingPE"),
        forwardPE: raw(sd, "forwardPE") ?? raw(ks, "forwardPE"),
        priceToBook: raw(ks, "priceToBook"),
        dividendYield: raw(sd, "dividendYield"),
        marketCap: raw(sd, "marketCap"),
        totalRevenue: raw(fd, "totalRevenue"),
        revenueGrowth: raw(fd, "revenueGrowth"),
        profitMargins: raw(fd, "profitMargins"),
        returnOnEquity: raw(fd, "returnOnEquity"),
        debtToEquity: raw(fd, "debtToEquity"),
        freeCashflow: raw(fd, "freeCashflow"),
        earningsGrowth: raw(fd, "earningsGrowth"),
        currentRatio: raw(fd, "currentRatio"),
      };
    } catch {
      // Skip failed symbol
    }
  }
  return result;
};

// ── Run stock analysis automation ──

const runStockAnalysis = async (
  config: StockAnalysisConfig,
  aiModel: AiProvider,
  automationName: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}> => {
  console.log("Running stock analysis automation");

  const analysisType = config.analysisType || "portfolio";

  // Collect user's holdings + watchlist symbols
  const symbols: string[] = [];
  const holdingDetails: Record<string, { shares: number; avgCost: number }> =
    {};

  if (analysisType === "portfolio" || !config.analysisType) {
    const { data: holdings } = await supabaseAdmin
      .from("invest_holdings")
      .select("symbol, shares, average_cost")
      .eq("user_id", userId)
      .gt("shares", 0);

    for (const h of holdings ?? []) {
      const sym = h.symbol as string;
      symbols.push(sym);
      holdingDetails[sym] = {
        shares: h.shares as number,
        avgCost: h.average_cost as number,
      };
    }
  }

  // Always include watchlist
  const { data: watchlist } = await supabaseAdmin
    .from("invest_watchlist")
    .select("symbol")
    .eq("user_id", userId);

  for (const w of watchlist ?? []) {
    const sym = w.symbol as string;
    if (!symbols.includes(sym)) symbols.push(sym);
  }

  if (symbols.length === 0) {
    return {
      title: `${automationName}`,
      body: "ポートフォリオとウォッチリストに銘柄が登録されていません。\n投資ページから銘柄を追加してください。",
      metadata: { automationType: "stock_analysis", symbolCount: 0 },
    };
  }

  // Fetch quotes and financials for all symbols
  const [quotes, financialsMap] = await Promise.all([
    fetchQuotes(symbols),
    fetchFinancials(symbols),
  ]);

  // Fetch chart data and compute indicators for each symbol (limit to 15)
  const analysisTargets = symbols.slice(0, 15);
  const indicatorResults: Record<
    string,
    {
      sma20: number | null;
      sma50: number | null;
      rsi: number | null;
      macd: { macd: number; signal: number; histogram: number } | null;
    }
  > = {};

  for (const sym of analysisTargets) {
    try {
      const candles = await fetchChart(sym, "6mo", "1d");
      const closes = candles.map((c) => c.close);
      indicatorResults[sym] = {
        sma20: calcSMA(closes, 20),
        sma50: calcSMA(closes, 50),
        rsi: calcRSI(closes),
        macd: calcMACD(closes),
      };
    } catch {
      indicatorResults[sym] = {
        sma20: null,
        sma50: null,
        rsi: null,
        macd: null,
      };
    }
  }

  // Build AI prompt
  const lines: string[] = [];
  let totalValue = 0;
  let totalCost = 0;

  for (const q of quotes) {
    const holding = holdingDetails[q.symbol];
    const ind = indicatorResults[q.symbol];
    let line = `**${q.symbol}** (${q.name}): ${q.currency} ${q.price.toFixed(2)} (${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}%)`;

    if (holding) {
      const value = holding.shares * q.price;
      const cost = holding.shares * holding.avgCost;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? ((pnl / cost) * 100).toFixed(2) : "0";
      line += `\n  保有: ${holding.shares}株, 平均取得: ${q.currency} ${holding.avgCost.toFixed(2)}, 損益: ${pnl >= 0 ? "+" : ""}${q.currency} ${pnl.toFixed(0)} (${pnl >= 0 ? "+" : ""}${pnlPct}%)`;
      totalValue += value;
      totalCost += cost;
    } else {
      line += "\n  (ウォッチリスト)";
    }

    if (ind) {
      const parts: string[] = [];
      if (ind.sma20 !== null) parts.push(`SMA20: ${ind.sma20.toFixed(2)}`);
      if (ind.sma50 !== null) parts.push(`SMA50: ${ind.sma50.toFixed(2)}`);
      if (ind.rsi !== null) parts.push(`RSI: ${ind.rsi.toFixed(1)}`);
      if (ind.macd !== null)
        parts.push(
          `MACD: ${ind.macd.macd.toFixed(3)} / Signal: ${ind.macd.signal.toFixed(3)}`,
        );
      if (parts.length > 0) line += `\n  テクニカル: ${parts.join(", ")}`;
    }

    const fin = financialsMap[q.symbol];
    if (fin) {
      const fp: string[] = [];
      if (fin.trailingPE !== null) fp.push(`PER: ${fin.trailingPE.toFixed(1)}`);
      if (fin.priceToBook !== null)
        fp.push(`PBR: ${fin.priceToBook.toFixed(2)}`);
      if (fin.dividendYield !== null)
        fp.push(`配当利回り: ${(fin.dividendYield * 100).toFixed(2)}%`);
      if (fin.profitMargins !== null)
        fp.push(`利益率: ${(fin.profitMargins * 100).toFixed(1)}%`);
      if (fin.returnOnEquity !== null)
        fp.push(`ROE: ${(fin.returnOnEquity * 100).toFixed(1)}%`);
      if (fin.revenueGrowth !== null)
        fp.push(`売上成長: ${(fin.revenueGrowth * 100).toFixed(1)}%`);
      if (fin.earningsGrowth !== null)
        fp.push(`利益成長: ${(fin.earningsGrowth * 100).toFixed(1)}%`);
      if (fin.debtToEquity !== null)
        fp.push(`D/E: ${fin.debtToEquity.toFixed(1)}`);
      if (fp.length > 0) line += `\n  ファンダメンタル: ${fp.join(", ")}`;
    }

    lines.push(line);
  }

  const portfolioSummary =
    totalCost > 0
      ? `\nポートフォリオ合計: 評価額 ${totalValue.toFixed(0)}, 投資額 ${totalCost.toFixed(0)}, 損益 ${totalValue - totalCost >= 0 ? "+" : ""}${(totalValue - totalCost).toFixed(0)} (${(((totalValue - totalCost) / totalCost) * 100).toFixed(2)}%)`
      : "";

  const userMessage = `## 株式分析レポート (${new Date().toISOString().slice(0, 10)})
${portfolioSummary}

## 銘柄一覧:
${lines.join("\n\n")}

${config.prompt ? `\n## ユーザーの追加指示:\n${config.prompt}` : ""}`;

  const systemPrompt = `あなたは投資アナリストです。ユーザーのポートフォリオとウォッチリストのデータを分析し、以下の観点でレポートを作成してください：

1. **市場概況**: 全体的なトレンド
2. **個別銘柄分析**: テクニカル指標（RSI、MACD、移動平均線クロス）とファンダメンタル指標（PER、PBR、配当利回り、ROE、利益率、成長率）を総合的に評価
3. **バリュエーション評価**: PER/PBRの業界平均との比較、割安・割高判断
4. **ポートフォリオ評価**: 全体の損益状況、セクター分散、リスク分散度
5. **注目ポイント**: 売買シグナル、割安銘柄、高配当銘柄、成長性の高い銘柄
6. **推奨アクション**: 具体的な提案（あくまで参考情報として）

ルール:
- 日本語で回答
- テクニカルとファンダメンタルの両面から分析
- 投資は自己責任である旨を最後に一言添える
- 具体的な数値を使って分析する`;

  const searchOptions: PerplexitySearchOptions | undefined =
    aiModel === "perplexity"
      ? {
          search_recency_filter: "day",
          search_domain_filter: [
            "finance.yahoo.com",
            "bloomberg.com",
            "reuters.com",
            "nikkei.com",
          ],
        }
      : undefined;

  const analysis = await callAI(
    aiModel,
    systemPrompt,
    userMessage,
    searchOptions,
  );

  return {
    title: `${automationName}`,
    body: analysis,
    metadata: {
      automationType: "stock_analysis",
      analysisType,
      symbolCount: symbols.length,
      portfolioValue: totalValue > 0 ? totalValue : undefined,
      portfolioPnl: totalCost > 0 ? totalValue - totalCost : undefined,
    },
  };
};

async function runEventCollect(
  config: EventCollectConfig,
  aiModel: AiProvider,
  name: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ title: string; body: string; metadata: Record<string, unknown> }> {
  const platforms = config.platforms ?? [
    "connpass",
    "techplay",
    "luma",
    "peatix",
  ];
  const keywords = config.keywords ?? ["AI", "スタートアップ", "エンジニア"];
  const location = config.location ?? "東京";

  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ymd = (d: Date) => d.toISOString().split("T")[0];

  const allEvents: {
    title: string;
    date: string;
    url: string;
    platform: string;
    location?: string;
  }[] = [];

  // connpass API
  if (platforms.includes("connpass")) {
    for (const keyword of keywords.slice(0, 3)) {
      try {
        const params = new URLSearchParams({
          keyword,
          ym: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`,
          count: "20",
          order: "2",
        });
        const res = await fetch(
          `https://connpass.com/api/v1/event/?${params}`,
          {
            headers: { "User-Agent": "Hub-Automation/1.0" },
          },
        );
        if (res.ok) {
          const data = await res.json();
          for (const ev of data.events ?? []) {
            const eventDate = ev.started_at?.split("T")[0] ?? "";
            if (eventDate >= ymd(now) && eventDate <= ymd(oneMonthLater)) {
              const addr = ev.address ?? ev.place ?? "";
              if (
                addr.includes(location) ||
                addr.includes("オンライン") ||
                ev.event_type === "participation"
              ) {
                allEvents.push({
                  title: ev.title,
                  date: eventDate,
                  url: ev.event_url,
                  platform: "connpass",
                  location: addr || "オンライン",
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("connpass fetch error:", e);
      }
    }
  }

  // TECH PLAY - scrape search page
  if (platforms.includes("techplay")) {
    for (const keyword of keywords.slice(0, 2)) {
      try {
        const res = await fetch(
          `https://techplay.jp/event/search?keyword=${encodeURIComponent(keyword)}&pref=13`,
          {
            headers: { "User-Agent": "Hub-Automation/1.0" },
          },
        );
        if (res.ok) {
          const html = await res.text();
          const eventMatches = html.matchAll(
            /<a[^>]*href="(\/event\/\d+)"[^>]*>([^<]+)<\/a>/g,
          );
          for (const m of eventMatches) {
            allEvents.push({
              title: m[2].trim(),
              date: "",
              url: `https://techplay.jp${m[1]}`,
              platform: "techplay",
            });
          }
        }
      } catch (e) {
        console.error("techplay fetch error:", e);
      }
    }
  }

  // Peatix - search
  if (platforms.includes("peatix")) {
    for (const keyword of keywords.slice(0, 2)) {
      try {
        const res = await fetch(
          `https://peatix.com/search?q=${encodeURIComponent(keyword)}&country=JP&p=1`,
          {
            headers: { "User-Agent": "Hub-Automation/1.0" },
          },
        );
        if (res.ok) {
          const html = await res.text();
          const matches = html.matchAll(
            /href="(https:\/\/peatix\.com\/event\/\d+[^"]*)"[^>]*>([^<]*)</g,
          );
          for (const m of matches) {
            if (m[2].trim()) {
              allEvents.push({
                title: m[2].trim(),
                date: "",
                url: m[1],
                platform: "peatix",
              });
            }
          }
        }
      } catch (e) {
        console.error("peatix fetch error:", e);
      }
    }
  }

  // Luma
  if (platforms.includes("luma")) {
    try {
      const res = await fetch(
        "https://api.lu.ma/public/v2/event/search?geo_latitude=35.6762&geo_longitude=139.6503&geo_radius=30km",
        {
          headers: { "User-Agent": "Hub-Automation/1.0" },
        },
      );
      if (res.ok) {
        const data = await res.json();
        for (const entry of data.entries ?? []) {
          const ev = entry.event ?? entry;
          allEvents.push({
            title: ev.name ?? ev.title ?? "Untitled",
            date: (ev.start_at ?? "").split("T")[0],
            url: ev.url ?? `https://lu.ma/${ev.slug ?? ""}`,
            platform: "luma",
          });
        }
      }
    } catch (e) {
      console.error("luma fetch error:", e);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueEvents = allEvents.filter((ev) => {
    if (seen.has(ev.url)) return false;
    seen.add(ev.url);
    return true;
  });

  // Sort by date
  uniqueEvents.sort((a, b) =>
    (a.date || "9999").localeCompare(b.date || "9999"),
  );

  // Format
  const eventLines = uniqueEvents.slice(0, 30).map((ev) => {
    const datePart = ev.date ? `${ev.date} ` : "";
    const locPart = ev.location ? ` (${ev.location})` : "";
    return `- ${datePart}${ev.title}${locPart}\n  ${ev.url} [${ev.platform}]`;
  });

  const body =
    eventLines.length > 0
      ? `${uniqueEvents.length}件のイベントが見つかりました\n\n${eventLines.join("\n")}`
      : "条件に合うイベントは見つかりませんでした。";

  // Post to Slack if configured
  if (config.slackChannelId && uniqueEvents.length > 0) {
    const slackText = `@channel\n\n📅 今週〜1ヶ月以内のイベント（${ymd(now)}〜${ymd(oneMonthLater)}）\n\n${eventLines.join("\n")}`;
    const slackResult = await postToSlack(
      supabaseAdmin,
      userId,
      config.slackChannelId,
      slackText,
    );
    if (!slackResult.ok) {
      console.error("Slack post failed:", slackResult.error);
    }
  }

  return {
    title: `イベント収集: ${uniqueEvents.length}件`,
    body,
    metadata: {
      eventCount: uniqueEvents.length,
      platforms: platforms,
      keywords,
      events: uniqueEvents.slice(0, 10),
    },
  };
}

async function runAiNewsDigest(
  config: AiNewsDigestConfig,
  aiModel: AiProvider,
  name: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ title: string; body: string; metadata: Record<string, unknown> }> {
  const categories = config.arxivCategories ?? [
    "cs.AI",
    "cs.LG",
    "cs.CL",
    "cs.CV",
  ];
  const rssFeeds = config.rssFeeds ?? [
    "https://openai.com/blog/rss.xml",
    "https://blog.google/technology/ai/rss",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://venturebeat.com/category/ai/feed/",
  ];

  const items: {
    title: string;
    summary: string;
    url: string;
    source: string;
    date: string;
  }[] = [];

  // Fetch arXiv papers
  for (const cat of categories) {
    try {
      const res = await fetch(
        `http://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=5`,
      );
      if (res.ok) {
        const xml = await res.text();
        const entries = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
        for (const entry of entries) {
          const titleMatch = entry[1].match(/<title>([\s\S]*?)<\/title>/);
          const summaryMatch = entry[1].match(/<summary>([\s\S]*?)<\/summary>/);
          const linkMatch = entry[1].match(/<id>([\s\S]*?)<\/id>/);
          const dateMatch = entry[1].match(
            /<published>([\s\S]*?)<\/published>/,
          );
          if (titleMatch && linkMatch) {
            items.push({
              title: titleMatch[1].replace(/\s+/g, " ").trim(),
              summary: (summaryMatch?.[1] ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 300),
              url: linkMatch[1].trim(),
              source: `arXiv:${cat}`,
              date: (dateMatch?.[1] ?? "").split("T")[0],
            });
          }
        }
      }
    } catch (e) {
      console.error(`arXiv ${cat} fetch error:`, e);
    }
  }

  // Fetch RSS feeds
  for (const feedUrl of rssFeeds) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Hub-Automation/1.0" },
      });
      if (res.ok) {
        const xml = await res.text();
        const feedItems = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        let count = 0;
        for (const item of feedItems) {
          if (count >= 3) break;
          const titleMatch = item[1].match(
            /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/,
          );
          const linkMatch = item[1].match(
            /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/,
          );
          const descMatch = item[1].match(
            /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/,
          );
          const dateMatch = item[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/);
          if (titleMatch && linkMatch) {
            items.push({
              title: titleMatch[1].trim(),
              summary: (descMatch?.[1] ?? "")
                .replace(/<[^>]*>/g, "")
                .trim()
                .slice(0, 300),
              url: linkMatch[1].trim(),
              source: new URL(feedUrl).hostname.replace("www.", ""),
              date: dateMatch
                ? new Date(dateMatch[1].trim()).toISOString().split("T")[0]
                : "",
            });
            count++;
          }
        }
      }
    } catch (e) {
      console.error(`RSS ${feedUrl} fetch error:`, e);
    }
  }

  if (items.length === 0) {
    return {
      title: "AI ニュースダイジェスト",
      body: "今回は新しいニュース・論文が見つかりませんでした。",
      metadata: { itemCount: 0 },
    };
  }

  // Summarize with OpenAI GPT-4.1-mini
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  let summaryMarkdown = "";
  let summaryPlain = "";

  if (openaiApiKey) {
    const itemsText = items
      .slice(0, 15)
      .map(
        (it, i) =>
          `${i + 1}. [${it.source}] ${it.title}\n   ${it.summary}\n   ${it.url}`,
      )
      .join("\n\n");

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "あなたはAI技術ニュースの要約者です。与えられた論文・ニュースを日本語で簡潔に要約してください。",
            },
            {
              role: "user",
              content: `以下のAI関連ニュース・論文を日本語で要約してください。各項目を1-2文で要約し、重要度の高いものを先に並べてください。\n\n${itemsText}`,
            },
          ],
          max_tokens: 2000,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        summaryMarkdown = data.choices?.[0]?.message?.content ?? "";
        // Clean version for LINE (no markdown symbols)
        summaryPlain = summaryMarkdown
          .replace(/[#*_~`>]/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim();
      }
    } catch (e) {
      console.error("OpenAI summarization error:", e);
    }
  }

  // Build body
  const linksSection = items
    .slice(0, 15)
    .map((it) => `- [${it.source}] ${it.title}\n  ${it.url}`)
    .join("\n");

  const body = summaryMarkdown
    ? `## AI ニュース要約\n\n${summaryMarkdown}\n\n---\n## ソース一覧\n${linksSection}`
    : `## AI ニュース一覧\n${linksSection}`;

  // Post to Slack
  if (config.slackChannelId) {
    const slackText = `@channel\n\n🤖 AI ニュースダイジェスト (${new Date().toISOString().split("T")[0]})\n\n${summaryMarkdown || linksSection}`;
    const slackResult = await postToSlack(
      supabaseAdmin,
      userId,
      config.slackChannelId,
      slackText,
    );
    if (!slackResult.ok) {
      console.error("Slack post failed:", slackResult.error);
    }
  }

  // Post to LINE
  if (config.lineEnabled) {
    const lineMsg1 = summaryPlain
      ? `🤖 AI ニュースダイジェスト\n\n${summaryPlain}`
      : `🤖 AI ニュースダイジェスト\n\n新しいニュースが${items.length}件あります`;
    const lineMsg2 = items
      .slice(0, 10)
      .map((it) => `${it.title}\n${it.url}`)
      .join("\n\n");

    const lineResult = await postToLine(supabaseAdmin, userId, [
      lineMsg1,
      lineMsg2,
    ]);
    if (!lineResult.ok) {
      console.error("LINE post failed:", lineResult.error);
    }
  }

  return {
    title: `AI ニュースダイジェスト: ${items.length}件`,
    body,
    metadata: {
      itemCount: items.length,
      arxivCount: items.filter((i) => i.source.startsWith("arXiv")).length,
      rssCount: items.filter((i) => !i.source.startsWith("arXiv")).length,
      categories,
      slackPosted: !!config.slackChannelId,
      linePosted: !!config.lineEnabled,
    },
  };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authenticate: require a valid user JWT or the service-role key
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);
  // Allow service-role key (used by automation_scheduler / relay error-monitor)
  if (token !== serviceRoleKey) {
    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let automationId: string;
  try {
    const body = await req.json();
    automationId = body.automationId;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!automationId) {
    return new Response(JSON.stringify({ error: "automationId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Get automation
  const { data: automation, error: automationError } = await supabaseAdmin
    .from("ai_automations")
    .select("*")
    .eq("id", automationId)
    .single();

  if (automationError || !automation) {
    return new Response(JSON.stringify({ error: "Automation not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const automationData = automation as AutomationRow;

  if (!automationData.enabled) {
    return new Response(JSON.stringify({ error: "Automation is disabled" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update status to running
  await supabaseAdmin
    .from("ai_automations")
    .update({
      last_run_status: "running",
      last_run_at: new Date().toISOString(),
    })
    .eq("id", automationId);

  try {
    let result: {
      title: string;
      body: string;
      metadata: Record<string, unknown>;
    };

    switch (automationData.automation_type) {
      case "paper_search":
        result = await runPaperSearch(
          automationData.config as PaperSearchConfig,
          automationData.ai_model,
          automationData.name,
        );
        break;
      case "news_collection":
        result = await runNewsCollection(
          automationData.config as NewsCollectionConfig,
          automationData.ai_model,
          automationData.name,
        );
        break;
      case "hp_post":
        result = await runHpPost(
          automationData.config as HpPostConfig,
          automationData.ai_model,
          automationData.name,
        );
        break;
      case "event_discovery":
        result = await runEventDiscovery(
          automationData.config as EventDiscoveryConfig,
          automationData.ai_model,
          automationData.name,
        );
        break;
      case "stock_analysis":
        result = await runStockAnalysis(
          automationData.config as StockAnalysisConfig,
          automationData.ai_model,
          automationData.name,
          supabaseAdmin,
          automationData.user_id,
        );
        break;
      case "event_collect":
        result = await runEventCollect(
          automationData.config as EventCollectConfig,
          automationData.ai_model,
          automationData.name,
          supabaseAdmin,
          automationData.user_id,
        );
        break;
      case "ai_news_digest":
        result = await runAiNewsDigest(
          automationData.config as AiNewsDigestConfig,
          automationData.ai_model,
          automationData.name,
          supabaseAdmin,
          automationData.user_id,
        );
        break;
      default:
        throw new Error(
          `Unsupported automation type: ${automationData.automation_type}`,
        );
    }

    // Create notification
    const notificationId = `automation-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("ai_notifications")
      .insert({
        id: notificationId,
        user_id: automationData.user_id,
        category_id: null,
        source: "automation",
        priority: "medium",
        title: result.title,
        body: result.body,
        metadata: {
          ...result.metadata,
          automationId: automationData.id,
          automationName: automationData.name,
          automationType: automationData.automation_type,
        },
        is_read: false,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (insertError) {
      console.error("Failed to insert notification:", insertError);
      throw new Error("Failed to create notification");
    }

    // Update automation status
    await supabaseAdmin
      .from("ai_automations")
      .update({
        last_run_status: "success",
        last_run_at: nowIso,
        last_run_result: result.metadata,
      })
      .eq("id", automationId);

    // Send push notification
    if (
      await isPushCategoryEnabled(
        supabaseAdmin,
        automationData.user_id,
        "pushAutomation",
      )
    ) {
      await sendPushToUser(supabaseAdmin, automationData.user_id, {
        title: result.title,
        body:
          result.body.slice(0, 100) + (result.body.length > 100 ? "..." : ""),
        url: "/ai/notify-box",
        tag: `automation-${notificationId}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        notification_id: notificationId,
        result: result.metadata,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Automation execution failed:", err);

    // Update automation status to error
    await supabaseAdmin
      .from("ai_automations")
      .update({
        last_run_status: "error",
        last_run_at: new Date().toISOString(),
        last_run_result: {
          error: err instanceof Error ? err.message : "Unknown error",
        },
      })
      .eq("id", automationId);

    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
