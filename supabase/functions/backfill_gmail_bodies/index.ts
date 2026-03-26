import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { refreshAccessToken } from "../_shared/googleAuth.ts";
import {
  extractBodyParts,
  extractAttachmentMeta,
  base64UrlDecodeBytes,
  type GmailPayloadPart,
  type AttachmentMeta,
} from "../_shared/gmailParser.ts";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const PARALLEL_FETCHES = 10;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

type GmailHeader = { name: string; value: string };

const getHeader = (headers: GmailHeader[], name: string): string =>
  headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

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

  // JWT verification
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const token = authHeader.slice(7);
  const {
    data: { user: authUser },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let userId: string;
  let googleEmail: string | undefined;
  let limit = 100;
  let skipAttachments = false;
  try {
    const body = await req.json();
    userId = authUser.id; // Always use authenticated user's ID
    googleEmail = body.google_email;
    if (body.limit) limit = Math.min(Number(body.limit), 500);
    if (body.skip_attachments) skipAttachments = true;
  } catch {
    return new Response(
      JSON.stringify({
        error: "Request body required: { google_email }",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!googleEmail) {
    return new Response(JSON.stringify({ error: "google_email is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get access token
  const accessToken = await refreshAccessToken(
    supabaseAdmin,
    userId,
    googleEmail,
  );
  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: "Failed to get access token" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Get messages that haven't been backfilled yet
  const { data: messages, error: queryErr } = await supabaseAdmin
    .from("google_gmail_messages")
    .select("message_id")
    .eq("user_id", userId)
    .eq("google_email", googleEmail)
    .eq("body_fetched", false)
    .order("date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (queryErr) {
    return new Response(
      JSON.stringify({ error: "DB query failed", detail: queryErr.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const messageIds = (messages ?? []).map(
    (m: { message_id: string }) => m.message_id,
  );

  if (messageIds.length === 0) {
    // Count remaining
    const { count } = await supabaseAdmin
      .from("google_gmail_messages")
      .select("message_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("google_email", googleEmail)
      .eq("body_fetched", false);

    return new Response(
      JSON.stringify({
        success: true,
        processed: 0,
        remaining: count ?? 0,
        message: "No messages to backfill",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let processed = 0;
  let errors = 0;
  let skipped = 0;
  let attachmentsStored = 0;

  // Process in parallel batches
  for (let i = 0; i < messageIds.length; i += PARALLEL_FETCHES) {
    const batch = messageIds.slice(i, i + PARALLEL_FETCHES);

    const results = await Promise.all(
      batch.map(async (msgId: string) => {
        try {
          // Fetch full message from Gmail API
          const res = await fetch(
            `${GMAIL_API_BASE}/messages/${msgId}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!res.ok) {
            console.error(`Gmail API error for ${msgId}: ${res.status}`);
            // Mark 404 (deleted) messages as fetched so we don't retry them
            if (res.status === 404) {
              await supabaseAdmin
                .from("google_gmail_messages")
                .update({
                  body_fetched: true,
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId)
                .eq("google_email", googleEmail)
                .eq("message_id", msgId);
              return { msgId, success: true, skipped: true };
            }
            return { msgId, success: false, status: res.status };
          }
          const msg = await res.json();

          const headers: GmailHeader[] = msg.payload?.headers ?? [];
          const bcc = getHeader(headers, "Bcc");
          const replyTo = getHeader(headers, "Reply-To");
          const inReplyTo = getHeader(headers, "In-Reply-To");

          // Extract body
          const payload = msg.payload as GmailPayloadPart;
          const { text: bodyText, html: bodyHtml } = extractBodyParts(payload);

          // Extract attachment metadata
          const attMeta = extractAttachmentMeta(payload, msgId);
          const hasAttachments = attMeta.length > 0;

          // Download and store attachments unless skipped
          let storedAttachments: AttachmentMeta[] = attMeta;
          if (hasAttachments && !skipAttachments) {
            storedAttachments = [];
            for (const att of attMeta) {
              try {
                const attRes = await fetch(
                  `${GMAIL_API_BASE}/messages/${msgId}/attachments/${att.id}`,
                  {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                    },
                  },
                );
                if (!attRes.ok) {
                  storedAttachments.push(att);
                  continue;
                }
                const attData = await attRes.json();
                if (!attData.data) {
                  storedAttachments.push(att);
                  continue;
                }
                const bytes = base64UrlDecodeBytes(attData.data);
                const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
                const path = `${userId}/${googleEmail}/${msgId}/${safeName}`;
                const { error: uploadErr } = await supabaseAdmin.storage
                  .from("gmail-attachments")
                  .upload(path, bytes, {
                    contentType: att.mimeType,
                    upsert: true,
                  });
                if (uploadErr) {
                  console.error(`Storage upload error: ${path}`, uploadErr);
                  storedAttachments.push(att);
                } else {
                  storedAttachments.push({
                    ...att,
                    storagePath: path,
                  });
                  attachmentsStored++;
                }
              } catch (attErr) {
                console.error(`Attachment error ${att.id}:`, attErr);
                storedAttachments.push(att);
              }
            }
          }

          // Update DB
          const { error: updateErr } = await supabaseAdmin
            .from("google_gmail_messages")
            .update({
              body_text: bodyText || null,
              body_html: bodyHtml || null,
              bcc: bcc || null,
              reply_to: replyTo || null,
              in_reply_to: inReplyTo || null,
              has_attachments: hasAttachments,
              attachments: storedAttachments,
              body_fetched: true,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("google_email", googleEmail)
            .eq("message_id", msgId);

          if (updateErr) {
            console.error(`DB update error for ${msgId}:`, updateErr);
            return { msgId, success: false };
          }

          return { msgId, success: true };
        } catch (err) {
          console.error(`Error processing ${msgId}:`, err);
          return { msgId, success: false };
        }
      }),
    );

    for (const r of results) {
      if (r.success) {
        if ((r as { skipped?: boolean }).skipped) skipped++;
        else processed++;
      } else errors++;
    }
  }

  // Count remaining
  const { count } = await supabaseAdmin
    .from("google_gmail_messages")
    .select("message_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("google_email", googleEmail)
    .eq("body_fetched", false);

  return new Response(
    JSON.stringify({
      success: true,
      processed,
      errors,
      skipped_deleted: skipped,
      remaining: count ?? 0,
      attachments_stored: attachmentsStored,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
