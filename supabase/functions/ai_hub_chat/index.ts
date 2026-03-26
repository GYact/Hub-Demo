import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import {
  logApiUsage,
  checkCostLimit,
  estimateTokensFromText,
} from "../_shared/costTracker.ts";
import {
  GWS_TOOLS,
  WEB_SEARCH_TOOL,
  executeGwsTool,
  type ToolDefinition,
} from "../_shared/gwsTools.ts";

type FileAttachment = {
  name: string;
  mimeType: string;
  base64Data: string;
};

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiRequestPayload = {
  sessionId?: string;
  sessionTitle?: string;
  userMessageId?: string;
  content: string;
  provider?: "gemini" | "openai" | "anthropic" | "perplexity";
  model?: string;
  dataContext?: string;
  systemInstruction?: string;
  history?: HistoryMessage[];
  attachments?: FileAttachment[];
  responseMimeType?: string;
  searchMode?: "standard" | "agentic";
  skipRag?: boolean;
};

const MAX_HISTORY_MESSAGES = 20;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY") ?? "";

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per attachment

// ── SSE helpers ──

const sseEncoder = new TextEncoder();

const writeSSE = (
  controller: ReadableStreamDefaultController,
  data: unknown,
) => {
  controller.enqueue(sseEncoder.encode(`data: ${JSON.stringify(data)}\n\n`));
};

async function* readProviderSSE(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        if (data) yield data;
      }
    }
  }
  if (buffer.startsWith("data: ")) {
    const data = buffer.slice(6).trim();
    if (data && data !== "[DONE]") yield data;
  }
}

// ── RAG ──

const generateQueryEmbedding = async (text: string): Promise<number[]> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 8000) }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    },
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Gemini Embedding API error (${response.status}): ${errText}`,
    );
  }
  const data = await response.json();
  return data.embedding.values;
};

const searchRelevantDocuments = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  queryText: string,
  matchCount = 15,
): Promise<string> => {
  const queryEmbedding = await generateQueryEmbedding(queryText);

  // First attempt with standard threshold
  const { data: matches, error } = await supabaseAdmin.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_user_id: userId,
    match_count: matchCount,
    match_threshold: 0.2,
  });

  if (error) {
    console.error("match_documents RPC error:", error);
    return "";
  }

  // If no semantic matches found, fetch recent data as fallback context
  if (!matches || matches.length === 0) {
    console.warn("No semantic matches found, fetching recent data as fallback");
    const { data: recent, error: recentErr } = await supabaseAdmin
      .from("document_embeddings")
      .select("source_type, source_id, content_text, metadata")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (recentErr || !recent || recent.length === 0) {
      return "";
    }
    const sections = recent.map(
      (m: {
        source_type: string;
        content_text: string;
        metadata: Record<string, unknown>;
      }) => {
        const meta = m.metadata ?? {};
        const title = meta.title || meta.name || meta.subject || "";
        return `[${m.source_type}${title ? `: ${title}` : ""}]\n${m.content_text}`;
      },
    );
    return `# Recent Data (Fallback - no semantic matches found)\n\n${sections.join("\n\n---\n\n")}`;
  }

  const sections = matches.map(
    (m: {
      source_type: string;
      content_text: string;
      similarity: number;
      metadata: Record<string, unknown>;
    }) => {
      const meta = m.metadata ?? {};
      const title = meta.title || meta.name || meta.subject || "";
      return `[${m.source_type}${title ? `: ${title}` : ""}] (relevance: ${(m.similarity * 100).toFixed(0)}%)\n${m.content_text}`;
    },
  );

  return `# Relevant Data (RAG Search Results)\n\n${sections.join("\n\n---\n\n")}`;
};

// ── Agentic Search ──

const AGENTIC_MODEL = "gemini-3-flash-preview";
const MAX_REFINE_ROUNDS = 1;

type MatchResult = {
  source_type: string;
  source_id: string;
  content_text: string;
  similarity: number;
  metadata: Record<string, unknown>;
};

type WriteStatus = (step: string, detail: string) => void;

const callGeminiFlash = async (prompt: string): Promise<string> => {
  if (!geminiApiKey)
    throw new Error("Missing GEMINI_API_KEY for agentic search");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${AGENTIC_MODEL}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini Flash error: ${response.status}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
};

const decomposeQuery = async (userQuery: string): Promise<string[]> => {
  const prompt = `You are a search query optimizer for a personal data management app.
Given a user's question, decompose it into 1-5 focused search queries that will retrieve relevant information from the user's personal data (memos, journal entries, emails, tasks, projects, clients, media feeds).

Each query should target a different aspect of the question to maximize recall.
Keep queries concise (3-8 words each).
If the question is already simple and focused, return just 1-2 queries.

User question: "${userQuery}"

Respond with JSON: { "queries": ["query1", "query2", ...] }`;

  const raw = await callGeminiFlash(prompt);
  const parsed = JSON.parse(raw) as { queries?: string[] };
  const queries = parsed.queries ?? [];
  if (queries.length === 0) return [userQuery];
  return queries.slice(0, 5);
};

const evaluateResults = async (
  userQuery: string,
  results: string,
): Promise<{ sufficient: boolean; refinedQueries: string[] }> => {
  const prompt = `You are evaluating search results for a user's question.
Determine if the retrieved data contains enough information to answer the question.

User question: "${userQuery}"

Retrieved data:
${results.slice(0, 6000)}

Respond with JSON:
{
  "sufficient": true or false,
  "refinedQueries": ["query1", ...] (only if sufficient is false, max 3 queries targeting missing information)
}`;

  const raw = await callGeminiFlash(prompt);
  const parsed = JSON.parse(raw) as {
    sufficient?: boolean;
    refinedQueries?: string[];
  };
  return {
    sufficient: parsed.sufficient ?? true,
    refinedQueries: parsed.refinedQueries ?? [],
  };
};

const searchMultipleQueries = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  queries: string[],
  matchCountPerQuery = 8,
): Promise<MatchResult[]> => {
  const embeddings = await Promise.all(
    queries.map((q) => generateQueryEmbedding(q)),
  );

  const results = await Promise.all(
    embeddings.map((emb) =>
      supabaseAdmin.rpc("match_documents", {
        query_embedding: emb,
        match_user_id: userId,
        match_count: matchCountPerQuery,
        match_threshold: 0.2,
      }),
    ),
  );

  const seen = new Set<string>();
  const merged: MatchResult[] = [];
  for (const { data } of results) {
    if (!data) continue;
    for (const m of data as MatchResult[]) {
      const key = `${m.source_type}:${m.source_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
    }
  }
  merged.sort((a, b) => b.similarity - a.similarity);
  return merged;
};

const formatMatchResults = (matches: MatchResult[]): string => {
  if (matches.length === 0) return "";
  const sections = matches.map((m) => {
    const meta = m.metadata ?? {};
    const title = meta.title || meta.name || meta.subject || "";
    return `[${m.source_type}${title ? `: ${title}` : ""}] (relevance: ${(m.similarity * 100).toFixed(0)}%)\n${m.content_text}`;
  });
  return `# Relevant Data (Agentic Search Results)\n\n${sections.join("\n\n---\n\n")}`;
};

const agenticSearch = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  userQuery: string,
  writeStatus: WriteStatus,
): Promise<string> => {
  // Step 1: Decompose query
  writeStatus("planning", "検索クエリを分析中...");
  const subQueries = await decomposeQuery(userQuery);

  // Step 2: Search with all sub-queries in parallel
  writeStatus(
    "searching",
    `関連データを検索中 (${subQueries.length}件のクエリ)`,
  );
  let allMatches = await searchMultipleQueries(
    supabaseAdmin,
    userId,
    subQueries,
  );

  if (allMatches.length === 0) {
    return "";
  }

  // Step 3: Evaluate results
  writeStatus("evaluating", "検索結果を評価中...");
  const formatted = formatMatchResults(allMatches);
  const evaluation = await evaluateResults(userQuery, formatted);

  // Step 4: Refine if needed (max 1 round)
  if (
    !evaluation.sufficient &&
    evaluation.refinedQueries.length > 0 &&
    MAX_REFINE_ROUNDS > 0
  ) {
    writeStatus("refining", "追加情報を検索中...");
    const additionalMatches = await searchMultipleQueries(
      supabaseAdmin,
      userId,
      evaluation.refinedQueries,
      6,
    );

    // Merge additional results, dedup by source_id
    const existingKeys = new Set(
      allMatches.map((m) => `${m.source_type}:${m.source_id}`),
    );
    for (const m of additionalMatches) {
      const key = `${m.source_type}:${m.source_id}`;
      if (!existingKeys.has(key)) {
        allMatches.push(m);
        existingKeys.add(key);
      }
    }
    allMatches.sort((a, b) => b.similarity - a.similarity);
  }

  writeStatus("generating", "回答を生成中...");
  return formatMatchResults(allMatches);
};

// ── Utilities ──

const buildUserPrompt = (dataContext: string, content: string) =>
  dataContext
    ? `# Data\n${dataContext}\n\n# User Question\n${content}`
    : `# User Question\n${content}\n\nNote: No specific data was retrieved for this query. Answer based on your general knowledge and the conversation context.`;

const readErrorMessage = async (response: Response) => {
  const text = await response.text();
  if (!text) return response.statusText;
  try {
    const json = JSON.parse(text);
    return json.error?.message || json.message || text;
  } catch {
    return text;
  }
};

const summarizeForNotification = (content: string) => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137)}...`;
};

// ── Streaming provider functions ──

type WriteChunk = (text: string) => void;

const streamGemini = async (
  onChunk: WriteChunk,
  prompt: string,
  model: string,
  systemInstruction: string,
  history: HistoryMessage[] = [],
  attachments: FileAttachment[] = [],
  responseMimeType?: string,
): Promise<string> => {
  if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

  // Build multi-turn contents from history + current message
  const contents: Record<string, unknown>[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Current user message (with data context) + attachments
  const currentParts: Record<string, unknown>[] = [{ text: prompt }];
  for (const att of attachments) {
    currentParts.push({
      inline_data: { mime_type: att.mimeType, data: att.base64Data },
    });
  }
  contents.push({ role: "user", parts: currentParts });

  const requestBody: Record<string, unknown> = { contents };
  if (systemInstruction) {
    requestBody.system_instruction = {
      parts: [{ text: systemInstruction }],
    };
  }
  if (responseMimeType) {
    requestBody.generationConfig = { responseMimeType };
  } else {
    requestBody.tools = [{ google_search: {} }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));

  let fullContent = "";
  for await (const data of readProviderSSE(response)) {
    try {
      const json = JSON.parse(data);
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (text) {
        fullContent += text;
        onChunk(text);
      }
    } catch {
      /* skip malformed */
    }
  }
  return fullContent;
};

const streamOpenAi = async (
  onChunk: WriteChunk,
  onStatus: WriteStatus,
  prompt: string,
  model: string,
  systemInstruction: string,
  history: HistoryMessage[] = [],
  attachments: FileAttachment[] = [],
  tools: ToolDefinition[] = [],
  supabaseAdminRef?: ReturnType<typeof createClient>,
  toolUserId?: string,
): Promise<string> => {
  if (!openaiApiKey) throw new Error("Missing OPENAI_API_KEY");

  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const userContent: unknown =
    images.length > 0
      ? [
          { type: "text", text: prompt },
          ...images.map((a) => ({
            type: "image_url",
            image_url: {
              url: `data:${a.mimeType};base64,${a.base64Data}`,
            },
          })),
        ]
      : prompt;

  const messages: { role: string; content: unknown }[] = [
    { role: "system", content: systemInstruction },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];

  const useTools = tools.length > 0 && !!supabaseAdminRef && !!toolUserId;
  const openaiTools = useTools
    ? tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }))
    : undefined;

  let fullContent = "";

  for (let round = 0; round <= (useTools ? MAX_TOOL_ROUNDS : 0); round++) {
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.7,
      stream: true,
    };
    if (openaiTools) requestBody.tools = openaiTools;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));

    let roundText = "";
    const toolCallBuffers = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    for await (const data of readProviderSSE(response)) {
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          roundText += delta.content;
          fullContent += delta.content;
          onChunk(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls as {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[]) {
            let buf = toolCallBuffers.get(tc.index);
            if (!buf) {
              buf = { id: tc.id ?? "", name: "", args: "" };
              toolCallBuffers.set(tc.index, buf);
            }
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name += tc.function.name;
            if (tc.function?.arguments) buf.args += tc.function.arguments;
          }
        }
      } catch {
        /* skip malformed */
      }
    }

    const toolCalls = [...toolCallBuffers.values()];
    if (toolCalls.length === 0) break;

    onStatus(
      "tool_call",
      `ツール実行中: ${toolCalls.map((t) => t.name).join(", ")}`,
    );

    const assistantMsg: Record<string, unknown> = { role: "assistant" };
    if (roundText) assistantMsg.content = roundText;
    assistantMsg.tool_calls = toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments },
    }));
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.args);
      } catch {
        /* empty */
      }
      const result = await executeGwsTool(
        supabaseAdminRef!,
        toolUserId!,
        tc.name,
        input,
      );
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return fullContent;
};
// ── Anthropic Tool Use support ──

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type ContentBlock = TextBlock | ToolUseBlock;

async function parseAnthropicStream(
  response: Response,
  onChunk: WriteChunk,
): Promise<{ blocks: ContentBlock[]; stopReason: string }> {
  const blocks: ContentBlock[] = [];
  let currentIndex = -1;
  let currentType = "";
  let inputJsonBuffer = "";
  let stopReason = "";

  for await (const data of readProviderSSE(response)) {
    try {
      const event = JSON.parse(data);
      switch (event.type) {
        case "content_block_start": {
          currentIndex = event.index;
          const cb = event.content_block;
          if (cb.type === "text") {
            currentType = "text";
            blocks[currentIndex] = { type: "text", text: "" };
          } else if (cb.type === "tool_use") {
            currentType = "tool_use";
            inputJsonBuffer = "";
            blocks[currentIndex] = {
              type: "tool_use",
              id: cb.id,
              name: cb.name,
              input: {},
            };
          }
          break;
        }
        case "content_block_delta": {
          if (currentType === "text" && event.delta?.type === "text_delta") {
            const text = event.delta.text ?? "";
            if (text) {
              (blocks[currentIndex] as TextBlock).text += text;
              onChunk(text);
            }
          } else if (
            currentType === "tool_use" &&
            event.delta?.type === "input_json_delta"
          ) {
            inputJsonBuffer += event.delta.partial_json ?? "";
          }
          break;
        }
        case "content_block_stop": {
          if (currentType === "tool_use" && inputJsonBuffer) {
            try {
              (blocks[currentIndex] as ToolUseBlock).input =
                JSON.parse(inputJsonBuffer);
            } catch {
              /* invalid json */
            }
          }
          currentType = "";
          inputJsonBuffer = "";
          break;
        }
        case "message_delta": {
          stopReason = event.delta?.stop_reason ?? stopReason;
          break;
        }
      }
    } catch {
      /* skip malformed */
    }
  }

  return { blocks: blocks.filter(Boolean), stopReason };
}

const MAX_TOOL_ROUNDS = 10;

const streamAnthropic = async (
  onChunk: WriteChunk,
  onStatus: WriteStatus,
  prompt: string,
  model: string,
  systemInstruction: string,
  history: HistoryMessage[] = [],
  attachments: FileAttachment[] = [],
  gwsTools: ToolDefinition[] = [],
  supabaseAdminRef?: ReturnType<typeof createClient>,
  toolUserId?: string,
): Promise<string> => {
  if (!anthropicApiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const parts: Record<string, unknown>[] = attachments
    .map((a) => {
      if (a.mimeType.startsWith("image/")) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: a.mimeType,
            data: a.base64Data,
          },
        };
      }
      if (a.mimeType === "application/pdf") {
        return {
          type: "document",
          source: {
            type: "base64",
            media_type: a.mimeType,
            data: a.base64Data,
          },
        };
      }
      return null;
    })
    .filter((p): p is Record<string, unknown> => p !== null);
  parts.push({ type: "text", text: prompt });
  const userContent: unknown = attachments.length > 0 ? parts : prompt;

  const messages: { role: string; content: unknown }[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];

  let fullContent = "";
  const useTools = gwsTools.length > 0 && !!supabaseAdminRef && !!toolUserId;

  for (let round = 0; round <= (useTools ? MAX_TOOL_ROUNDS : 0); round++) {
    const requestBody: Record<string, unknown> = {
      model,
      system: systemInstruction,
      max_tokens: 8192,
      messages,
      stream: true,
    };
    if (useTools) {
      requestBody.tools = gwsTools;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));

    if (!useTools) {
      // Simple streaming (no tools) — original behaviour
      for await (const data of readProviderSSE(response)) {
        try {
          const json = JSON.parse(data);
          if (json.type === "content_block_delta") {
            const text = json.delta?.text ?? "";
            if (text) {
              fullContent += text;
              onChunk(text);
            }
          }
        } catch {
          /* skip malformed */
        }
      }
      break;
    }

    // Tool-use-enabled streaming
    const { blocks, stopReason } = await parseAnthropicStream(
      response,
      onChunk,
    );

    for (const block of blocks) {
      if (block.type === "text") fullContent += block.text;
    }

    if (stopReason !== "tool_use") break;

    const toolUseBlocks = blocks.filter(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );
    if (toolUseBlocks.length === 0) break;

    // Notify client
    const toolNames = toolUseBlocks.map((t) => t.name).join(", ");
    onStatus("tool_call", `ツール実行中: ${toolNames}`);

    // Execute tools in parallel
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const result = await executeGwsTool(
          supabaseAdminRef!,
          toolUserId!,
          block.name,
          block.input,
        );
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        };
      }),
    );

    // Add assistant + tool_result messages for next round
    messages.push({
      role: "assistant",
      content: blocks.map((b) => {
        if (b.type === "text") return { type: "text", text: b.text };
        return {
          type: "tool_use",
          id: b.id,
          name: b.name,
          input: b.input,
        };
      }),
    });
    messages.push({ role: "user", content: toolResults });
  }

  return fullContent;
};

const streamPerplexity = async (
  onChunk: WriteChunk,
  prompt: string,
  model: string,
  systemInstruction: string,
  history: HistoryMessage[] = [],
): Promise<string> => {
  if (!perplexityApiKey) throw new Error("Missing PERPLEXITY_API_KEY");

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemInstruction },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: prompt },
  ];

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${perplexityApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: true,
    }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));

  let fullContent = "";
  let citations: string[] = [];
  for await (const data of readProviderSSE(response)) {
    try {
      const json = JSON.parse(data);
      const text = json?.choices?.[0]?.delta?.content ?? "";
      if (text) {
        fullContent += text;
        onChunk(text);
      }
      if (json?.citations) {
        citations = json.citations as string[];
      }
    } catch {
      /* skip malformed */
    }
  }

  if (citations.length > 0) {
    const citationText = `\n\n---\n**Sources:**\n${citations.map((url: string, i: number) => `${i + 1}. ${url}`).join("\n")}`;
    fullContent += citationText;
    onChunk(citationText);
  }
  return fullContent;
};

// ── Main handler ──

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = (await req.json()) as AiRequestPayload;
  if (!payload?.content) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = user.id;
  const nowIso = new Date().toISOString();
  const isSessionMode = !!payload.sessionId;
  const provider = payload.provider ?? "gemini";
  const model = payload.model ?? "gemini-2.5-pro";
  const attachments = payload.attachments ?? [];

  if (attachments.length > MAX_ATTACHMENTS) {
    return new Response(
      JSON.stringify({
        error: `Too many attachments (max ${MAX_ATTACHMENTS})`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  for (const att of attachments) {
    const sizeBytes = Math.ceil((att.base64Data?.length ?? 0) * 0.75);
    if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Attachment "${att.name}" exceeds 10MB limit`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  if (!["gemini", "openai", "anthropic", "perplexity"].includes(provider)) {
    return new Response(JSON.stringify({ error: "Unsupported provider" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Session/message upserts (non-blocking for agentic mode)
  const userMessageId = payload.userMessageId ?? crypto.randomUUID();
  const searchMode = payload.searchMode ?? "standard";
  const systemInstruction = payload.systemInstruction ?? "";
  const history = (payload.history ?? []).slice(
    -MAX_HISTORY_MESSAGES,
  ) as HistoryMessage[];

  const sessionUpserts = Promise.all([
    isSessionMode
      ? supabaseAdmin.from("ai_sessions").upsert(
          {
            id: payload.sessionId,
            user_id: userId,
            title: payload.sessionTitle || "New chat",
            updated_at: nowIso,
          },
          { onConflict: "id" },
        )
      : Promise.resolve(),
    isSessionMode
      ? supabaseAdmin.from("ai_messages").upsert(
          {
            id: userMessageId,
            session_id: payload.sessionId,
            user_id: userId,
            role: "user",
            content: payload.content,
            created_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "id" },
        )
      : Promise.resolve(),
  ]);

  // Return SSE streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const onChunk = (text: string) => {
        writeSSE(controller, { type: "chunk", content: text });
      };
      const writeSearchStatus = (step: string, detail: string) => {
        writeSSE(controller, { type: "search_status", step, detail });
      };

      try {
        // RAG search (standard or agentic)
        let dataContext = payload.dataContext ?? "";
        if (!dataContext && !payload.skipRag) {
          if (searchMode === "agentic") {
            try {
              dataContext = await agenticSearch(
                supabaseAdmin,
                userId,
                payload.content,
                writeSearchStatus,
              );
            } catch (agenticErr) {
              console.error(
                "Agentic search failed, falling back to standard:",
                agenticErr,
              );
              writeSearchStatus("fallback", "標準検索にフォールバック中...");
              try {
                dataContext = await searchRelevantDocuments(
                  supabaseAdmin,
                  userId,
                  payload.content,
                  15,
                );
              } catch (ragErr) {
                console.error("Standard RAG fallback also failed:", ragErr);
              }
            }
          } else {
            try {
              dataContext = await searchRelevantDocuments(
                supabaseAdmin,
                userId,
                payload.content,
                15,
              );
            } catch (ragErr) {
              console.error("RAG search failed:", ragErr);
            }
          }
        }

        // Wait for session upserts
        await sessionUpserts;

        const userPrompt = buildUserPrompt(dataContext, payload.content);

        let fullContent = "";

        // Cost limit check
        const costCheck = await checkCostLimit(supabaseAdmin, provider);
        if (!costCheck.allowed) {
          onChunk(`⚠️ ${costCheck.reason}`);
          writeSSE(controller, {
            type: "done",
            messageId: crypto.randomUUID(),
            content: `⚠️ ${costCheck.reason}`,
          });
          controller.close();
          return;
        }

        if (provider === "gemini") {
          fullContent = await streamGemini(
            onChunk,
            userPrompt,
            model,
            systemInstruction,
            history,
            attachments,
            payload.responseMimeType,
          );
        } else if (provider === "openai") {
          // OpenAI: web_search + GWS tools (same as Anthropic)
          const openaiTools: ToolDefinition[] = [WEB_SEARCH_TOOL];
          let openaiSystem =
            systemInstruction +
            "\n\nYou have access to a web_search tool. Use it to search for real-time information, people's profiles (X/Twitter, LinkedIn, etc.), news, and current events. Today's date is " +
            new Date().toISOString().slice(0, 10) +
            ".";
          const { data: openaiGoogleToken } = await supabaseAdmin
            .from("user_google_tokens")
            .select("id")
            .eq("user_id", userId)
            .eq("is_valid", true)
            .limit(1)
            .maybeSingle();
          if (openaiGoogleToken) {
            openaiTools.push(...GWS_TOOLS);
            openaiSystem +=
              "\n\nYou also have access to Google Workspace tools (Gmail, Calendar, Drive, Docs, Sheets). Use them when the user asks about their emails, calendar events, files, or documents. For actions with side effects (sending emails, creating/modifying/deleting events, uploading files, etc.), always confirm with the user before executing.";
          }
          fullContent = await streamOpenAi(
            onChunk,
            writeSearchStatus,
            userPrompt,
            model,
            openaiSystem,
            history,
            attachments,
            openaiTools,
            supabaseAdmin,
            userId,
          );
        } else if (provider === "anthropic") {
          // Check for GWS tools availability
          const toolsDefs: ToolDefinition[] = [WEB_SEARCH_TOOL];
          let anthroSystem =
            systemInstruction +
            "\n\nYou have access to a web_search tool. Use it to search for real-time information, people's profiles (X/Twitter, LinkedIn, etc.), news, and current events. Today's date is " +
            new Date().toISOString().slice(0, 10) +
            ".";
          const { data: googleToken } = await supabaseAdmin
            .from("user_google_tokens")
            .select("id")
            .eq("user_id", userId)
            .eq("is_valid", true)
            .limit(1)
            .maybeSingle();
          if (googleToken) {
            toolsDefs.push(...GWS_TOOLS);
            anthroSystem +=
              "\n\nYou also have access to Google Workspace tools (Gmail, Calendar, Drive, Docs, Sheets). Use them when the user asks about their emails, calendar events, files, or documents. For actions with side effects (sending emails, creating/modifying/deleting events, uploading files, etc.), always confirm with the user before executing.";
          }
          fullContent = await streamAnthropic(
            onChunk,
            writeSearchStatus,
            userPrompt,
            model,
            anthroSystem,
            history,
            attachments,
            toolsDefs,
            supabaseAdmin,
            userId,
          );
        } else {
          fullContent = await streamPerplexity(
            onChunk,
            userPrompt,
            model,
            systemInstruction,
            history,
          );
        }

        // Log API usage for cost tracking (fire-and-forget)
        const inputTokens = estimateTokensFromText(
          userPrompt + systemInstruction,
        );
        const outputTokens = estimateTokensFromText(fullContent);
        logApiUsage(
          supabaseAdmin,
          provider,
          model,
          "ai_hub_chat",
          inputTokens,
          outputTokens,
        ).catch(() => {
          /* non-critical */
        });

        const assistantMessageId = crypto.randomUUID();
        const finalContent = fullContent || "No response generated.";
        const assistantCreatedAt = new Date().toISOString();

        // Save assistant message to DB before done event
        if (isSessionMode) {
          await supabaseAdmin.from("ai_messages").upsert(
            {
              id: assistantMessageId,
              session_id: payload.sessionId,
              user_id: userId,
              role: "assistant",
              content: finalContent,
              created_at: assistantCreatedAt,
              updated_at: assistantCreatedAt,
            },
            { onConflict: "id" },
          );
        }

        writeSSE(controller, {
          type: "done",
          assistantMessage: {
            id: assistantMessageId,
            content: finalContent,
            created_at: assistantCreatedAt,
          },
        });

        // Push notification: await before closing to keep isolate alive
        if (
          isSessionMode &&
          (await isPushCategoryEnabled(supabaseAdmin, userId, "pushAiChat"))
        ) {
          await sendPushToUser(supabaseAdmin, userId, {
            title: "Hub-AI",
            body: summarizeForNotification(finalContent),
            url: `/ai/hub-ai?session=${payload.sessionId}`,
            tag: assistantMessageId,
            sessionId: payload.sessionId,
          }).catch((err: unknown) =>
            console.error("Push notification error:", err),
          );
        }

        controller.close();
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown AI provider error";
        console.error(`AI provider (${provider}) error:`, errorMsg);

        const errorMessageId = crypto.randomUUID();
        const errorContent = `Error: ${errorMsg}`;
        const errorCreatedAt = new Date().toISOString();

        if (isSessionMode) {
          await supabaseAdmin
            .from("ai_messages")
            .upsert(
              {
                id: errorMessageId,
                session_id: payload.sessionId,
                user_id: userId,
                role: "assistant",
                content: errorContent,
                created_at: errorCreatedAt,
                updated_at: errorCreatedAt,
              },
              { onConflict: "id" },
            )
            .catch(console.error);
        }

        writeSSE(controller, {
          type: "error",
          error: errorMsg,
          assistantMessage: {
            id: errorMessageId,
            content: errorContent,
            created_at: errorCreatedAt,
          },
        });

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});
