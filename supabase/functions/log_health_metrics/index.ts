import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

// ── Auth helpers ──────────────────────────────────────────

async function resolveUserByWebhookToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_settings")
    .select("user_id")
    .eq("key", "health_metrics_webhook_token")
    .eq("value", `"${token}"`)
    .limit(1)
    .single();
  return (data?.user_id as string) ?? null;
}

async function resolveUserByJwt(jwt: string): Promise<string | null> {
  const supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser(jwt);
  return user?.id ?? null;
}

// ── Types ──────────────────────────────────────────────────

type MetricInput = {
  metric_type: string;
  value: number;
  unit: string;
  recorded_at?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

function validateMetric(m: unknown): m is MetricInput {
  if (!m || typeof m !== "object") return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.metric_type === "string" &&
    obj.metric_type.length > 0 &&
    typeof obj.value === "number" &&
    Number.isFinite(obj.value) &&
    typeof obj.unit === "string" &&
    obj.unit.length > 0
  );
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

    const settingKey = "health_metrics_webhook_token";
    const { data: existing } = await supabaseAdmin
      .from("user_settings")
      .select("value")
      .eq("id", `${userId}:${settingKey}`)
      .single();

    if (existing) {
      const token = existing.value as string;
      return jsonResponse({
        token,
        url: `${supabaseUrl}/functions/v1/log_health_metrics`,
      });
    }

    const token = crypto.randomUUID();
    await supabaseAdmin.from("user_settings").upsert({
      id: `${userId}:${settingKey}`,
      user_id: userId,
      key: settingKey,
      value: token,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      token,
      url: `${supabaseUrl}/functions/v1/log_health_metrics`,
    });
  }

  // ── POST: log health metrics (JWT or webhook token)
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Accept single metric or { metrics: [...] }
  let metrics: unknown[];
  if (Array.isArray(body)) {
    metrics = body;
  } else if (
    body &&
    typeof body === "object" &&
    "metrics" in body &&
    Array.isArray((body as Record<string, unknown>).metrics)
  ) {
    metrics = (body as Record<string, unknown>).metrics as unknown[];
  } else if (body && typeof body === "object" && "metric_type" in body) {
    metrics = [body];
  } else {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }

  if (metrics.length === 0) {
    return jsonResponse({ error: "No metrics provided" }, 400);
  }
  if (metrics.length > 100) {
    return jsonResponse({ error: "Max 100 metrics per request" }, 413);
  }

  // Validate and build rows
  const now = new Date().toISOString();
  const rows = [];
  for (const m of metrics) {
    if (!validateMetric(m)) {
      return jsonResponse(
        { error: "Invalid metric: metric_type, value, unit are required" },
        400,
      );
    }
    rows.push({
      user_id: userId,
      metric_type: m.metric_type,
      value: m.value,
      unit: m.unit,
      recorded_at: m.recorded_at || now,
      source: m.source || "shortcuts",
      metadata: m.metadata || {},
    });
  }

  const { data, error } = await supabaseAdmin
    .from("health_metrics")
    .upsert(rows, {
      onConflict: "user_id,metric_type,recorded_at",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    console.error("Insert error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({
    inserted: data?.length ?? 0,
    ids: (data ?? []).map((r: { id: string }) => r.id),
  });
});
