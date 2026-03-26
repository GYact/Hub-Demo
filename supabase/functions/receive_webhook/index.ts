import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";

type WebhookPayload = {
  title: string;
  body: string;
  priority?: "low" | "medium" | "high" | "urgent";
  category_id?: string;
  metadata?: Record<string, unknown>;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const hashApiKey = async (key: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  // CORS headers for preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Hub-Api-Key",
      },
    });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase configuration", { status: 500 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // API Key authentication
  const apiKey = req.headers.get("X-Hub-Api-Key");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing API key. Set X-Hub-Api-Key header." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Validate API key
  const keyHash = await hashApiKey(apiKey);
  const { data: keyData, error: keyError } = await supabaseAdmin
    .from("ai_notification_api_keys")
    .select("id, user_id, is_active")
    .eq("key_hash", keyHash)
    .single();

  if (keyError || !keyData) {
    return new Response(JSON.stringify({ error: "Invalid API key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!keyData.is_active) {
    return new Response(JSON.stringify({ error: "API key is inactive" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Update last_used_at
  await supabaseAdmin
    .from("ai_notification_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyData.id);

  // Parse payload
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!payload.title || !payload.body) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: title, body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Create notification
  const notificationId = `webhook-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const nowIso = new Date().toISOString();

  const { error: insertError } = await supabaseAdmin
    .from("ai_notifications")
    .insert({
      id: notificationId,
      user_id: keyData.user_id,
      category_id: payload.category_id || null,
      source: "webhook",
      priority: payload.priority || "medium",
      title: payload.title,
      body: payload.body,
      metadata: payload.metadata || {},
      is_read: false,
      created_at: nowIso,
      updated_at: nowIso,
    });

  if (insertError) {
    console.error("Failed to insert notification:", insertError);
    return new Response(
      JSON.stringify({ error: "Failed to create notification" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Send push notification
  if (
    await isPushCategoryEnabled(supabaseAdmin, keyData.user_id, "pushWebhook")
  ) {
    await sendPushToUser(supabaseAdmin, keyData.user_id, {
      title: payload.title,
      body: payload.body,
      url: "/ai/notify-box",
      tag: `ai-notification-${notificationId}`,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      notification_id: notificationId,
      message: "Notification created successfully",
    }),
    {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
});
