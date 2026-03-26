import { supabase } from "../supabase";
import type { OrchestrateEvent, PostData } from "./types";

// ── Orchestration History ──

interface OrchestrationResult {
  agentId: string;
  lines: string[];
  content?: string;
}

export interface OrchestrationRecord {
  id: string;
  task: string;
  targetGroup: string | null;
  result: OrchestrationResult[];
  events: OrchestrateEvent[];
  createdAt: number;
}

export async function saveOrchestration(
  userId: string,
  task: string,
  targetGroup: string | undefined,
  agentResults: Record<string, { lines: string[]; content?: string }>,
  events?: OrchestrateEvent[],
): Promise<void> {
  if (!supabase) return;
  const result: OrchestrationResult[] = Object.entries(agentResults)
    .filter(([, v]) => v.lines.length > 0)
    .map(([agentId, v]) => ({
      agentId,
      lines: v.lines,
      ...(v.content ? { content: v.content } : {}),
    }));
  // Filter out verbose agent-output chunks to keep events compact
  const savedEvents = (events ?? []).filter((e) => e.type !== "agent-output");
  const { error } = await supabase.from("ai_company_orchestrations").insert({
    user_id: userId,
    task,
    target_group: targetGroup ?? null,
    result,
    events: savedEvents,
  });
  if (error) console.error("[supabase] saveOrchestration error:", error);
}

export async function loadLatestOrchestration(
  userId: string,
): Promise<OrchestrationRecord | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("ai_company_orchestrations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    task: data.task,
    targetGroup: data.target_group,
    result: data.result as OrchestrationResult[],
    events: (data.events ?? []) as OrchestrateEvent[],
    createdAt: new Date(data.created_at).getTime(),
  };
}

export async function loadOrchestrationHistory(
  userId: string,
  limit = 30,
): Promise<OrchestrationRecord[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_company_orchestrations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    task: row.task,
    targetGroup: row.target_group,
    result: row.result as OrchestrationResult[],
    events: (row.events ?? []) as OrchestrateEvent[],
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function deleteOrchestration(
  userId: string,
  id: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("ai_company_orchestrations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
}

// ── Artifacts ──

export interface ArtifactRecord {
  id: string;
  path: string;
  content: string;
  orchestrationId: string | null;
  updatedAt: number;
}

export async function loadArtifactsByOrchestration(
  userId: string,
  orchestrationId: string,
): Promise<ArtifactRecord[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_company_artifacts")
    .select("*")
    .eq("user_id", userId)
    .eq("orchestration_id", orchestrationId)
    .order("path");
  return (data ?? []).map((row) => ({
    id: row.id,
    path: row.path,
    content: row.content,
    orchestrationId: row.orchestration_id,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export async function loadAllArtifacts(
  userId: string,
): Promise<ArtifactRecord[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_company_artifacts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    path: row.path,
    content: row.content,
    orchestrationId: row.orchestration_id,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

// ── Chat Messages ──

export interface ChatMessageRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  messageType: string;
  createdAt: number;
}

export async function saveChatMessage(
  userId: string,
  fromAgentId: string,
  toAgentId: string,
  content: string,
  messageType = "chat",
): Promise<void> {
  if (!supabase) return;
  await supabase.from("ai_company_messages").insert({
    user_id: userId,
    from_agent_id: fromAgentId,
    to_agent_id: toAgentId,
    content,
    message_type: messageType,
  });
}

export async function loadChatMessages(
  userId: string,
  agentId: string,
  limit = 100,
): Promise<ChatMessageRecord[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_company_messages")
    .select("*")
    .eq("user_id", userId)
    .or(`from_agent_id.eq.${agentId},to_agent_id.eq.${agentId}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_agent_id,
    content: row.content,
    messageType: row.message_type,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

// ── Follow-up Messages (per orchestration) ──

export async function saveFollowUpMessage(
  userId: string,
  orchestrationId: string,
  role: "user" | "agent",
  content: string,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("ai_company_messages").insert({
    user_id: userId,
    from_agent_id: role === "user" ? "user" : "pm",
    to_agent_id: role === "user" ? "pm" : "user",
    content,
    message_type: `followup:${orchestrationId}`,
  });
}

export async function loadFollowUpMessages(
  userId: string,
  orchestrationId: string,
): Promise<ChatMessageRecord[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_company_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("message_type", `followup:${orchestrationId}`)
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_agent_id,
    content: row.content,
    messageType: row.message_type,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

// ── Generated Posts ──

export async function savePost(userId: string, post: PostData): Promise<void> {
  if (!supabase) return;
  await supabase.from("ai_company_posts").upsert(
    {
      id: post.id,
      user_id: userId,
      platform: post.platform,
      content: post.content,
      agent_id: post.agentId,
      agent_name: post.agentName,
      topic: post.topic,
      status: post.status,
      created_at: new Date(post.timestamp).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function savePosts(
  userId: string,
  posts: PostData[],
): Promise<void> {
  if (!supabase || posts.length === 0) return;
  const rows = posts.map((post) => ({
    id: post.id,
    user_id: userId,
    platform: post.platform,
    content: post.content,
    agent_id: post.agentId,
    agent_name: post.agentName,
    topic: post.topic,
    status: post.status,
    created_at: new Date(post.timestamp).toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("ai_company_posts")
    .upsert(rows, { onConflict: "id" });
  if (error) console.error("[supabase] savePosts error:", error);
}

export async function loadPosts(
  userId: string,
  limit = 100,
): Promise<PostData[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_company_posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    platform: row.platform,
    content: row.content,
    agentId: row.agent_id,
    agentName: row.agent_name,
    topic: row.topic,
    timestamp: new Date(row.created_at).getTime(),
    status: row.status,
  }));
}

export async function deletePost(
  userId: string,
  postId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("ai_company_posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId);
}

// ── Press Releases ──

export interface PressReleaseData {
  id: string;
  topic: string;
  company: string;
  keyPoints: string[];
  content: string;
  agentId: string;
  agentName: string;
  status: "generating" | "ready";
  timestamp: number;
}

export async function savePressRelease(
  userId: string,
  pr: PressReleaseData,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("ai_company_press_releases").upsert(
    {
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
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.error("[supabase] savePressRelease error:", error);
}

export async function savePressReleases(
  userId: string,
  prs: PressReleaseData[],
): Promise<void> {
  if (!supabase || prs.length === 0) return;
  const rows = prs.map((pr) => ({
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
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("ai_company_press_releases")
    .upsert(rows, { onConflict: "id" });
  if (error) console.error("[supabase] savePressReleases error:", error);
}

export async function loadPressReleases(
  userId: string,
  limit = 100,
): Promise<PressReleaseData[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_company_press_releases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    topic: row.topic,
    company: row.company,
    keyPoints: (row.key_points ?? []) as string[],
    content: row.content,
    agentId: row.agent_id,
    agentName: row.agent_name,
    status: row.status,
    timestamp: new Date(row.created_at).getTime(),
  }));
}

export async function deletePressRelease(
  userId: string,
  id: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("ai_company_press_releases")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
}

// ── Apply Sessions (Memo analysis) ──

export interface ApplySessionRecord {
  memoId: string;
  messages: { id: string; role: string; content: string }[];
  cliSessionId?: string;
}

export async function saveApplySession(
  userId: string,
  memoId: string,
  messages: { id: string; role: string; content: string }[],
  cliSessionId?: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("ai_apply_sessions").upsert(
    {
      user_id: userId,
      memo_id: memoId,
      messages,
      cli_session_id: cliSessionId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,memo_id" },
  );
  if (error) console.error("[supabase] saveApplySession error:", error);
}

export async function loadApplySession(
  userId: string,
  memoId: string,
): Promise<ApplySessionRecord | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("ai_apply_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("memo_id", memoId)
    .limit(1)
    .single();
  if (!data) return null;
  return {
    memoId: data.memo_id,
    messages: (data.messages ?? []) as ApplySessionRecord["messages"],
    cliSessionId: data.cli_session_id ?? undefined,
  };
}

/** Load ALL apply sessions for a user (cross-device sync) */
export async function loadAllApplySessions(
  userId: string,
): Promise<ApplySessionRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ai_apply_sessions")
    .select("*")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map(
    (row: {
      memo_id: string;
      messages: unknown;
      cli_session_id: string | null;
    }) => ({
      memoId: row.memo_id,
      messages: (row.messages ?? []) as ApplySessionRecord["messages"],
      cliSessionId: row.cli_session_id ?? undefined,
    }),
  );
}

export async function deleteApplySession(
  userId: string,
  memoId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("ai_apply_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("memo_id", memoId);
}

// ── Claude CLI Session Mapping (ai_sessions metadata) ──

export async function saveClaudeSessionId(
  userId: string,
  hubSessionId: string,
  cliSessionId: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("ai_sessions")
    .update({
      metadata: { claude_session_id: cliSessionId },
      updated_at: new Date().toISOString(),
    })
    .eq("id", hubSessionId)
    .eq("user_id", userId);
  if (error) console.error("[supabase] saveClaudeSessionId error:", error);
}

export async function loadClaudeSessionMap(
  userId: string,
): Promise<Map<string, string>> {
  if (!supabase) return new Map();
  const { data } = await supabase
    .from("ai_sessions")
    .select("id, metadata")
    .eq("user_id", userId)
    .not("metadata->claude_session_id", "is", null);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const meta = row.metadata as { claude_session_id?: string } | null;
    if (meta?.claude_session_id) {
      map.set(row.id, meta.claude_session_id);
    }
  }
  return map;
}
