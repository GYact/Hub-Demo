import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AutonomousTask, OrchestrateEvent } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Read env lazily — .env is loaded by index.ts after module imports resolve
const env = () => ({
  url: process.env.SUPABASE_URL || "",
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
});

let cachedUserId: string | null = null;

async function supabaseFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { url, key } = env();
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

/** Get the primary user ID (cached). Falls back to first user with orchestrations. */
async function getUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  try {
    // Try existing orchestrations first
    const res = await supabaseFetch(
      "/rest/v1/ai_company_orchestrations?select=user_id&limit=1",
    );
    if (res.ok) {
      const rows = (await res.json()) as { user_id: string }[];
      if (rows.length > 0) {
        cachedUserId = rows[0].user_id;
        return cachedUserId;
      }
    }
    // Fallback: first auth user
    const authRes = await supabaseFetch(
      "/auth/v1/admin/users?page=1&per_page=1",
    );
    if (authRes.ok) {
      const data = (await authRes.json()) as { users: { id: string }[] };
      if (data.users?.length > 0) {
        cachedUserId = data.users[0].id;
        return cachedUserId;
      }
    }
  } catch (e) {
    console.error("[persist] Failed to resolve user_id:", e);
  }
  return null;
}

interface AgentResult {
  agentId: string;
  content: string;
}

/** Save orchestration result to ai_company_orchestrations */
export async function persistOrchestration(
  task: string,
  targetGroup: string | undefined,
  agentResults: AgentResult[],
  events: OrchestrateEvent[],
): Promise<void> {
  if (!env().url || !env().key) return;

  const userId = await getUserId();
  if (!userId) {
    console.warn("[persist] No user_id found, skipping orchestration save");
    return;
  }

  try {
    const result = agentResults.map((r) => ({
      agentId: r.agentId,
      lines: r.content.split("\n"),
      content: r.content,
    }));

    const savedEvents = events.filter((e) => e.type !== "agent-output");

    const res = await supabaseFetch("/rest/v1/ai_company_orchestrations", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userId,
        task,
        target_group: targetGroup ?? null,
        result,
        events: savedEvents,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "[persist] orchestration save failed:",
        res.status,
        errText,
      );
    } else {
      const rows = (await res.json()) as { id: string }[];
      const orchestrationId = rows[0]?.id;
      console.log("[persist] orchestration saved:", task.slice(0, 50));

      // Persist artifacts referenced in agent output
      if (orchestrationId) {
        await persistArtifacts(userId, orchestrationId, agentResults);
      }
    }
  } catch (e) {
    console.error("[persist] orchestration save error:", e);
  }
}

/** Extract artifact paths from agent output and save file contents to DB */
async function persistArtifacts(
  userId: string,
  orchestrationId: string,
  agentResults: AgentResult[],
): Promise<void> {
  const ARTIFACT_PATH_RE = /(press-releases|notices)\/[\w._-]+\.[\w]+/g;

  // Extract paths from agent output
  const paths = new Set<string>();
  for (const r of agentResults) {
    for (const m of r.content.matchAll(ARTIFACT_PATH_RE)) {
      paths.add(m[0]);
    }
  }

  if (paths.size === 0) {
    console.log("[persist] no artifact paths found in agent output — skipping");
    return;
  }

  for (const path of paths) {
    try {
      const absPath = join(__dirname, path);
      const content = await readFile(absPath, "utf-8");

      const res = await supabaseFetch(
        "/rest/v1/ai_company_artifacts?on_conflict=user_id,path",
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            user_id: userId,
            orchestration_id: orchestrationId,
            path,
            content,
            updated_at: new Date().toISOString(),
          }),
        },
      );

      if (!res.ok) {
        console.error(`[persist] artifact save failed (${path}):`, res.status);
      } else {
        console.log(`[persist] artifact saved: ${path}`);
      }
    } catch {
      // File not found or read error — skip
    }
  }
}

/** Create tasks in the user's "AI Tasks" list */
export async function createUserTasks(
  tasks: { title: string; notes?: string; due_date?: string }[],
): Promise<number> {
  if (!env().url || !env().key || tasks.length === 0) {
    console.warn("[persist] createUserTasks: env not set or empty tasks");
    return 0;
  }

  const userId = await getUserId();
  if (!userId) {
    console.warn("[persist] createUserTasks: userId is null");
    return 0;
  }

  try {
    // Get or create "AI Tasks" list
    const listRes = await supabaseFetch(
      `/rest/v1/task_lists?user_id=eq.${userId}&title=eq.AI%20Tasks&select=id&limit=1`,
    );
    let listId: string | null = null;

    if (listRes.ok) {
      const rows = (await listRes.json()) as { id: string }[];
      listId = rows[0]?.id ?? null;
    } else {
      console.error("[persist] task_lists query failed:", listRes.status);
    }

    if (!listId) {
      const createRes = await supabaseFetch("/rest/v1/task_lists", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: userId,
          title: "AI Tasks",
          position: 9999,
        }),
      });
      if (createRes.ok) {
        const rows = (await createRes.json()) as { id: string }[];
        listId = rows[0]?.id ?? null;
      }
    }

    if (!listId) {
      console.error(
        "[persist] createUserTasks: listId is null after get/create",
      );
      return 0;
    }

    const now = new Date().toISOString();
    let created = 0;

    for (const t of tasks) {
      const res = await supabaseFetch("/rest/v1/tasks", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: userId,
          list_id: listId,
          title: t.title,
          notes: t.notes ?? null,
          status: "needsAction",
          due_date: t.due_date ?? null,
          is_starred: false,
          position: (Date.now() % 2_000_000_000) + created,
          created_at: now,
          updated_at: now,
        }),
      });
      if (res.ok) {
        created++;
      } else {
        const errText = await res.text().catch(() => "");
        console.error(
          `[persist] task insert failed (${res.status}):`,
          errText.slice(0, 200),
        );
      }
    }

    if (created > 0) {
      console.log(`[persist] Created ${created} task(s) in AI Tasks list`);
    }
    return created;
  } catch (e) {
    console.error("[persist] Failed to create user tasks:", e);
    return 0;
  }
}

/** Save a generated post to ai_company_posts */
export async function persistPost(post: {
  id: string;
  platform: string;
  content: string;
  agentId: string;
  agentName: string;
  topic: string;
  status: string;
  timestamp: number;
}): Promise<void> {
  if (!env().url || !env().key) return;

  const userId = await getUserId();
  if (!userId) return;

  try {
    const res = await supabaseFetch(
      "/rest/v1/ai_company_posts?on_conflict=id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: post.id,
          user_id: userId,
          platform: post.platform,
          content: post.content,
          agent_id: post.agentId,
          agent_name: post.agentName,
          topic: post.topic,
          status: post.status,
          created_at: new Date(post.timestamp).toISOString(),
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[persist] post save failed:", res.status, errText);
    } else {
      console.log("[persist] post saved:", post.id);
    }
  } catch (e) {
    console.error("[persist] post save error:", e);
  }
}

/** Save a press release to ai_company_press_releases */
export async function persistPressRelease(pr: {
  id: string;
  topic: string;
  company: string;
  keyPoints: string[];
  content: string;
  agentId: string;
  agentName: string;
  status: string;
  timestamp: number;
}): Promise<void> {
  if (!env().url || !env().key) return;

  const userId = await getUserId();
  if (!userId) return;

  try {
    const res = await supabaseFetch(
      "/rest/v1/ai_company_press_releases?on_conflict=id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: pr.id,
          user_id: userId,
          topic: pr.topic,
          company: pr.company,
          key_points: pr.keyPoints,
          content: pr.content,
          agent_id: pr.agentId,
          agent_name: pr.agentName,
          status: pr.status,
          created_at: new Date(pr.timestamp).toISOString(),
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "[persist] press release save failed:",
        res.status,
        errText,
      );
    } else {
      console.log("[persist] press release saved:", pr.id);
    }
  } catch (e) {
    console.error("[persist] press release save error:", e);
  }
}

/** Load recent messages from ai_company_messages for startup restore */
export async function loadRecentMessages(): Promise<
  Array<{
    fromAgentId: string;
    toAgentId: string;
    content: string;
    type: string;
    timestamp: number;
    id: string;
  }>
> {
  if (!env().url || !env().key) return [];

  const userId = await getUserId();
  if (!userId) return [];

  try {
    const res = await supabaseFetch(
      `/rest/v1/ai_company_messages?user_id=eq.${userId}&select=id,from_agent_id,to_agent_id,content,message_type,created_at&order=created_at.desc&limit=50`,
    );

    if (!res.ok) {
      console.error("[persist] loadRecentMessages failed:", res.status);
      return [];
    }

    const rows = (await res.json()) as Array<{
      id: string;
      from_agent_id: string;
      to_agent_id: string;
      content: string;
      message_type: string;
      created_at: string;
    }>;

    // Reverse to chronological order (oldest first)
    return rows.reverse().map((r) => ({
      fromAgentId: r.from_agent_id,
      toAgentId: r.to_agent_id,
      content: r.content,
      type: r.message_type,
      timestamp: new Date(r.created_at).getTime(),
      id: r.id,
    }));
  } catch (e) {
    console.error("[persist] loadRecentMessages error:", e);
    return [];
  }
}

/** Load latest orchestration events for startup restore */
export async function loadLatestOrchestrationEvents(): Promise<
  OrchestrateEvent[]
> {
  if (!env().url || !env().key) return [];

  const userId = await getUserId();
  if (!userId) return [];

  try {
    const res = await supabaseFetch(
      `/rest/v1/ai_company_orchestrations?user_id=eq.${userId}&select=events&order=created_at.desc&limit=1`,
    );

    if (!res.ok) {
      console.error(
        "[persist] loadLatestOrchestrationEvents failed:",
        res.status,
      );
      return [];
    }

    const rows = (await res.json()) as Array<{
      events: OrchestrateEvent[] | null;
    }>;

    return rows[0]?.events ?? [];
  } catch (e) {
    console.error("[persist] loadLatestOrchestrationEvents error:", e);
    return [];
  }
}

/** Save an auto-generated diary entry to journal_entries */
export async function persistDiaryEntry(entry: {
  date: string; // YYYY-MM-DD
  title: string;
  content: string;
  mood?: string;
  tags?: string[];
}): Promise<boolean> {
  if (!env().url || !env().key) return false;

  const userId = await getUserId();
  if (!userId) {
    console.warn("[persist] persistDiaryEntry: userId is null");
    return false;
  }

  try {
    // Check if entry already exists for this date
    const checkRes = await supabaseFetch(
      `/rest/v1/journal_entries?user_id=eq.${userId}&entry_date=eq.${entry.date}&auto_generated=eq.true&select=id&limit=1`,
    );

    const payload = {
      user_id: userId,
      entry_date: entry.date,
      title: entry.title,
      content: entry.content,
      mood: entry.mood ?? "neutral",
      tags: entry.tags ?? [],
      auto_generated: true,
      updated_at: new Date().toISOString(),
    };

    // Resolve existing record id (if any)
    const existingId: string | null = checkRes.ok
      ? (((await checkRes.json()) as { id: string }[])[0]?.id ?? null)
      : null;

    let res: Response;

    if (existingId) {
      // Idempotent update — always safe, even with concurrent calls
      res = await supabaseFetch(
        `/rest/v1/journal_entries?id=eq.${existingId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(payload),
        },
      );
    } else {
      // Insert — may race with another concurrent insert (partial unique index guards DB)
      res = await supabaseFetch("/rest/v1/journal_entries", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });

      // Handle race condition: duplicate insert from concurrent agents → fallback to PATCH
      if (res.status === 409 || res.status === 400) {
        const body = await res.text();
        if (body.includes("23505") || body.includes("duplicate")) {
          console.warn(
            `[persist] diary INSERT conflict (${entry.date}) — falling back to PATCH`,
          );
          const retryRes = await supabaseFetch(
            `/rest/v1/journal_entries?user_id=eq.${userId}&entry_date=eq.${entry.date}&auto_generated=eq.true&select=id&limit=1`,
          );
          if (retryRes.ok) {
            const rows = (await retryRes.json()) as { id: string }[];
            if (rows[0]?.id) {
              res = await supabaseFetch(
                `/rest/v1/journal_entries?id=eq.${rows[0].id}`,
                {
                  method: "PATCH",
                  headers: { Prefer: "return=minimal" },
                  body: JSON.stringify(payload),
                },
              );
            }
          }
        }
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("[persist] diary entry save failed:", res.status, errText);
      return false;
    }

    console.log(`[persist] diary entry saved: ${entry.date}`);
    return true;
  } catch (e) {
    console.error("[persist] diary entry save error:", e);
    return false;
  }
}

/** Save a chat message to ai_company_messages */
export async function persistChatMessage(
  fromAgentId: string,
  toAgentId: string,
  content: string,
  messageType = "chat",
): Promise<void> {
  if (!env().url || !env().key) return;

  const userId = await getUserId();
  if (!userId) return;

  try {
    await supabaseFetch("/rest/v1/ai_company_messages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        content,
        message_type: messageType,
      }),
    });
  } catch {
    // Non-critical
  }
}

/** Upsert an autonomous task record */
export async function persistAutonomousTask(
  task: AutonomousTask,
): Promise<void> {
  const { url } = env();
  if (!url) return;
  const userId = await getUserId();
  if (!userId) return;

  try {
    await supabaseFetch("/rest/v1/ai_company_autonomous_tasks?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: task.id,
        user_id: userId,
        title: task.title,
        description: task.description,
        target_group: task.targetGroup ?? null,
        priority: task.priority,
        depth: task.depth,
        source_agent_id: task.sourceAgentId ?? null,
        status: task.status,
        result: task.result ?? null,
        created_at: new Date(task.createdAt).toISOString(),
        started_at: task.startedAt
          ? new Date(task.startedAt).toISOString()
          : null,
        completed_at: task.completedAt
          ? new Date(task.completedAt).toISOString()
          : null,
      }),
    });
  } catch {
    // Non-critical
  }
}
