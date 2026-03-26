import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT =
  "https://www.googleapis.com/oauth2/v2/userinfo";

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
  let code: string;
  let redirectUri: string;
  let scopes: string | undefined;
  try {
    const body = await req.json();
    code = body.code;
    redirectUri = body.redirect_uri;
    scopes = body.scopes;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!code || !redirectUri) {
    return new Response(
      JSON.stringify({ error: "code and redirect_uri are required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Exchange authorization code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.json().catch(() => ({}));
    console.error("Google code exchange failed:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to exchange authorization code",
        detail: err.error_description || err.error,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 3600;
  // Use actual granted scopes from Google's response (not the requested ones)
  const grantedScopes: string = tokenData.scope ?? "";

  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: "No access token in response" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Check if required scopes were granted
  const requiredScopes = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive",
  ];
  const missingScopeNames: string[] = [];
  for (const s of requiredScopes) {
    if (!grantedScopes.includes(s)) {
      missingScopeNames.push(s.split("/").pop() ?? s);
    }
  }

  // Get the Google account email
  const userinfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userinfoResponse.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to get Google user info" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const userinfo = await userinfoResponse.json();
  const googleEmail = userinfo.email;

  if (!googleEmail) {
    return new Response(
      JSON.stringify({ error: "Could not determine Google account email" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Store tokens in database
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error: upsertError } = await supabaseAdmin
    .from("user_google_tokens")
    .upsert(
      {
        user_id: user.id,
        google_email: googleEmail,
        refresh_token: refreshToken || null,
        access_token: accessToken,
        token_expires_at: expiresAt,
        scopes: grantedScopes || scopes || null,
        is_valid: true,
        is_primary: false,
        updated_at: nowIso,
      },
      { onConflict: "user_id,google_email" },
    );

  if (upsertError) {
    console.error("Failed to store tokens:", upsertError);
    return new Response(JSON.stringify({ error: "Failed to store tokens" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      access_token: accessToken,
      google_email: googleEmail,
      expires_in: expiresIn,
      granted_scopes: grantedScopes,
      missing_scopes:
        missingScopeNames.length > 0 ? missingScopeNames : undefined,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
