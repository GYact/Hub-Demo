import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

/**
 * Get LINE config from user_settings.
 */
async function getLineConfig(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ channelAccessToken: string; groupIds: string[] } | null> {
  const { data } = await supabaseAdmin
    .from("user_settings")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "line_integration_settings")
    .single();

  if (!data?.value) return null;
  const config = data.value as {
    channelAccessToken?: string;
    groupIds?: string[];
  };
  if (!config.channelAccessToken || !config.groupIds?.length) return null;
  return {
    channelAccessToken: config.channelAccessToken,
    groupIds: config.groupIds,
  };
}

/**
 * Send text messages to LINE group(s).
 * Splits into multiple messages if needed (LINE limit: 5000 chars per message).
 */
export async function postToLine(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  messages: string[],
): Promise<{ ok: boolean; error?: string }> {
  const config = await getLineConfig(supabaseAdmin, userId);
  if (!config) {
    return { ok: false, error: "LINE not configured" };
  }

  const errors: string[] = [];

  for (const groupId of config.groupIds) {
    const lineMessages = messages.map((text) => ({
      type: "text" as const,
      text: text.slice(0, 5000),
    }));

    try {
      const res = await fetch(LINE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.channelAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: groupId,
          messages: lineMessages.slice(0, 5), // LINE allows max 5 messages per request
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`LINE push failed (${groupId}):`, errText);
        errors.push(`${groupId}: ${errText}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${groupId}: ${msg}`);
    }
  }

  return errors.length > 0
    ? { ok: false, error: errors.join("; ") }
    : { ok: true };
}
