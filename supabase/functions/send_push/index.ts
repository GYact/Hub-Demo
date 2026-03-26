import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import type { PushCategory } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: {
    userId?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    category?: PushCategory;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { userId, title, body: notifBody, url, tag, category } = body;
  if (!userId || !title) {
    return jsonResponse({ error: "userId and title are required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (category) {
    const enabled = await isPushCategoryEnabled(supabase, userId, category);
    if (!enabled) {
      return jsonResponse({ sent: 0, reason: "category_disabled" });
    }
  }

  const sent = await sendPushToUser(supabase, userId, {
    title,
    body: notifBody ?? "",
    url: url ?? "/",
    tag: tag ?? undefined,
  });

  return jsonResponse({ sent });
});
