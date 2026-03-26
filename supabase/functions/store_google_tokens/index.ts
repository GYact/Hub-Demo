import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authenticate user from JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body
  let refreshToken: string;
  let scopes: string | undefined;
  let googleEmail: string | undefined;
  try {
    const body = await req.json();
    refreshToken = body.refresh_token;
    scopes = body.scopes;
    googleEmail = body.google_email;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!refreshToken) {
    return new Response(
      JSON.stringify({ error: "refresh_token is required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // If google_email not provided, use the authenticated user's email
  if (!googleEmail) {
    googleEmail = user.email ?? "unknown";
  }

  // Check if this is the first account for this user (make it primary)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { count } = await supabaseAdmin
    .from("user_google_tokens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_valid", true);

  const isPrimary = (count ?? 0) === 0;

  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabaseAdmin
    .from("user_google_tokens")
    .upsert(
      {
        user_id: user.id,
        google_email: googleEmail,
        refresh_token: refreshToken,
        scopes: scopes ?? null,
        is_valid: true,
        is_primary: isPrimary,
        updated_at: nowIso,
      },
      { onConflict: "user_id,google_email" },
    );

  if (upsertError) {
    console.error("Failed to store Google tokens:", upsertError);
    return new Response(JSON.stringify({ error: "Failed to store tokens" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ success: true, google_email: googleEmail }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
