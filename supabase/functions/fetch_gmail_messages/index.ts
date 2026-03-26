import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import {
  refreshAccessToken,
  getValidTokenEntries,
} from "../_shared/googleAuth.ts";
import {
  extractBodyParts,
  extractAttachmentMeta,
  base64UrlDecodeBytes,
  getHeader as getPayloadHeader,
  type GmailPayloadPart,
  type AttachmentMeta,
} from "../_shared/gmailParser.ts";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const BATCH_SIZE = 10; // Reduced from 20 — full format responses are larger
const MAX_MESSAGES_PER_SYNC = 50; // Limit per invocation to avoid Edge Function timeout

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

type SyncState = {
  calendar_sync_tokens?: Record<string, string>;
  calendar_last_sync?: string;
  gmail_history_id?: string;
  gmail_last_sync?: string;
  gmail_sync_page_token?: string; // Resume token for interrupted initial sync
};

type GmailHeader = { name: string; value: string };

const getHeader = (headers: GmailHeader[], name: string): string =>
  headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** Download attachment data and upload to Supabase Storage. */
const storeAttachments = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  accessToken: string,
  userId: string,
  googleEmail: string,
  messageId: string,
  attachments: AttachmentMeta[],
): Promise<AttachmentMeta[]> => {
  const stored: AttachmentMeta[] = [];
  for (const att of attachments) {
    try {
      const res = await fetch(
        `${GMAIL_API_BASE}/messages/${messageId}/attachments/${att.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        stored.push(att);
        continue;
      }
      const data = await res.json();
      if (!data.data) {
        stored.push(att);
        continue;
      }
      const bytes = base64UrlDecodeBytes(data.data);
      const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${googleEmail}/${messageId}/${safeName}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("gmail-attachments")
        .upload(path, bytes, {
          contentType: att.mimeType,
          upsert: true,
        });
      if (uploadErr) {
        console.error(`Storage upload error for ${path}:`, uploadErr);
        stored.push(att);
      } else {
        stored.push({ ...att, storagePath: path });
      }
    } catch (err) {
      console.error(`Attachment download error ${att.id}:`, err);
      stored.push(att);
    }
  }
  return stored;
};

const WALL_CLOCK_LIMIT_MS = 20_000; // Stop processing before Edge Function timeout

const processUserGmail = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  googleEmail: string,
  startTime: number = Date.now(),
): Promise<{ newItems: number; error?: string }> => {
  const accessToken = await refreshAccessToken(
    supabaseAdmin,
    userId,
    googleEmail,
  );
  if (!accessToken) {
    return { newItems: 0, error: "Failed to get access token" };
  }

  // Get sync state
  const { data: tokenRow } = await supabaseAdmin
    .from("user_google_tokens")
    .select("sync_state")
    .eq("user_id", userId)
    .eq("google_email", googleEmail)
    .single();

  const syncState = (tokenRow?.sync_state ?? {}) as SyncState;
  const lastHistoryId = syncState.gmail_history_id;

  // Helper: batch check which message IDs already exist in DB
  const filterExistingMsgIds = async (
    msgIds: string[],
  ): Promise<Set<string>> => {
    const existing = new Set<string>();
    for (let i = 0; i < msgIds.length; i += 100) {
      const batch = msgIds.slice(i, i + 100);
      const { data } = await supabaseAdmin
        .from("google_gmail_messages")
        .select("message_id")
        .eq("user_id", userId)
        .eq("google_email", googleEmail)
        .in("message_id", batch);
      for (const row of data ?? []) {
        existing.add(row.message_id);
      }
    }
    return existing;
  };

  let messageIdsToFetch: string[] = [];
  const labelChangedMsgIds = new Set<string>();
  let latestHistoryId: string | undefined;
  let didIncrementalSync = false;

  // Try incremental sync via history.list
  if (lastHistoryId) {
    try {
      let pageToken: string | undefined;
      let historyExpired = false;
      const candidateNewIds: string[] = [];
      const candidateLabelIds: string[] = [];

      do {
        const params = new URLSearchParams({
          startHistoryId: lastHistoryId,
        });
        // No historyTypes filter — capture messageAdded AND label changes
        if (pageToken) params.set("pageToken", pageToken);

        const res = await fetch(`${GMAIL_API_BASE}/history?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 404) {
          historyExpired = true;
          break;
        }
        if (!res.ok) {
          console.error(`Gmail history error: ${res.status}`);
          break;
        }

        const data = await res.json();
        latestHistoryId = data.historyId;

        for (const h of data.history ?? []) {
          // New messages
          for (const added of h.messagesAdded ?? []) {
            const msgId = added.message?.id;
            if (msgId) candidateNewIds.push(msgId);
          }
          // Label changes on existing messages (read/unread/star)
          for (const lbl of h.labelsAdded ?? []) {
            const msgId = lbl.message?.id;
            if (msgId) candidateLabelIds.push(msgId);
          }
          for (const lbl of h.labelsRemoved ?? []) {
            const msgId = lbl.message?.id;
            if (msgId) candidateLabelIds.push(msgId);
          }
        }

        pageToken = data.nextPageToken;
      } while (pageToken);

      if (!historyExpired) {
        // Batch check which candidate IDs already exist in DB
        const allCandidates = [
          ...new Set([...candidateNewIds, ...candidateLabelIds]),
        ];
        const existingIds = await filterExistingMsgIds(allCandidates);

        // New messages = candidates NOT in DB
        for (const id of candidateNewIds) {
          if (!existingIds.has(id)) messageIdsToFetch.push(id);
        }
        // Label changes = candidates IN DB
        for (const id of candidateLabelIds) {
          if (existingIds.has(id)) labelChangedMsgIds.add(id);
        }

        didIncrementalSync = true;
      }
    } catch (err) {
      console.error("Gmail history sync error:", err);
    }
  }

  // Sync label changes for existing messages (read/unread/starred)
  if (labelChangedMsgIds.size > 0) {
    const labelBatch = Array.from(labelChangedMsgIds);
    const LABEL_BATCH_SIZE = 20;
    for (let i = 0; i < labelBatch.length; i += LABEL_BATCH_SIZE) {
      const batch = labelBatch.slice(i, i + LABEL_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (msgId) => {
          try {
            const res = await fetch(
              `${GMAIL_API_BASE}/messages/${msgId}?format=minimal`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            if (!res.ok) return null;
            return await res.json();
          } catch {
            return null;
          }
        }),
      );

      for (const msg of results) {
        if (!msg?.id) continue;
        const labelIds: string[] = msg.labelIds ?? [];
        await supabaseAdmin
          .from("google_gmail_messages")
          .update({
            labels: labelIds,
            is_unread: labelIds.includes("UNREAD"),
            is_read: !labelIds.includes("UNREAD"),
            is_starred: labelIds.includes("STARRED"),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("google_email", googleEmail)
          .eq("message_id", msg.id);
      }
    }
  }

  // Full initial sync if no history or history expired
  if (!didIncrementalSync) {
    messageIdsToFetch = [];
    // Resume from saved page token if available (interrupted previous sync)
    let pageToken: string | undefined = syncState.gmail_sync_page_token;
    const allListedIds: string[] = [];

    do {
      const params = new URLSearchParams({ maxResults: "500" });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        console.error(`Gmail messages list error: ${res.status}`);
        break;
      }

      const data = await res.json();
      for (const msg of data.messages ?? []) {
        allListedIds.push(msg.id);
      }

      pageToken = data.nextPageToken;
      // Cap listed IDs to avoid timeout on initial sync
      if (allListedIds.length >= MAX_MESSAGES_PER_SYNC) {
        break;
      }
    } while (pageToken);

    // Batch check which listed IDs already exist in DB
    const existingIds = await filterExistingMsgIds(allListedIds);
    for (const id of allListedIds) {
      if (!existingIds.has(id)) messageIdsToFetch.push(id);
    }
    if (messageIdsToFetch.length > MAX_MESSAGES_PER_SYNC) {
      messageIdsToFetch = messageIdsToFetch.slice(0, MAX_MESSAGES_PER_SYNC);
    }

    // Check if full listing is complete
    const fullSyncComplete =
      allListedIds.length < MAX_MESSAGES_PER_SYNC && !pageToken;

    if (fullSyncComplete) {
      // Full sync done - get historyId and clear page token
      // Try profile first, fall back to fetching a single message's historyId
      try {
        const profileRes = await fetch(`${GMAIL_API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          latestHistoryId = String(profile.historyId);
        }
      } catch {
        // Non-critical
      }

      // Fallback: use max history_id from stored messages in DB
      if (!latestHistoryId) {
        const { data: maxRow } = await supabaseAdmin
          .from("google_gmail_messages")
          .select("history_id")
          .eq("user_id", userId)
          .eq("google_email", googleEmail)
          .not("history_id", "is", null)
          .order("history_id", { ascending: false })
          .limit(1)
          .single();
        if (maxRow?.history_id) {
          latestHistoryId = String(maxRow.history_id);
        }
      }
      delete syncState.gmail_sync_page_token;
    } else {
      if (pageToken) {
        syncState.gmail_sync_page_token = pageToken;
      }
    }
  }

  // Fetch message details in batches (with wall-clock guard)
  let totalNew = 0;

  for (let i = 0; i < messageIdsToFetch.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > WALL_CLOCK_LIMIT_MS) {
      console.log(
        `Wall-clock limit reached after ${totalNew} messages, stopping early`,
      );
      break;
    }
    const batch = messageIdsToFetch.slice(i, i + BATCH_SIZE);

    const details = await Promise.all(
      batch.map(async (msgId) => {
        try {
          const res = await fetch(
            `${GMAIL_API_BASE}/messages/${msgId}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      }),
    );

    for (const msg of details) {
      if (!msg) continue;

      const headers: GmailHeader[] = msg.payload?.headers ?? [];
      const from = getHeader(headers, "From");
      const to = getHeader(headers, "To");
      const subject = getHeader(headers, "Subject");
      const date = getHeader(headers, "Date");
      const cc = getHeader(headers, "Cc");
      const bcc = getHeader(headers, "Bcc");
      const replyTo = getHeader(headers, "Reply-To");
      const inReplyTo = getHeader(headers, "In-Reply-To");
      const labelIds: string[] = msg.labelIds ?? [];

      // Extract body from MIME parts
      const payload = msg.payload as GmailPayloadPart;
      const { text: bodyText, html: bodyHtml } = extractBodyParts(payload);

      // Extract attachment metadata
      const attMeta = extractAttachmentMeta(payload, msg.id);
      const hasAttachments = attMeta.length > 0;

      // Download and store attachments in Supabase Storage
      let storedAttachments: AttachmentMeta[] = [];
      if (hasAttachments) {
        storedAttachments = await storeAttachments(
          supabaseAdmin,
          accessToken,
          userId,
          googleEmail,
          msg.id,
          attMeta,
        );
      }

      const nowIso = new Date().toISOString();
      let parsedDate: string | null = null;
      try {
        if (date) parsedDate = new Date(date).toISOString();
      } catch {
        // Invalid date
      }

      const { error: insertError } = await supabaseAdmin
        .from("google_gmail_messages")
        .upsert(
          {
            user_id: userId,
            google_email: googleEmail,
            message_id: msg.id,
            thread_id: msg.threadId || null,
            subject: subject || "(No subject)",
            snippet: (msg.snippet ?? "").slice(0, 500),
            sender: from || null,
            recipient: to || null,
            cc: cc || null,
            bcc: bcc || null,
            reply_to: replyTo || null,
            in_reply_to: inReplyTo || null,
            date: parsedDate,
            labels: labelIds,
            is_unread: labelIds.includes("UNREAD"),
            is_starred: labelIds.includes("STARRED"),
            is_read: !labelIds.includes("UNREAD"),
            history_id: msg.historyId || null,
            size_estimate: msg.sizeEstimate || null,
            body_text: bodyText || null,
            body_html: bodyHtml || null,
            has_attachments: hasAttachments,
            attachments: hasAttachments ? storedAttachments : [],
            body_fetched: true,
            created_at: parsedDate || nowIso,
            updated_at: nowIso,
          },
          { onConflict: "user_id,google_email,message_id" },
        );

      if (insertError) {
        console.error("Failed to insert Gmail message:", insertError);
      } else {
        totalNew++;
      }
    }
  }

  // Update sync state (single unified update)
  const updatedSyncState = { ...syncState };
  if (latestHistoryId) {
    updatedSyncState.gmail_history_id = latestHistoryId;
    updatedSyncState.gmail_last_sync = new Date().toISOString();
  }
  // Always persist (handles pageToken save/clear and historyId)
  await supabaseAdmin
    .from("user_google_tokens")
    .update({
      sync_state: updatedSyncState,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("google_email", googleEmail);

  return { newItems: totalNew };
};

Deno.serve(async (req) => {
  const startTime = Date.now();
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Get user ID and google_email from request body or auth header
  let userId: string | null = null;
  let googleEmail: string | null = null;
  try {
    const body = await req.json();
    userId = body.user_id;
    googleEmail = body.google_email;
  } catch {
    // No body (cron job)
  }

  if (!userId) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);
      userId = user?.id ?? null;
    }
  }

  // Cron mode: process all accounts with valid tokens
  if (!userId) {
    const entries = await getValidTokenEntries(supabaseAdmin);

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No accounts with valid Google tokens",
          accounts_processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let totalNew = 0;
    const allResults: Record<string, unknown>[] = [];
    const pushByUser = new Map<string, number>();

    for (const { user_id, google_email } of entries) {
      const result = await processUserGmail(
        supabaseAdmin,
        user_id,
        google_email,
        startTime,
      );
      totalNew += result.newItems;
      allResults.push({ user_id, google_email, ...result });

      if (result.newItems > 0) {
        pushByUser.set(
          user_id,
          (pushByUser.get(user_id) ?? 0) + result.newItems,
        );
      }
    }

    // Send push notifications per user (aggregate across accounts)
    for (const [uid, count] of pushByUser) {
      if (await isPushCategoryEnabled(supabaseAdmin, uid, "pushGmail")) {
        await sendPushToUser(supabaseAdmin, uid, {
          title: "New Gmail",
          body: `${count} new message${count > 1 ? "s" : ""}`,
          url: "/media",
          tag: `gmail-update-${Date.now()}`,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_processed: entries.length,
        new_items: totalNew,
        results: allResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Single user mode (manual refresh)
  // If google_email specified, sync that account only; otherwise sync all accounts for this user
  if (googleEmail) {
    const result = await processUserGmail(
      supabaseAdmin,
      userId,
      googleEmail,
      startTime,
    );
    if (
      result.newItems > 0 &&
      (await isPushCategoryEnabled(supabaseAdmin, userId, "pushGmail"))
    ) {
      await sendPushToUser(supabaseAdmin, userId, {
        title: "New Gmail",
        body: `${result.newItems} new message${result.newItems > 1 ? "s" : ""}`,
        url: "/media",
        tag: `gmail-update-${Date.now()}`,
      });
    }
    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sync all accounts for this user (direct query, no full table scan)
  const { data: userTokens } = await supabaseAdmin
    .from("user_google_tokens")
    .select("google_email")
    .eq("user_id", userId)
    .eq("is_valid", true);
  const userEntries = userTokens ?? [];

  // Process accounts in parallel
  const accountResults = await Promise.all(
    userEntries.map(({ google_email }) =>
      processUserGmail(supabaseAdmin, userId, google_email, startTime).then(
        (r) => ({
          google_email,
          ...r,
        }),
      ),
    ),
  );

  let totalNew = 0;
  const results: Record<string, unknown>[] = [];
  for (const r of accountResults) {
    totalNew += r.newItems;
    results.push(r);
  }

  if (
    totalNew > 0 &&
    (await isPushCategoryEnabled(supabaseAdmin, userId, "pushGmail"))
  ) {
    await sendPushToUser(supabaseAdmin, userId, {
      title: "New Gmail",
      body: `${totalNew} new message${totalNew > 1 ? "s" : ""}`,
      url: "/media",
      tag: `gmail-update-${Date.now()}`,
    });
  }

  return new Response(
    JSON.stringify({ success: true, new_items: totalNew, results }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
