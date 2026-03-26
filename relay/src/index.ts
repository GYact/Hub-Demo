import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createServer } from "node:https";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { companyRoutes } from "./ai-company/routes.js";
import { startDiaryScheduler } from "./ai-company/diaryScheduler.js";
import { startPostScheduler } from "./ai-company/postScheduler.js";
import { startReviewScheduler } from "./ai-company/reviewScheduler.js";
import { startModelWatchScheduler } from "./ai-company/modelWatchScheduler.js";
import { autonomousQueue } from "./ai-company/autonomousQueue.js";
import { messageStore } from "./ai-company/messageStore.js";
import { taskQueue } from "./ai-company/taskQueue.js";

// Load .env manually (avoid adding dotenv dependency)
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = join(__dirname, "..", ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
} catch {
  // .env not found, use process.env as-is
}

const PORT = parseInt(process.env.PORT || "3100");
const AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN || "";
const ALLOWED_DIR = process.env.ALLOWED_DIR || process.cwd();
const HUB_DIR = process.env.AI_COMPANY_CWD || join(ALLOWED_DIR, "Hub");
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "";

const app = new Hono();

// Track active processes for cleanup
const activeProcesses = new Set<ChildProcess>();

// --- Job-based process management (survives client disconnects) ---
type JobListener = (data: string) => void;

interface RelayJob {
  id: string;
  proc: ChildProcess;
  listeners: Set<JobListener>;
  buffer: string; // accumulated SSE data for replay on reconnect
  accumulated: string;
  sessionId?: string;
  status: "running" | "done" | "error";
  createdAt: number;
  doneEvent?: string; // final SSE line (done/error) for late subscribers
}

const jobs = new Map<string, RelayJob>();

// Cleanup finished jobs older than 30 minutes
function cleanupOldJobs() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.status !== "running" && job.createdAt < cutoff) {
      jobs.delete(id);
    }
  }
}
setInterval(cleanupOldJobs, 5 * 60 * 1000);

function broadcastToJob(job: RelayJob, sseData: string) {
  job.buffer += sseData;
  for (const listener of job.listeners) {
    try {
      listener(sseData);
    } catch {
      job.listeners.delete(listener);
    }
  }
}

/** Create an SSE ReadableStream subscribing to a job */
function createJobStream(job: RelayJob, origin: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Replay buffered events for reconnecting clients
      if (job.buffer) {
        try {
          controller.enqueue(encoder.encode(job.buffer));
        } catch {
          // stream closed
        }
      }

      // If job already finished, send done event and close
      if (job.status !== "running") {
        if (job.doneEvent) {
          try {
            controller.enqueue(encoder.encode(job.doneEvent));
          } catch {
            // stream closed
          }
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
        return;
      }

      // Subscribe to live events
      const listener: JobListener = (data) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          job.listeners.delete(listener);
        }
      };
      job.listeners.add(listener);

      // Note: we do NOT provide a pull() — data is pushed by the process
    },

    cancel() {
      // Client disconnected — just unsubscribe, do NOT kill the process
      console.log(
        `[relay] client disconnected from job ${job.id} (${job.listeners.size - 1} remaining listeners)`,
      );
      // The listener was already removed via the error catch above,
      // but let's make sure by cleaning up
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
      "Access-Control-Allow-Private-Network": "true",
    },
  });
}

// IP allowlist: only localhost and Tailscale CGNAT (100.64.0.0/10)
function isAllowedIp(addr: string | undefined): boolean {
  if (!addr) return false;
  // Normalize IPv6-mapped IPv4 (::ffff:127.0.0.1 → 127.0.0.1)
  const ip = addr.replace(/^::ffff:/, "");
  if (ip === "127.0.0.1" || ip === "::1") return true;
  // Tailscale CGNAT range: 100.64.0.0/10 (100.64.0.0 – 100.127.255.255)
  const parts = ip.split(".");
  if (parts.length === 4 && parts[0] === "100") {
    const second = parseInt(parts[1], 10);
    if (second >= 64 && second <= 127) return true;
  }
  return false;
}

app.use("*", async (c, next) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteAddr = (c.env as any)?.incoming?.socket?.remoteAddress as
    | string
    | undefined;
  if (!isAllowedIp(remoteAddr)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
});

// CORS helper
const setCors = (c: {
  req: { header: (n: string) => string | undefined };
  header: (k: string, v: string) => void;
}) => {
  const origin = c.req.header("Origin") ?? "*";
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  // Chrome Private Network Access: allow public sites to reach localhost
  c.header("Access-Control-Allow-Private-Network", "true");
};

// Dashboard — serve monitoring UI (no auth required)
app.get("/", (c) => {
  try {
    const html = readFileSync(
      join(__dirname, "..", "public", "index.html"),
      "utf-8",
    );
    return c.html(html);
  } catch {
    return c.text(
      "Dashboard not found. Run build to generate public/index.html.",
      404,
    );
  }
});

// CORS preflight — handle all OPTIONS before any auth
app.options("/api/*", (c) => {
  setCors(c);
  return c.body(null, 204);
});

// Health check — no auth required, CORS enabled
app.get("/api/health", (c) => {
  setCors(c);
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth + CORS middleware for all other /api/* routes
app.use("/api/*", async (c, next) => {
  setCors(c);
  if (AUTH_TOKEN) {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token !== AUTH_TOKEN) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }
  return next();
});

// AI Company routes
app.route("/api/company", companyRoutes);

// Reconnect to an existing job's SSE stream
app.get("/api/claude-code/jobs/:id", (c) => {
  const jobId = c.req.param("id");
  const job = jobs.get(jobId);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  const origin = c.req.header("Origin") ?? "*";
  return createJobStream(job, origin);
});

// List active/recent jobs
app.get("/api/claude-code/jobs", (c) => {
  setCors(c);
  const list = [...jobs.values()].map((j) => ({
    id: j.id,
    status: j.status,
    sessionId: j.sessionId,
    createdAt: j.createdAt,
    accumulatedLength: j.accumulated.length,
  }));
  return c.json({ jobs: list });
});

// Claude Code chat endpoint — job-based (process survives client disconnect)
app.post("/api/claude-code", async (c) => {
  let body: {
    content?: string;
    sessionId?: string;
    workDir?: string;
    autoGit?: boolean;
    memoTitle?: string;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { content, sessionId, workDir, autoGit, memoTitle } = body;

  if (!content) {
    return c.json({ error: "content is required" }, 400);
  }

  // Validate workDir is under ALLOWED_DIR to prevent directory traversal
  // realpathSync resolves symlinks so a symlink pointing outside ALLOWED_DIR is rejected
  let resolvedDir = ALLOWED_DIR;
  if (workDir) {
    let realDir: string;
    let realAllowed: string;
    try {
      realDir = realpathSync(resolve(workDir));
      realAllowed = realpathSync(resolve(ALLOWED_DIR));
    } catch {
      return c.json({ error: "workDir not accessible" }, 403);
    }
    if (realDir !== realAllowed && !realDir.startsWith(realAllowed + "/")) {
      return c.json({ error: "workDir must be under ALLOWED_DIR" }, 403);
    }
    resolvedDir = realDir;
  }

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--add-dir",
    resolvedDir,
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  // "--" separates options from the positional prompt argument.
  // Without it, --add-dir (variadic) consumes the prompt as a directory.
  args.push("--", content);

  // Create a job that outlives the client connection
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  console.log("[relay] spawning claude with args:", args.join(" "));
  const proc = spawn("claude", args, {
    env: { ...process.env, CLAUDECODE: undefined },
    cwd: resolvedDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  console.log("[relay] claude process spawned, pid:", proc.pid, "job:", jobId);
  activeProcesses.add(proc);

  const job: RelayJob = {
    id: jobId,
    proc,
    listeners: new Set(),
    buffer: "",
    accumulated: "",
    status: "running",
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  const sseWrite = (data: unknown) => {
    const line = `data: ${JSON.stringify(data)}\n\n`;
    broadcastToJob(job, line);
  };

  // Send job ID immediately so client can reconnect
  sseWrite({ type: "job", jobId });

  let stdoutBuffer = "";

  proc.stdout.on("data", (data: Buffer) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        console.log(
          "[relay event]",
          event.type,
          JSON.stringify(event).slice(0, 200),
        );
        const text = extractText(event);
        if (text) {
          job.accumulated += text;
          sseWrite({ type: "chunk", content: text });
        }
        // Capture session ID as early as possible (init or result)
        if (event.session_id && !job.sessionId) {
          job.sessionId = event.session_id as string;
          sseWrite({ type: "session", sessionId: job.sessionId });
        } else if (event.type === "result" && event.session_id) {
          job.sessionId = event.session_id as string;
        }
      } catch {
        // Non-JSON output, skip
      }
    }
  });

  proc.stderr.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    console.error("[claude stderr]", msg);
  });

  proc.on("close", (code, signal) => {
    console.log(
      "[relay] claude process closed, code:",
      code,
      "signal:",
      signal,
      "job:",
      jobId,
      "accumulated length:",
      job.accumulated.length,
    );
    activeProcesses.delete(proc);

    // Flush remaining buffer
    if (stdoutBuffer.trim()) {
      try {
        const event = JSON.parse(stdoutBuffer) as Record<string, unknown>;
        const text = extractText(event);
        if (text) {
          job.accumulated += text;
          sseWrite({ type: "chunk", content: text });
        }
        if (event.type === "result" && event.session_id) {
          job.sessionId = event.session_id as string;
        }
      } catch {
        // ignore
      }
    }

    const assistantMessageId = crypto.randomUUID();
    const now = new Date().toISOString();

    if (code !== 0 && !job.accumulated) {
      const errEvent = {
        type: "error",
        error: `Claude Code exited with code ${code}`,
        assistantMessage: {
          id: assistantMessageId,
          content: `Error: Claude Code exited with code ${code}`,
          created_at: now,
        },
      };
      job.doneEvent = `data: ${JSON.stringify(errEvent)}\n\n`;
      job.status = "error";
      broadcastToJob(job, job.doneEvent);
    } else {
      const doneEvent = {
        type: "done",
        assistantMessage: {
          id: assistantMessageId,
          content: job.accumulated || "No response generated.",
          created_at: now,
        },
        sessionId: job.sessionId,
      };
      job.doneEvent = `data: ${JSON.stringify(doneEvent)}\n\n`;
      job.status = "done";
      broadcastToJob(job, job.doneEvent);
    }

    // Clear listeners — all subscribers will see stream end
    job.listeners.clear();

    // Git commit & push fallback for backlog apply
    if (autoGit && job.status === "done") {
      runGitFallback(resolvedDir, memoTitle || "backlog apply").catch((e) =>
        console.error("[relay] git fallback failed:", e),
      );
    }
  });

  proc.on("error", (err) => {
    activeProcesses.delete(proc);
    const errEvent = {
      type: "error",
      error: `Failed to start Claude Code: ${err.message}`,
    };
    job.doneEvent = `data: ${JSON.stringify(errEvent)}\n\n`;
    job.status = "error";
    broadcastToJob(job, job.doneEvent);
    job.listeners.clear();
  });

  const origin = c.req.header("Origin") ?? "*";
  return createJobStream(job, origin);
});

// Extract text content from Claude Code stream-json events
function extractText(event: Record<string, unknown>): string {
  // Content block delta (streaming text)
  if (event.type === "assistant") {
    const message = event.message as Record<string, unknown> | undefined;
    if (message?.content && Array.isArray(message.content)) {
      return (message.content as Array<Record<string, unknown>>)
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
    }
  }

  // Content block delta format
  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
  }

  // NOTE: "result" events carry the same text already captured from "assistant"
  // events, so we intentionally skip them here to avoid duplicate chunks.

  return "";
}

// ─── Git fallback: auto commit & push after backlog apply ─────────

async function runGitFallback(cwd: string, title: string): Promise<void> {
  const run = (
    cmd: string,
    args: string[],
  ): Promise<{ code: number; stdout: string }> =>
    new Promise((resolve) => {
      const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      p.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      p.on("close", (code) => resolve({ code: code ?? 1, stdout }));
      p.on("error", () => resolve({ code: 1, stdout: "" }));
    });

  // Check for uncommitted changes
  const status = await run("git", ["status", "--porcelain"]);
  if (!status.stdout.trim()) {
    console.log("[relay] git fallback: no uncommitted changes, skipping");
    return;
  }

  console.log("[relay] git fallback: uncommitted changes detected, committing");

  const add = await run("git", ["add", "-A"]);
  if (add.code !== 0) {
    console.error("[relay] git fallback: git add failed");
    return;
  }

  const commitMsg = `feat: ${title}`;
  const commit = await run("git", ["commit", "-m", commitMsg]);
  if (commit.code !== 0) {
    console.error("[relay] git fallback: git commit failed");
    return;
  }

  const push = await run("git", ["push"]);
  if (push.code !== 0) {
    console.error("[relay] git fallback: git push failed");
    return;
  }

  console.log("[relay] git fallback: committed and pushed successfully");
}

// ─── Error Monitor: auto-detect & fix automation errors ───────────

const MONITOR_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const MAX_FIXES_PER_HOUR = 3;

// Track: "automationId:lastRunAt" -> attempt timestamp
const attemptedFixes = new Map<string, number>();
const fixTimestamps: number[] = [];
let isAutoFixRunning = false;

// Backoff for transient Supabase connectivity failures
let consecutiveFailures = 0;
const MAX_BACKOFF_MULTIPLIER = 6; // max 3h (30min * 6)

type AutomationError = {
  id: string;
  user_id: string;
  name: string;
  automation_type: string;
  last_run_result: { error?: string } | null;
  last_run_at: string;
  config: Record<string, unknown>;
};

async function supabaseQuery(path: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

async function supabaseInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
}

async function checkAutomationErrors(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  if (isAutoFixRunning) return;

  // Backoff: skip cycles proportional to consecutive failures
  if (consecutiveFailures > 0) {
    const skipCycles = Math.min(consecutiveFailures, MAX_BACKOFF_MULTIPLIER);
    // Use a simple counter stored on the function
    const counter =
      ((checkAutomationErrors as unknown as { _skipCounter?: number })
        ._skipCounter ?? 0) + 1;
    (
      checkAutomationErrors as unknown as { _skipCounter: number }
    )._skipCounter = counter;
    if (counter < skipCycles) return;
    (
      checkAutomationErrors as unknown as { _skipCounter: number }
    )._skipCounter = 0;
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await supabaseQuery(
      `/rest/v1/ai_automations?last_run_status=eq.error&last_run_at=gt.${since}&select=id,user_id,name,automation_type,last_run_result,last_run_at,config&order=last_run_at.desc&limit=5`,
    );

    if (!res.ok) {
      console.error("[error-monitor] Query failed:", res.status);
      return;
    }

    // Success — reset backoff
    consecutiveFailures = 0;

    const errors = (await res.json()) as AutomationError[];
    if (!Array.isArray(errors) || errors.length === 0) return;

    // Rate limit
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recentCount = fixTimestamps.filter((t) => t > hourAgo).length;
    if (recentCount >= MAX_FIXES_PER_HOUR) {
      console.log("[error-monitor] Rate limit reached (3/hour)");
      return;
    }

    for (const err of errors) {
      const key = `${err.id}:${err.last_run_at}`;
      if (attemptedFixes.has(key)) continue;
      await attemptAutoFix(err);
      break; // one at a time
    }
  } catch (e) {
    consecutiveFailures++;
    // Suppress verbose stack traces for transient network errors
    const msg = e instanceof Error ? e.message : String(e);
    const cause = (e as { cause?: { code?: string } })?.cause?.code;
    if (
      cause === "ENETUNREACH" ||
      cause === "UND_ERR_CONNECT_TIMEOUT" ||
      msg.includes("fetch failed")
    ) {
      const nextDelay =
        Math.min(consecutiveFailures, MAX_BACKOFF_MULTIPLIER) * 30;
      console.warn(
        `[error-monitor] Supabase unreachable (${consecutiveFailures}x), next retry in ~${nextDelay}min`,
      );
    } else {
      console.error("[error-monitor] Check failed:", msg);
    }
  }
}

async function attemptAutoFix(error: AutomationError): Promise<void> {
  const key = `${error.id}:${error.last_run_at}`;
  attemptedFixes.set(key, Date.now());
  fixTimestamps.push(Date.now());
  isAutoFixRunning = true;

  const errorMsg = error.last_run_result?.error || "Unknown error";

  const prompt = [
    "以下のSupabase Edge Functionで自動化実行エラーが発生しました。調査し、修正可能であれば修正・デプロイしてください。",
    "",
    "## エラー情報",
    `- 自動化名: ${error.name}`,
    `- タイプ: ${error.automation_type}`,
    `- エラー日時: ${error.last_run_at}`,
    `- エラーメッセージ: ${errorMsg}`,
    `- 設定: ${JSON.stringify(error.config)}`,
    "",
    "## 調査手順",
    "1. エラーメッセージを分析し原因を推測",
    "2. supabase/functions/run_automation/index.ts を読んで該当処理を確認",
    "3. Supabase MCPの get_logs ツールで直近のEdge Functionログを確認",
    "4. 原因を特定したら:",
    `   - コードバグ → 修正し pnpm exec tsc --noEmit → npx supabase functions deploy run_automation --no-verify-jwt --project-ref ${SUPABASE_PROJECT_REF}`,
    "   - 外部API障害 → エラーハンドリング強化（リトライ・フォールバック）してデプロイ",
    "   - 一時的な障害 → 修正不要と判断し報告のみ",
    "",
    "## 制約",
    "- 修正は最小限に留めること",
    "- 新しい依存関係を追加しないこと",
    "- 既存の動作を壊さないこと",
    "",
    "最後に、発見事項と修正内容を簡潔に日本語で報告してください。",
  ].join("\n");

  console.log(
    `[error-monitor] Auto-fixing: ${error.name} (${error.id}) — ${errorMsg}`,
  );

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--",
    prompt,
  ];

  const proc = spawn("claude", args, {
    env: { ...process.env, CLAUDECODE: undefined },
    cwd: resolve(HUB_DIR),
    stdio: ["ignore", "pipe", "pipe"],
  });

  activeProcesses.add(proc);
  let accumulated = "";
  let stdoutBuf = "";

  proc.stdout.on("data", (data: Buffer) => {
    stdoutBuf += data.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const text = extractText(event);
        if (text) accumulated += text;
      } catch {
        // skip
      }
    }
  });

  proc.stderr.on("data", (data: Buffer) => {
    console.error("[error-monitor stderr]", data.toString().trim());
  });

  proc.on("close", async (code) => {
    activeProcesses.delete(proc);
    isAutoFixRunning = false;

    const success = code === 0 && accumulated.length > 0;
    console.log(
      `[error-monitor] Claude Code finished (code=${code}, output=${accumulated.length} chars)`,
    );

    // Create notification
    try {
      const now = new Date().toISOString();
      await supabaseInsert("ai_notifications", {
        id: `autofix-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        user_id: error.user_id,
        source: "auto-fix",
        priority: success ? "medium" : "high",
        title: success
          ? `自動修正完了: ${error.name}`
          : `自動修正失敗: ${error.name}`,
        body:
          accumulated.slice(0, 2000) || `Claude Code exited with code ${code}`,
        metadata: {
          automationId: error.id,
          automationType: error.automation_type,
          errorMessage: errorMsg,
          fixResult: success ? "success" : "failed",
        },
        is_read: false,
        created_at: now,
        updated_at: now,
      });
    } catch (notifyErr) {
      console.error("[error-monitor] Notification insert failed:", notifyErr);
    }
  });

  proc.on("error", (err) => {
    activeProcesses.delete(proc);
    isAutoFixRunning = false;
    console.error("[error-monitor] Spawn failed:", err.message);
  });
}

// ── Monitor API endpoints ──

app.get("/api/error-monitor/status", (c) => {
  setCors(c);
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return c.json({
    enabled: !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    isFixRunning: isAutoFixRunning,
    attemptedFixes: attemptedFixes.size,
    recentFixCount: fixTimestamps.filter((t) => t > hourAgo).length,
    maxFixesPerHour: MAX_FIXES_PER_HOUR,
  });
});

app.post("/api/error-monitor/check", async (c) => {
  setCors(c);
  if (isAutoFixRunning) {
    return c.json({ status: "busy", message: "Auto-fix already running" });
  }
  // Run async, don't block
  checkAutomationErrors().catch((e) =>
    console.error("[error-monitor] Manual check failed:", e),
  );
  return c.json({ status: "ok", message: "Error check triggered" });
});

// Start schedulers
startDiaryScheduler(); // daily 22:00 JST
startPostScheduler(); // Mon/Thu 12:00 JST
startReviewScheduler(); // daily 09:00 JST
startModelWatchScheduler(); // weekly Mon 10:00 JST
autonomousQueue.start(); // autonomous task drain loop

// Restore message store from Supabase (fire-and-forget)
messageStore
  .restoreFromSupabase()
  .catch((e) => console.warn("[startup] messageStore restore failed:", e));

// Start periodic monitoring
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  setTimeout(() => {
    checkAutomationErrors();
    setInterval(checkAutomationErrors, MONITOR_INTERVAL_MS);
  }, 60_000); // first check after 1 min
  console.log("[error-monitor] Enabled (30-min interval, max 3 fixes/hour)");
} else {
  console.log(
    "[error-monitor] Disabled (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set)",
  );
}

// Cleanup old fix tracking (keep last 7 days)
setInterval(
  () => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key, ts] of attemptedFixes) {
      if (ts < cutoff) attemptedFixes.delete(key);
    }
  },
  6 * 60 * 60 * 1000,
);

// Graceful shutdown
const shutdown = () => {
  console.log("\nShutting down relay server...");
  taskQueue.gracefulShutdown();
  autonomousQueue.gracefulShutdown();
  for (const proc of activeProcesses) {
    proc.kill("SIGTERM");
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Load TLS certs for HTTPS
const certsDir = join(__dirname, "..", "certs");
let tlsOptions: { key: Buffer; cert: Buffer } | undefined;
try {
  tlsOptions = {
    key: readFileSync(join(certsDir, "key.pem")),
    cert: readFileSync(join(certsDir, "cert.pem")),
  };
} catch {
  console.warn("No TLS certs found in relay/certs/ — falling back to HTTP");
}

// Primary server (HTTPS if certs exist, else HTTP)
serve(
  {
    fetch: app.fetch,
    port: PORT,
    ...(tlsOptions ? { createServer, serverOptions: tlsOptions } : {}),
  },
  (info) => {
    const proto = tlsOptions ? "https" : "http";
    console.log(
      `Claude Code Relay running on ${proto}://localhost:${info.port}`,
    );
    console.log(`Allowed directory: ${ALLOWED_DIR}`);
    if (AUTH_TOKEN) {
      console.log("Auth token: enabled");
    } else {
      console.warn(
        "Warning: No RELAY_AUTH_TOKEN set. Server is unauthenticated.",
      );
    }
  },
);

// NOTE: HTTP server removed — all access must use HTTPS (TLS cert via `tailscale cert`)
