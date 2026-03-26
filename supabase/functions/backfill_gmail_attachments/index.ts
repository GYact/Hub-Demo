import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { refreshAccessToken } from "../_shared/googleAuth.ts";
import {
  base64UrlDecodeBytes,
  type AttachmentMeta,
} from "../_shared/gmailParser.ts";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const PARALLEL_FETCHES = 5;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let userId: string | undefined;
  let googleEmail: string | undefined;
  let limit = 50;
  try {
    const body = await req.json();
    userId = body.user_id;
    googleEmail = body.google_email;
    if (body.limit) limit = Math.min(Number(body.limit), 200);
  } catch {
    return new Response(
      JSON.stringify({
        error: "Request body required: { user_id, google_email }",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!userId || !googleEmail) {
    return new Response(
      JSON.stringify({ error: "user_id and google_email are required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

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

  // Find ALL messages with attachments, filter in JS for unprocessed ones
  const { data: messages, error: queryErr } = await supabaseAdmin
    .from("google_gmail_messages")
    .select("message_id, attachments")
    .eq("user_id", userId)
    .eq("google_email", googleEmail)
    .eq("has_attachments", true);

  if (queryErr) {
    return new Response(
      JSON.stringify({ error: "DB query failed", detail: queryErr.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Filter to messages that have attachments without storagePath
  const allNeedsDownload = (messages ?? []).filter(
    (m: { attachments: AttachmentMeta[] }) =>
      m.attachments?.some((a: AttachmentMeta) => !a.storagePath),
  );

  if (allNeedsDownload.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        messages_processed: 0,
        attachments_stored: 0,
        remaining_messages: 0,
        message: "No attachments to download",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Only process up to `limit` messages per invocation
  const needsDownload = allNeedsDownload.slice(0, limit);

  let messagesProcessed = 0;
  let attachmentsStored = 0;
  let errors = 0;

  // Process messages in parallel batches
  for (let i = 0; i < needsDownload.length; i += PARALLEL_FETCHES) {
    const batch = needsDownload.slice(i, i + PARALLEL_FETCHES);

    await Promise.all(
      batch.map(
        async (msg: { message_id: string; attachments: AttachmentMeta[] }) => {
          const updatedAttachments: AttachmentMeta[] = [];
          let changed = false;

          for (const att of msg.attachments) {
            if (att.storagePath) {
              updatedAttachments.push(att);
              continue;
            }

            try {
              const attRes = await fetch(
                `${GMAIL_API_BASE}/messages/${msg.message_id}/attachments/${att.id}`,
                { headers: { Authorization: `Bearer ${accessToken}` } },
              );
              if (!attRes.ok) {
                console.error(
                  `Gmail attachment error ${msg.message_id}/${att.id}: ${attRes.status}`,
                );
                updatedAttachments.push(att);
                if (attRes.status !== 404) errors++;
                continue;
              }
              const attData = await attRes.json();
              if (!attData.data) {
                updatedAttachments.push(att);
                continue;
              }

              const bytes = base64UrlDecodeBytes(attData.data);
              const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
              const path = `${userId}/${googleEmail}/${msg.message_id}/${safeName}`;

              const { error: uploadErr } = await supabaseAdmin.storage
                .from("gmail-attachments")
                .upload(path, bytes, {
                  contentType: att.mimeType,
                  upsert: true,
                });

              if (uploadErr) {
                console.error(`Storage upload error: ${path}`, uploadErr);
                updatedAttachments.push(att);
                errors++;
              } else {
                updatedAttachments.push({ ...att, storagePath: path });
                attachmentsStored++;
                changed = true;
              }
            } catch (err) {
              console.error(`Attachment error ${att.id}:`, err);
              updatedAttachments.push(att);
              errors++;
            }
          }

          if (changed) {
            await supabaseAdmin
              .from("google_gmail_messages")
              .update({
                attachments: updatedAttachments,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId)
              .eq("google_email", googleEmail)
              .eq("message_id", msg.message_id);
            messagesProcessed++;
          }
        },
      ),
    );
  }

  // Remaining = total needing download minus what we just processed
  const remainingMessages = allNeedsDownload.length - messagesProcessed;

  return new Response(
    JSON.stringify({
      success: true,
      messages_processed: messagesProcessed,
      attachments_stored: attachmentsStored,
      errors,
      remaining_messages: remainingMessages,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
