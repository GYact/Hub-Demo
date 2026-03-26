import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!googleClientId || !googleClientSecret) {
    return new Response(
      JSON.stringify({ error: "Missing Google OAuth configuration" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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

  // Parse body
  let googleEmail: string | undefined;
  let directRefreshToken: string | undefined;
  try {
    const body = await req.json();
    googleEmail = body.google_email;
    directRefreshToken = body.refresh_token;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!googleEmail && !directRefreshToken) {
    return new Response(
      JSON.stringify({
        error: "google_email or refresh_token is required",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Determine refresh_token: use direct param or fetch from DB
  let refreshToken: string | undefined;
  if (directRefreshToken) {
    refreshToken = directRefreshToken;
  } else if (googleEmail) {
    const { data: tokenRow, error: fetchError } = await supabaseAdmin
      .from("user_google_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .eq("google_email", googleEmail)
      .eq("is_valid", true)
      .single();

    if (fetchError || !tokenRow?.refresh_token) {
      return new Response(
        JSON.stringify({ error: "No valid token found for this account" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    refreshToken = tokenRow.refresh_token;
  }

  if (!refreshToken) {
    return new Response(
      JSON.stringify({ error: "Could not determine refresh token" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Refresh with Google
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("Google token refresh failed:", err);

    if (
      googleEmail &&
      (err.error === "invalid_grant" || err.error === "invalid_client")
    ) {
      await supabaseAdmin
        .from("user_google_tokens")
        .update({ is_valid: false, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("google_email", googleEmail);
    }

    return new Response(
      JSON.stringify({
        error: "Token refresh failed",
        detail: err.error_description || err.error,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const data = await response.json();
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Update cached token in DB (only when fetched from DB by email)
  if (googleEmail && !directRefreshToken) {
    await supabaseAdmin
      .from("user_google_tokens")
      .update({
        access_token: data.access_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("google_email", googleEmail);
  }

  return new Response(
    JSON.stringify({
      success: true,
      access_token: data.access_token,
      expires_in: expiresIn,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
