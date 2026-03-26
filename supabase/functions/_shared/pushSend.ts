import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "./webPushDeno.ts";

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  updated_at: string;
};

/**
 * Deduplicate subscriptions: keep only the latest per push-service origin.
 * e.g. one for fcm.googleapis.com, one for web.push.apple.com
 */
const dedupeByOrigin = (rows: PushSubscriptionRow[]): PushSubscriptionRow[] => {
  const map = new Map<string, PushSubscriptionRow>();
  for (const row of rows) {
    try {
      const origin = new URL(row.endpoint).origin;
      const existing = map.get(origin);
      if (!existing || row.updated_at > existing.updated_at) {
        map.set(origin, row);
      }
    } catch {
      // invalid URL – keep it as-is
      map.set(row.endpoint, row);
    }
  }
  return [...map.values()];
};

export type PushResult = {
  sent: number;
  subscriptionCount: number;
  errors: string[];
};

let vapidPublicKey = "";
let vapidPrivateKey = "";
let vapidSubject = "";
let vapidConfigured = false;

export const configureVapid = (): boolean => {
  vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!vapidPublicKey || !vapidPrivateKey) return false;
  vapidConfigured = true;
  return true;
};

export const sendPushToUser = async (
  supabase: SupabaseClient,
  userId: string,
  payload: Record<string, unknown>,
): Promise<number> => {
  const result = await sendPushToUserDetailed(supabase, userId, payload);
  return result.sent;
};

export const sendPushToUserDetailed = async (
  supabase: SupabaseClient,
  userId: string,
  payload: Record<string, unknown>,
): Promise<PushResult> => {
  if (!vapidConfigured && !configureVapid()) {
    return { sent: 0, subscriptionCount: 0, errors: ["VAPID not configured"] };
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const subs = dedupeByOrigin((subscriptions ?? []) as PushSubscriptionRow[]);
  const errors: string[] = [];
  let sentCount = 0;
  const payloadStr = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      const result = await sendWebPush(
        sub.endpoint,
        sub.p256dh,
        sub.auth,
        payloadStr,
        vapidPublicKey,
        vapidPrivateKey,
        vapidSubject,
      );
      if (result.success) {
        sentCount++;
      } else if (result.statusCode === 410 || result.statusCode === 404) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
        errors.push(`[${result.statusCode}] expired - removed`);
      } else {
        const msg = `[${result.statusCode}] ${sub.endpoint.slice(0, 50)}: ${result.body.slice(0, 200)}`;
        console.error("Push failed:", msg);
        errors.push(msg);
      }
    } catch (err: unknown) {
      const msg = `${sub.endpoint.slice(0, 50)}: ${String(err).slice(0, 200)}`;
      console.error("Push error:", msg);
      errors.push(msg);
    }
  }
  return { sent: sentCount, subscriptionCount: subs.length, errors };
};
