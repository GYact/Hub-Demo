import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { refreshAccessToken } from "../_shared/googleAuth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => ({}));
  const userId = body.user_id;
  const googleEmail = body.google_email;

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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const results: Record<string, unknown> = {};

  // 1. Check actual token scopes via tokeninfo
  try {
    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`,
    );
    results.tokeninfo = await tokenInfoRes.json();
  } catch (e) {
    results.tokeninfo_error = String(e);
  }

  // 2. Try users.getProfile
  try {
    const profileRes = await fetch(`${GMAIL_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    results.profile_status = profileRes.status;
    results.profile = await profileRes.json();
  } catch (e) {
    results.profile_error = String(e);
  }

  // 3. List messages with q=before:2025/11/03 (to find older messages)
  try {
    const params = new URLSearchParams({
      maxResults: "10",
      q: "before:2025/11/03",
    });
    const listRes = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    results.old_messages_status = listRes.status;
    results.old_messages = await listRes.json();
  } catch (e) {
    results.old_messages_error = String(e);
  }

  // 4. List total messages (no filter) to get resultSizeEstimate
  try {
    const params = new URLSearchParams({ maxResults: "1" });
    const totalRes = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    results.total_messages_status = totalRes.status;
    results.total_messages = await totalRes.json();
  } catch (e) {
    results.total_messages_error = String(e);
  }

  // 5. List messages with includeSpamTrash to see if older ones are there
  try {
    const params = new URLSearchParams({
      maxResults: "10",
      q: "before:2025/11/03",
      includeSpamTrash: "true",
    });
    const spamRes = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    results.old_with_spam_trash_status = spamRes.status;
    results.old_with_spam_trash = await spamRes.json();
  } catch (e) {
    results.old_with_spam_trash_error = String(e);
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
