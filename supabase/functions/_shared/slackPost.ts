import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Post a message to a Slack channel using the user's bot_token from slack_integrations.
 */
export async function postToSlack(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  channelId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  // Get bot token from slack_integrations
  const { data: integration } = await supabaseAdmin
    .from("slack_integrations")
    .select("bot_token")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!integration?.bot_token) {
    return { ok: false, error: "No active Slack integration found" };
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text,
        unfurl_links: false,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("Slack postMessage failed:", data.error);
      return { ok: false, error: data.error };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
