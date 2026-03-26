import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

// ── Reverse geocode via Nominatim (OSM, free) ────────────

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&accept-language=ja`,
      { headers: { "User-Agent": "HubApp/1.0" } },
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return data.display_name?.split(",")[0];
    const place =
      addr.amenity ||
      addr.building ||
      addr.neighbourhood ||
      addr.road ||
      addr.suburb;
    const city = addr.city || addr.town || addr.village || addr.county;
    if (place && city) return `${place}, ${city}`;
    return place || city || data.display_name?.split(",")[0];
  } catch {
    return undefined;
  }
}

// ── Auth helpers ──────────────────────────────────────────

/** Resolve user_id from webhook token stored in user_settings */
async function resolveUserByWebhookToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_settings")
    .select("user_id")
    .eq("key", "location_webhook_token")
    .eq("value", JSON.stringify(token))
    .limit(1)
    .single();
  return (data?.user_id as string) ?? null;
}

/** Resolve user_id from Supabase JWT */
async function resolveUserByJwt(jwt: string): Promise<string | null> {
  const supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser(jwt);
  return user?.id ?? null;
}

// ── Main Handler ──────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // ── GET: generate / retrieve webhook token (JWT auth required)
  if (req.method === "GET") {
    const authHeader = req.headers.get("authorization");
    if (!authHeader)
      return jsonResponse({ error: "Missing authorization" }, 401);

    const jwt = authHeader.replace("Bearer ", "");
    const userId = await resolveUserByJwt(jwt);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    // Check if token already exists
    const { data: existing } = await supabaseAdmin
      .from("user_settings")
      .select("value")
      .eq("id", `${userId}:location_webhook_token`)
      .single();

    if (existing) {
      const token = JSON.parse(existing.value as string);
      return jsonResponse({
        token,
        url: `${supabaseUrl}/functions/v1/log_location`,
      });
    }

    // Generate new token
    const token = crypto.randomUUID();
    await supabaseAdmin.from("user_settings").upsert({
      id: `${userId}:location_webhook_token`,
      user_id: userId,
      key: "location_webhook_token",
      value: JSON.stringify(token),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      token,
      url: `${supabaseUrl}/functions/v1/log_location`,
    });
  }

  // ── POST: log location (JWT or webhook token)
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Determine user_id from auth
  let userId: string | null = null;

  const authHeader = req.headers.get("authorization");
  const webhookToken = req.headers.get("x-webhook-token");

  if (webhookToken) {
    userId = await resolveUserByWebhookToken(supabaseAdmin, webhookToken);
  } else if (authHeader) {
    const jwt = authHeader.replace("Bearer ", "");
    userId = await resolveUserByJwt(jwt);
  }

  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Parse body
  let body: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    logged_at?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { lat, lng, accuracy, logged_at } = body;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return jsonResponse({ error: "lat and lng are required numbers" }, 400);
  }

  // Reverse geocode
  const name = await reverseGeocode(lat, lng);

  const now = logged_at || new Date().toISOString();
  const id = crypto.randomUUID();

  const { error } = await supabaseAdmin.from("location_logs").insert({
    id,
    user_id: userId,
    lat,
    lng,
    accuracy: accuracy ?? null,
    name: name ?? null,
    logged_at: now,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ id, lat, lng, name, logged_at: now });
});
