import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  join,
  dirname,
  normalize,
  resolve,
  relative,
  sep,
  isAbsolute,
} from "node:path";
import { fileURLToPath } from "node:url";
import { taskQueue } from "./taskQueue.js";
import { messageStore } from "./messageStore.js";
import { postStore } from "./postStore.js";
import { generatePosts } from "./postGenerator.js";
import { pressReleaseStore } from "./pressReleaseStore.js";
import { generatePressRelease } from "./pressReleaseGenerator.js";
import { runClaudeCode } from "./claude.js";
import { AGENTS, AGENT_MAP } from "./agents.js";
import type { AgentGroup, OrchestrateEvent, Platform } from "./types.js";
import { persistChatMessage } from "./supabasePersist.js";
import { getDiarySchedulerStatus, triggerDiaryNow } from "./diaryScheduler.js";
import { getPostSchedulerStatus, triggerPostsNow } from "./postScheduler.js";
import { autonomousQueue } from "./autonomousQueue.js";
import {
  getReviewSchedulerStatus,
  triggerReviewNow,
} from "./reviewScheduler.js";
import {
  getModelWatchStatus,
  triggerModelCheckNow,
} from "./modelWatchScheduler.js";
import { getRegistrySummary } from "./modelRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const companyRoutes = new Hono();

const SERVER_START_TIME = Date.now();

const MAX_TASK_LENGTH = 10_000;

// POST /orchestrate — SSE streaming orchestration
companyRoutes.post("/orchestrate", async (c) => {
  let body: { task?: string; targetGroup?: AgentGroup };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { task, targetGroup } = body;
  if (!task || typeof task !== "string") {
    return c.json({ error: "task is required" }, 400);
  }
  if (task.length > MAX_TASK_LENGTH) {
    return c.json(
      { error: `task too long (max ${MAX_TASK_LENGTH} chars)` },
      400,
    );
  }

  const encoder = new TextEncoder();
  const origin = c.req.header("Origin") ?? "*";

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: OrchestrateEvent) => {
        const data = JSON.stringify(event);
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // stream closed
        }
      };

      try {
        await taskQueue.enqueue(task, targetGroup, sendEvent);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        sendEvent({
          type: "error",
          agentId: "system",
          content: errMsg,
          timestamp: Date.now(),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    },
  });
});

// POST /orchestrate-sync — synchronous orchestration for iOS Shortcuts / Apple Watch
companyRoutes.post("/orchestrate-sync", async (c) => {
  let body: { task?: string; targetGroup?: AgentGroup };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { task, targetGroup } = body;
  if (!task || typeof task !== "string") {
    return c.json({ error: "task is required" }, 400);
  }
  if (task.length > MAX_TASK_LENGTH) {
    return c.json(
      { error: `task too long (max ${MAX_TASK_LENGTH} chars)` },
      400,
    );
  }

  const agentOutputs: { agentId: string; content: string }[] = [];
  let lastError: string | null = null;

  try {
    await taskQueue.enqueue(task, targetGroup, (event: OrchestrateEvent) => {
      if (event.type === "agent-done") {
        agentOutputs.push({
          agentId: event.agentId,
          content: event.content,
        });
      } else if (event.type === "error") {
        lastError = event.content;
      }
    });
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Unknown error";
  }

  const summary = agentOutputs
    .map((a) => `【${a.agentId}】${a.content.slice(0, 200)}`)
    .join("\n\n");

  return c.json({
    task,
    status: lastError ? "error" : "completed",
    error: lastError,
    agents: agentOutputs,
    summary: summary || lastError || "No output",
  });
});

// POST /chat — individual agent chat
companyRoutes.post("/chat", async (c) => {
  let body: { agentId?: string; message?: string; taskContext?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { agentId, message, taskContext } = body;
  if (!agentId || !message) {
    return c.json({ error: "agentId and message are required" }, 400);
  }

  const agent = AGENT_MAP.get(agentId);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  // Store user message
  messageStore.addMessage({
    fromAgentId: "user",
    toAgentId: agentId,
    content: message,
    type: "chat",
  });

  messageStore.addTerminalLine(agentId, `[USER] ${message}`, "input");
  messageStore.setAgentStatus(agentId, "thinking", message);

  // Build context from recent conversation
  const recentMessages = messageStore
    .getAgentMessages(agentId, 20)
    .map((m) => {
      const fromName =
        m.fromAgentId === "user"
          ? "ユーザー"
          : (AGENT_MAP.get(m.fromAgentId)?.name ?? m.fromAgentId);
      const toName =
        m.toAgentId === "all"
          ? "全員"
          : m.toAgentId === "user"
            ? "ユーザー"
            : (AGENT_MAP.get(m.toAgentId)?.name ?? m.toAgentId);
      return `[${fromName}→${toName}] ${m.content}`;
    })
    .join("\n");

  const teamMembers = AGENTS.filter(
    (a) => a.group === agent.group && a.id !== agent.id,
  )
    .map((a) => `- ${a.name}（${a.role}）`)
    .join("\n");

  const taskContextBlock = taskContext
    ? `\n## 前回のタスク結果（フォローアップ質問の背景）\n${taskContext}\n`
    : "";

  const systemPrompt = `${agent.systemPrompt}

## チームメンバー
${teamMembers}
${taskContextBlock}
## 会話履歴
${recentMessages || "（まだ会話はありません）"}

## ルール
- ユーザーとの1対1チャットです
- あなたのキャラクターと専門性を活かして回答してください
- 自然な日本語で会話してください
- 必要に応じて専門的なアドバイスを提供してください
- 200文字程度で回答してください
- ツールは一切使わず、テキストのみで回答して`;

  try {
    const result = await runClaudeCode(systemPrompt, message);

    messageStore.addMessage({
      fromAgentId: agentId,
      toAgentId: "user",
      content: result,
      type: "chat",
    });

    // Persist both user message and agent reply
    persistChatMessage("user", agentId, message, "chat").catch(() => {});
    persistChatMessage(agentId, "user", result, "chat").catch(() => {});

    messageStore.addTerminalLine(agentId, result, "output");
    messageStore.setAgentStatus(agentId, "idle");

    return c.json({
      agentId,
      agentName: agent.name,
      content: result,
      timestamp: Date.now(),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    messageStore.setAgentStatus(agentId, "idle");
    return c.json({ error: errMsg }, 500);
  }
});

// GET /messages — get messages, events, agent states (paginated)
// Query params: limit (default 100), offset (default 0, from newest)
companyRoutes.get("/messages", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const { messages, total, hasMore } = messageStore.getMessagesPage(
    limit,
    offset,
  );
  const states = messageStore.getAllStates();
  const events = messageStore.getEvents(200);

  return c.json({
    messages,
    total,
    hasMore,
    limit,
    offset,
    events,
    agents: AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      group: a.group,
      gender: a.gender,
      state: states.find((s) => s.agentId === a.id),
    })),
  });
});

// GET /agents — list all agents with current state
companyRoutes.get("/agents", (c) => {
  const states = messageStore.getAllStates();
  return c.json({
    agents: AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      nameEn: a.nameEn,
      role: a.role,
      roleEn: a.roleEn,
      group: a.group,
      gender: a.gender,
      state: states.find((s) => s.agentId === a.id) ?? null,
    })),
  });
});

// GET /agents/:id/state — individual agent state
companyRoutes.get("/agents/:id/state", (c) => {
  const { id } = c.req.param();
  const agent = AGENT_MAP.get(id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }
  const state = messageStore.getAgentState(id);
  return c.json({
    agent: { id: agent.id, name: agent.name, role: agent.role },
    state: state ?? null,
  });
});

// GET /agents/:id/messages — per-agent message history (paginated)
// Query params: limit (default 30), offset (default 0, from newest)
companyRoutes.get("/agents/:id/messages", (c) => {
  const { id } = c.req.param();
  if (!AGENT_MAP.has(id)) {
    return c.json({ error: "Agent not found" }, 404);
  }
  const limit = Math.min(Number(c.req.query("limit") ?? 30), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const { messages, total, hasMore } = messageStore.getAgentMessagesPage(
    id,
    limit,
    offset,
  );
  return c.json({ messages, total, hasMore, limit, offset });
});

// GET /queue — task queue status
companyRoutes.get("/queue", (c) => {
  return c.json(taskQueue.getStatus());
});

// POST /approve — approve or reject a pending task
companyRoutes.post("/approve", async (c) => {
  let body: { taskId?: string; approved?: boolean };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { taskId, approved } = body;
  if (!taskId || typeof approved !== "boolean") {
    return c.json({ error: "taskId and approved (boolean) are required" }, 400);
  }

  const ok = taskQueue.respondToApproval(taskId, approved);
  if (!ok) {
    return c.json({ error: "No pending approval for this task" }, 404);
  }

  return c.json({ ok: true, taskId, approved });
});

// POST /answer — respond to a pending question
companyRoutes.post("/answer", async (c) => {
  let body: { taskId?: string; answer?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { taskId, answer } = body;
  if (!taskId || typeof answer !== "string") {
    return c.json({ error: "taskId and answer (string) are required" }, 400);
  }

  const ok = taskQueue.respondToQuestion(taskId, answer);
  if (!ok) {
    return c.json({ error: "No pending question for this task" }, 404);
  }

  return c.json({ ok: true, taskId });
});

// DELETE /messages — reset all messages and state
companyRoutes.delete("/messages", (c) => {
  messageStore.reset();
  taskQueue.reset();
  return c.json({ ok: true });
});

// GET /posts — get all posts
companyRoutes.get("/posts", (c) => {
  return c.json({ posts: postStore.getPosts() });
});

// POST /posts — generate posts for a topic
// Body: { topic: string, platforms?: Platform[] }
companyRoutes.post("/posts", async (c) => {
  let body: { topic?: string; platforms?: Platform[] };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { topic, platforms: requestedPlatforms } = body;
  if (!topic || typeof topic !== "string") {
    return c.json({ error: "topic is required" }, 400);
  }

  const ALL_PLATFORMS: Platform[] = [
    "x",
    "note",
    "general",
    "instagram",
    "tiktok",
  ];
  const platforms: Platform[] =
    Array.isArray(requestedPlatforms) && requestedPlatforms.length > 0
      ? requestedPlatforms.filter((p): p is Platform =>
          ALL_PLATFORMS.includes(p as Platform),
        )
      : ["x", "note", "general"];

  if (platforms.length === 0) {
    return c.json({ error: "No valid platforms specified" }, 400);
  }

  const placeholders = platforms.map((platform) =>
    postStore.addPost({
      platform,
      content: "",
      agentId: "sns",
      agentName: "小林 さくら",
      topic,
      status: "generating",
    }),
  );

  // Generate in background, return placeholders immediately
  generatePosts(topic, placeholders).catch(console.error);

  return c.json({ posts: placeholders });
});

// POST /posts/strategy — SNS engagement strategy for a topic
companyRoutes.post("/posts/strategy", async (c) => {
  let body: { topic?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { topic } = body;
  if (!topic || typeof topic !== "string") {
    return c.json({ error: "topic is required" }, 400);
  }

  const snsAgent = AGENT_MAP.get("sns");
  if (!snsAgent) {
    return c.json({ error: "sns agent not configured" }, 500);
  }
  const systemPrompt = `${snsAgent.systemPrompt}

あなたのSNS戦略の専門知識を活かして、与えられたトピックに対するエンゲージメント向上戦略を提案してください。`;

  const userPrompt = `トピック「${topic}」に対するSNSエンゲージメント戦略を提案してください。

以下の形式でJSONのみを出力してください（前置き・説明は不要）：
{
  "bestPlatforms": ["最適なプラットフォーム名を優先順に3つ"],
  "postingTimes": ["最適な投稿時間帯を2-3個（例: 平日12時、19-21時）"],
  "contentTips": ["バズるコンテンツのポイントを3つ"],
  "hashtags": ["推奨ハッシュタグを5-8個"],
  "engagementTactics": ["エンゲージメント向上施策を3つ"]
}`;

  try {
    const raw = await runClaudeCode(systemPrompt, userPrompt);
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return c.json({ error: "Strategy generation failed", raw }, 500);
    }
    let strategy: Record<string, unknown>;
    try {
      strategy = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Strategy JSON parse failed", raw }, 500);
    }
    // Validate expected shape
    const hasExpectedKeys = ["bestPlatforms", "contentTips", "hashtags"].some(
      (k) => k in strategy,
    );
    if (!hasExpectedKeys) {
      return c.json({ error: "Unexpected strategy format", strategy }, 500);
    }
    return c.json({
      topic,
      strategy,
      agentId: "sns",
      agentName: snsAgent.name,
      timestamp: Date.now(),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: errMsg }, 500);
  }
});

// GET /stats — runtime statistics
companyRoutes.get("/stats", (c) => {
  const states = messageStore.getAllStates();
  const posts = postStore.getPosts();
  const allMessages = messageStore.getMessages(500);

  const agentStatusCounts = states.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});

  const messageTypeCounts = allMessages.reduce<Record<string, number>>(
    (acc, m) => {
      acc[m.type] = (acc[m.type] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return c.json({
    uptime: Date.now() - SERVER_START_TIME,
    agents: {
      total: AGENTS.length,
      byStatus: agentStatusCounts,
    },
    messages: {
      total: allMessages.length,
      byType: messageTypeCounts,
    },
    posts: {
      total: posts.length,
      generating: posts.filter((p) => p.status === "generating").length,
      ready: posts.filter((p) => p.status === "ready").length,
    },
  });
});

// GET /capabilities — system capabilities description
companyRoutes.get("/capabilities", (c) => {
  return c.json({
    system: "AI Virtual Company - Hub Relay",
    version: "0.0.1",
    features: [
      {
        name: "マルチエージェント・オーケストレーション",
        endpoint: "POST /api/company/orchestrate",
        description:
          "PMが分析→担当選定→並列実行→統括。SSEでリアルタイムストリーミング。",
        params: {
          task: "string (required)",
          targetGroup: "tech|pr|operations (optional)",
        },
      },
      {
        name: "個別エージェントチャット",
        endpoint: "POST /api/company/chat",
        description: "エージェントIDを指定して1対1会話。",
        params: { agentId: "string", message: "string" },
      },
      {
        name: "SNS投稿生成",
        endpoint: "POST /api/company/posts",
        description: "X/Note/汎用の3プラットフォーム向け投稿を並列生成。",
        params: { topic: "string" },
      },
      {
        name: "Claude Codeリレー",
        endpoint: "POST /api/claude-code",
        description: "Claude CLIをサブプロセスで起動しSSEストリーミング出力。",
        params: { prompt: "string", sessionId: "string (optional)" },
      },
    ],
    agents: AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      group: a.group,
    })),
    limits: {
      maxMessages: 500,
      maxPosts: 100,
      agentTimeoutSec: 125,
      chatMaxChars: 200,
    },
  });
});

// GET /press-releases — list all press releases
companyRoutes.get("/press-releases", (c) => {
  return c.json({ pressReleases: pressReleaseStore.getAll() });
});

// POST /press-releases — generate a press release
companyRoutes.post("/press-releases", async (c) => {
  let body: { topic?: string; company?: string; keyPoints?: string[] };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { topic, company, keyPoints } = body;
  if (!topic || typeof topic !== "string") {
    return c.json({ error: "topic is required" }, 400);
  }
  if (!company || typeof company !== "string") {
    return c.json({ error: "company is required" }, 400);
  }

  const prManager = AGENT_MAP.get("pr-manager");
  if (!prManager) {
    return c.json({ error: "pr-manager agent not configured" }, 500);
  }
  const placeholder = pressReleaseStore.add({
    topic,
    company,
    keyPoints: Array.isArray(keyPoints) ? keyPoints : [],
    content: "",
    agentId: "pr-manager",
    agentName: prManager.name,
    status: "generating",
  });

  // Generate in background, return placeholder immediately
  generatePressRelease(placeholder).catch(console.error);

  return c.json({ pressRelease: placeholder });
});

// DELETE /press-releases — delete one or all press releases
companyRoutes.delete("/press-releases", async (c) => {
  let body: { id?: string } = {};
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    // empty body = reset all
  }

  if (body.id) {
    pressReleaseStore.delete(body.id);
  } else {
    pressReleaseStore.reset();
  }

  return c.json({ ok: true });
});

// DELETE /posts — delete one or all posts
companyRoutes.delete("/posts", async (c) => {
  let body: { id?: string } = {};
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    // empty body = reset all
  }

  if (body.id) {
    postStore.deletePost(body.id);
  } else {
    postStore.reset();
  }

  return c.json({ ok: true });
});

// ── Diary endpoints ──────────────────────────────────────────────────

// GET /diary/status — scheduler status
companyRoutes.get("/diary/status", (c) => {
  return c.json(getDiarySchedulerStatus());
});

// POST /diary/trigger — manual diary generation (on-demand)
companyRoutes.post("/diary/trigger", async (c) => {
  triggerDiaryNow().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[diary] Manual trigger failed:", msg);
  });
  return c.json({ ok: true, message: "日記生成を開始しました" });
});

// ── Post scheduler endpoints ─────────────────────────────────────────

// GET /posts/schedule/status — post scheduler status
companyRoutes.get("/posts/schedule/status", (c) => {
  return c.json(getPostSchedulerStatus());
});

// POST /posts/schedule/trigger — manual post generation (on-demand)
companyRoutes.post("/posts/schedule/trigger", async (c) => {
  triggerPostsNow().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[post-scheduler] Manual trigger failed:", msg);
  });
  return c.json({ ok: true, message: "投稿生成を開始しました" });
});

// ── Autonomous task endpoints ────────────────────────────────────────

// GET /autonomous/status — autonomous queue + review scheduler status
companyRoutes.get("/autonomous/status", (c) => {
  return c.json({
    queue: autonomousQueue.getStatus(),
    reviewScheduler: getReviewSchedulerStatus(),
  });
});

// POST /autonomous/config — update rate limits
companyRoutes.post("/autonomous/config", async (c) => {
  let body: {
    maxDepth?: number;
    maxPerHour?: number;
    maxPerDay?: number;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body.maxDepth === "number" &&
    body.maxDepth >= 1 &&
    body.maxDepth <= 10
  ) {
    autonomousQueue.maxDepth = body.maxDepth;
  }
  if (
    typeof body.maxPerHour === "number" &&
    body.maxPerHour >= 1 &&
    body.maxPerHour <= 50
  ) {
    autonomousQueue.maxPerHour = body.maxPerHour;
  }
  if (
    typeof body.maxPerDay === "number" &&
    body.maxPerDay >= 1 &&
    body.maxPerDay <= 200
  ) {
    autonomousQueue.maxPerDay = body.maxPerDay;
  }

  return c.json({
    ok: true,
    config: {
      maxDepth: autonomousQueue.maxDepth,
      maxPerHour: autonomousQueue.maxPerHour,
      maxPerDay: autonomousQueue.maxPerDay,
    },
  });
});

// POST /review/trigger — manual review trigger
companyRoutes.post("/review/trigger", async (c) => {
  triggerReviewNow().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[review-scheduler] Manual trigger failed:", msg);
  });
  return c.json({ ok: true, message: "自律レビューを開始しました" });
});

// ── Model Watch endpoints ────────────────────────────────────────────

// GET /model-watch/status — model watch scheduler status
companyRoutes.get("/model-watch/status", (c) => {
  return c.json(getModelWatchStatus());
});

// GET /model-watch/registry — current model registry summary
companyRoutes.get("/model-watch/registry", (c) => {
  return c.json({ summary: getRegistrySummary() });
});

// POST /model-watch/trigger — manual model check trigger
companyRoutes.post("/model-watch/trigger", async (c) => {
  triggerModelCheckNow().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[model-watch] Manual trigger failed:", msg);
  });
  return c.json({ ok: true, message: "モデル更新チェックを開始しました" });
});

// ---------- Artifact file access ----------

/** Allowed artifact directories (relative to this module) */
const ARTIFACT_DIRS = ["press-releases", "notices"] as const;

// GET /artifacts — list all artifact files across allowed directories
companyRoutes.get("/artifacts", (c) => {
  const files: { dir: string; name: string; path: string }[] = [];
  for (const dir of ARTIFACT_DIRS) {
    const absDir = join(__dirname, dir);
    if (!existsSync(absDir)) continue;
    for (const name of readdirSync(absDir)) {
      files.push({ dir, name, path: `${dir}/${name}` });
    }
  }
  return c.json({ files });
});

// GET /artifacts/:path{.+} — read a single artifact file
companyRoutes.get("/artifacts/:path{.+}", (c) => {
  const reqPath = c.req.param("path");
  const baseDir = resolve(__dirname);

  // Security: resolve() handles ".." traversal lexically
  // relative() then verifies the result stays inside baseDir
  const absPath = resolve(baseDir, reqPath);
  const rel = relative(baseDir, absPath);

  // rel must not escape baseDir (starts with ".." or is absolute)
  if (rel.startsWith("..") || rel.startsWith(sep) || isAbsolute(rel)) {
    return c.json({ error: "Invalid path" }, 400);
  }

  const parts = rel.split(sep);
  if (
    parts.length < 2 ||
    !ARTIFACT_DIRS.includes(parts[0] as (typeof ARTIFACT_DIRS)[number])
  ) {
    return c.json({ error: "Directory not allowed" }, 403);
  }

  if (!existsSync(absPath)) {
    return c.json({ error: "File not found" }, 404);
  }

  try {
    const content = readFileSync(absPath, "utf-8");
    return c.json({ path: rel, content });
  } catch {
    return c.json({ error: "Failed to read file" }, 500);
  }
});
