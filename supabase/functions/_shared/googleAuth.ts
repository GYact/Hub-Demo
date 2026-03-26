import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 minutes

/**
 * Refresh or retrieve a valid Google access token for the given user + account.
 * Uses cached access_token if still valid, otherwise exchanges refresh_token
 * via Google OAuth2.
 *
 * @param googleEmail - When provided, targets a specific Google account.
 *                      When omitted, falls back to the first valid token for the user.
 */
export async function refreshAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  googleEmail?: string,
): Promise<string | null> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    return null;
  }

  let query = supabaseAdmin
    .from("user_google_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("is_valid", true);

  if (googleEmail) {
    query = query.eq("google_email", googleEmail);
  }

  const { data: tokenRow, error } = await query.single();

  if (error || !tokenRow?.refresh_token) {
    console.error(
      "No valid refresh token for user:",
      userId,
      googleEmail ?? "(any)",
      error?.message,
    );
    return null;
  }

  // Reuse cached access_token if still valid
  if (tokenRow.access_token && tokenRow.token_expires_at) {
    const expiresAt = new Date(tokenRow.token_expires_at).getTime();
    if (Date.now() < expiresAt - TOKEN_REFRESH_MARGIN) {
      return tokenRow.access_token;
    }
  }

  // Exchange refresh_token for a new access_token
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("Google token refresh failed:", err);

    // Token revoked or invalid
    if (err.error === "invalid_grant" || err.error === "invalid_client") {
      let invalidateQuery = supabaseAdmin
        .from("user_google_tokens")
        .update({ is_valid: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (googleEmail) {
        invalidateQuery = invalidateQuery.eq("google_email", googleEmail);
      }
      await invalidateQuery;
    }

    return null;
  }

  const data = await response.json();
  const expiresAt = new Date(
    Date.now() + (data.expires_in || 3600) * 1000,
  ).toISOString();

  // Cache the new access_token
  let updateQuery = supabaseAdmin
    .from("user_google_tokens")
    .update({
      access_token: data.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (googleEmail) {
    updateQuery = updateQuery.eq("google_email", googleEmail);
  }
  await updateQuery;

  return data.access_token;
}

/**
 * Get all valid token entries (user_id + google_email pairs).
 * Used by cron jobs to iterate over all connected accounts.
 */
export async function getValidTokenEntries(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ user_id: string; google_email: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("user_google_tokens")
    .select("user_id, google_email")
    .eq("is_valid", true);

  if (error) {
    console.error("Failed to fetch valid token entries:", error);
    return [];
  }

  return (data ?? []) as { user_id: string; google_email: string }[];
}

/**
 * Get all user IDs that have valid Google tokens.
 * @deprecated Use getValidTokenEntries() for multi-account support.
 */
export async function getValidTokenUserIds(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_google_tokens")
    .select("user_id")
    .eq("is_valid", true);

  if (error) {
    console.error("Failed to fetch valid token users:", error);
    return [];
  }

  return (data ?? []).map((row: { user_id: string }) => row.user_id);
}
