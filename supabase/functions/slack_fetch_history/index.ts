import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

type SlackMessage = {
  type: string;
  user?: string;
  text?: string;
  ts: string;
  bot_id?: string;
  client_msg_id?: string;
};

type SlackChannel = {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
};

// Fetch channel info from Slack API
const getChannelInfo = async (
  channelId: string,
  botToken: string,
): Promise<{ name: string; is_private: boolean } | null> => {
  try {
    const response = await fetch(
      `https://slack.com/api/conversations.info?channel=${channelId}`,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await response.json();
    if (data.ok && data.channel) {
      return {
        name: data.channel.name || channelId,
        is_private: data.channel.is_private || false,
      };
    }
  } catch (e) {
    console.error("Failed to fetch channel info:", e);
  }
  return null;
};

// Fetch user info from Slack API
const getUserInfo = async (
  userId: string,
  botToken: string,
): Promise<{
  name: string;
  real_name: string;
  display_name: string;
} | null> => {
  try {
    const response = await fetch(
      `https://slack.com/api/users.info?user=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await response.json();
    if (data.ok && data.user) {
      return {
        name: data.user.name || userId,
        real_name: data.user.real_name || data.user.name || userId,
        display_name:
          data.user.profile?.display_name ||
          data.user.real_name ||
          data.user.name ||
          userId,
      };
    }
  } catch (e) {
    console.error("Failed to fetch user info:", e);
  }
  return null;
};

type UserInfoCache = Map<
  string,
  { name: string; real_name: string; display_name: string }
>;

// Get user info with cache
const getCachedUserInfo = async (
  userId: string,
  botToken: string,
  cache: UserInfoCache,
): Promise<{
  name: string;
  real_name: string;
  display_name: string;
} | null> => {
  const cached = cache.get(userId);
  if (cached) return cached;
  const info = await getUserInfo(userId, botToken);
  if (info) cache.set(userId, info);
  return info;
};

// Replace user mentions <@U0A7GS4JK5G> with actual display names
const replaceUserMentions = async (
  text: string,
  botToken: string,
  cache: UserInfoCache,
): Promise<string> => {
  const mentionRegex = /<@([A-Z0-9]+)(?:\|[^>]*)?>/g;
  const matches = [...text.matchAll(mentionRegex)];

  if (matches.length === 0) return text;

  const userIds = [...new Set(matches.map((m) => m[1]))];
  const userMap = new Map<string, string>();

  for (const userId of userIds) {
    const userInfo = await getCachedUserInfo(userId, botToken, cache);
    if (userInfo) {
      userMap.set(
        userId,
        userInfo.display_name || userInfo.real_name || userInfo.name,
      );
    }
  }

  let result = text;
  for (const [userId, displayName] of userMap) {
    result = result.replace(
      new RegExp(`<@${userId}(?:\\|[^>]*)?>`, "g"),
      `@${displayName}`,
    );
  }

  return result;
};

// Replace channel mentions
const replaceChannelMentions = (text: string): string => {
  return text.replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1");
};

// Replace special mentions
const replaceSpecialMentions = (text: string): string => {
  return text
    .replace(/<!channel>/g, "@channel")
    .replace(/<!here>/g, "@here")
    .replace(/<!everyone>/g, "@everyone");
};

// Fetch channels the bot is a member of
const fetchBotChannels = async (botToken: string): Promise<SlackChannel[]> => {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      limit: "200",
    });
    if (cursor) params.append("cursor", cursor);

    const response = await fetch(
      `https://slack.com/api/conversations.list?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await response.json();

    if (!data.ok) {
      console.error("Failed to fetch channels:", data.error, data);
      break;
    }

    console.log(
      "conversations.list returned",
      (data.channels || []).length,
      "channels, is_member count:",
      (data.channels || []).filter((c: { is_member: boolean }) => c.is_member)
        .length,
    );

    for (const channel of data.channels || []) {
      if (channel.is_member) {
        channels.push({
          id: channel.id,
          name: channel.name,
          is_private: channel.is_private || false,
          is_member: true,
        });
      }
    }

    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return channels;
};

// Fetch ALL messages from a channel with cursor-based pagination
const fetchChannelHistory = async (
  channelId: string,
  botToken: string,
  oldest?: string,
): Promise<SlackMessage[]> => {
  const allMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      channel: channelId,
      limit: "200",
    });
    if (oldest) params.append("oldest", oldest);
    if (cursor) params.append("cursor", cursor);

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await response.json();

    if (!data.ok) {
      console.error(`Failed to fetch history for ${channelId}:`, data.error);
      break;
    }

    for (const msg of data.messages ?? []) {
      allMessages.push(msg);
    }

    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return allMessages;
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase configuration", { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Get user from auth header or body
  let userId: string | null = null;
  try {
    const body = await req.json();
    userId = body.user_id ?? null;
  } catch {
    // No body
  }

  if (!userId) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);
      userId = user?.id ?? null;
    }
  }

  // Cron mode: process all users with active Slack integrations
  if (!userId) {
    const { data: integrations } = await supabaseAdmin
      .from("slack_integrations")
      .select("user_id")
      .eq("is_active", true);
    const userIds = [
      ...new Set(
        (integrations ?? []).map((r: { user_id: string }) => r.user_id),
      ),
    ];

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active Slack integrations",
          accounts_processed: 0,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // For cron, just re-invoke ourselves with each user_id in body
    // This is a history sync - once done it's idempotent, so safe to run for all users
    const results: Record<string, unknown>[] = [];
    for (const uid of userIds) {
      // Process inline for each user
      const { data: integration } = await supabaseAdmin
        .from("slack_integrations")
        .select("id, sync_state")
        .eq("user_id", uid)
        .eq("is_active", true)
        .single();
      const syncState = (integration?.sync_state || {}) as Record<
        string,
        unknown
      >;
      results.push({
        user_id: uid,
        already_synced: !!syncState.history_synced_at,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_processed: userIds.length,
        results,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // Parse request body for channelId (already consumed above, re-parse not possible)
  // channelId is only used in manual mode, not cron
  const channelId: string | undefined = undefined;

  // Find user's Slack integration
  const { data: integration, error: integrationError } = await supabaseAdmin
    .from("slack_integrations")
    .select(
      "id, team_id, bot_token, channel_filters, default_category_id, sync_state",
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (integrationError || !integration || !integration.bot_token) {
    console.error("Integration lookup failed:", {
      error: integrationError?.message,
      hasIntegration: !!integration,
      hasBotToken: !!integration?.bot_token,
      userId: userId,
    });
    return new Response(
      JSON.stringify({
        error: "No active Slack integration found",
        details: "Please set up Slack integration first",
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // Idempotency: skip if history already synced
  const syncState = (integration.sync_state || {}) as Record<string, unknown>;
  if (syncState.history_synced_at) {
    return new Response(
      JSON.stringify({
        success: true,
        already_synced: true,
        synced_at: syncState.history_synced_at,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  let channelsToFetch: { id: string; name: string; is_private: boolean }[] = [];

  if (channelId) {
    // Fetch specific channel
    const channelInfo = await getChannelInfo(channelId, integration.bot_token);
    if (channelInfo) {
      channelsToFetch.push({ id: channelId, ...channelInfo });
    }
  } else {
    // Fetch all channels the bot is a member of
    const botChannels = await fetchBotChannels(integration.bot_token);
    channelsToFetch = botChannels.map((c) => ({
      id: c.id,
      name: c.name,
      is_private: c.is_private,
    }));

    // Merge channels discovered from webhook messages in DB
    // (conversations.list may return partial results due to missing scopes)
    const { data: knownChannels } = await supabaseAdmin
      .from("media_feed_items")
      .select("metadata")
      .eq("user_id", userId)
      .eq("source", "slack");

    const existingChannelIds = new Set(channelsToFetch.map((c) => c.id));
    for (const notif of knownChannels ?? []) {
      const meta = notif.metadata as {
        channel_id?: string;
        channel_name?: string;
      } | null;
      if (meta?.channel_id && !existingChannelIds.has(meta.channel_id)) {
        const info = await getChannelInfo(
          meta.channel_id,
          integration.bot_token,
        );
        channelsToFetch.push({
          id: meta.channel_id,
          name: info?.name || meta.channel_name || meta.channel_id,
          is_private: info?.is_private || false,
        });
        existingChannelIds.add(meta.channel_id);
      }
    }
  }

  console.log(
    "Channels found:",
    channelsToFetch.length,
    channelsToFetch.map((c) => c.name),
  );
  if (channelsToFetch.length === 0) {
    console.error(
      "No channels found - bot not in any channels and no known channels in DB",
    );
    return new Response(
      JSON.stringify({
        error: "No channels found",
        details: "The bot is not a member of any channels",
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // Build existing timestamp set for dedup (batch query instead of per-message)
  const { data: existingNotifs } = await supabaseAdmin
    .from("media_feed_items")
    .select("metadata")
    .eq("user_id", userId)
    .eq("source", "slack");

  const existingTsKeys = new Set<string>();
  for (const notif of existingNotifs ?? []) {
    const meta = notif.metadata as {
      channel_id?: string;
      timestamp?: string;
    } | null;
    if (meta?.channel_id && meta?.timestamp) {
      existingTsKeys.add(`${meta.channel_id}:${meta.timestamp}`);
    }
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  const errors: string[] = [];
  const userCache: UserInfoCache = new Map();
  const BATCH_SIZE = 20;

  for (const channel of channelsToFetch) {
    try {
      const messages = await fetchChannelHistory(
        channel.id,
        integration.bot_token,
      );

      totalFetched += messages.length;

      // Filter to new messages only
      const newMessages = messages.filter((msg) => {
        if (msg.bot_id) return false;
        if (!msg.text || msg.type !== "message") return false;
        if (existingTsKeys.has(`${channel.id}:${msg.ts}`)) {
          totalSkipped++;
          return false;
        }
        return true;
      });

      // Process in batches
      for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
        const batch = newMessages.slice(i, i + BATCH_SIZE);
        const rows = [];

        for (const msg of batch) {
          // Get user info (cached)
          let userName = msg.user || "Unknown";
          let userRealName = msg.user || "Unknown";
          let userDisplayName = msg.user || "Unknown";

          if (msg.user) {
            const userInfo = await getCachedUserInfo(
              msg.user,
              integration.bot_token,
              userCache,
            );
            if (userInfo) {
              userName = userInfo.name;
              userRealName = userInfo.real_name;
              userDisplayName = userInfo.display_name;
            }
          }

          // Process message text
          let messageBody = msg.text!;
          messageBody = await replaceUserMentions(
            messageBody,
            integration.bot_token,
            userCache,
          );
          messageBody = replaceChannelMentions(messageBody);
          messageBody = replaceSpecialMentions(messageBody);

          const slackTs = parseFloat(msg.ts);
          const messageDate = new Date(slackTs * 1000);
          const nowIso = new Date().toISOString();
          const notificationId = `slack-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

          rows.push({
            id: notificationId,
            user_id: userId,
            category_id: integration.default_category_id || null,
            source: "slack",
            priority: "medium",
            title: `#${channel.name}`,
            body: messageBody,
            metadata: {
              team_id: integration.team_id,
              channel_id: channel.id,
              channel_name: channel.name,
              channel_is_private: channel.is_private,
              user_id: msg.user,
              user_name: userName,
              user_real_name: userRealName,
              user_display_name: userDisplayName,
              timestamp: msg.ts,
            },
            is_read: true,
            created_at: messageDate.toISOString(),
            updated_at: nowIso,
          });

          existingTsKeys.add(`${channel.id}:${msg.ts}`);
        }

        if (rows.length > 0) {
          const { error: insertError } = await supabaseAdmin
            .from("media_feed_items")
            .insert(rows);

          if (insertError) {
            if (insertError.code === "23505") {
              // UNIQUE制約違反: バッチ内に重複あり → 1件ずつ挿入
              let inserted = 0;
              for (const row of rows) {
                const { error: singleErr } = await supabaseAdmin
                  .from("media_feed_items")
                  .insert(row);
                if (!singleErr) {
                  inserted++;
                } else if (singleErr.code !== "23505") {
                  console.error("Single insert error:", singleErr);
                }
              }
              totalInserted += inserted;
            } else {
              console.error("Batch insert error:", insertError);
              errors.push(
                `Batch insert failed in #${channel.name}: ${insertError.message}`,
              );
            }
          } else {
            totalInserted += rows.length;
          }
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`Error processing channel ${channel.name}:`, errorMsg);
      errors.push(`Error processing #${channel.name}: ${errorMsg}`);
    }
  }

  // Update sync_state to mark history as synced
  const nowIso = new Date().toISOString();
  const channelsSynced: Record<string, string> = {};
  for (const ch of channelsToFetch) {
    channelsSynced[ch.id] = nowIso;
  }
  await supabaseAdmin
    .from("slack_integrations")
    .update({
      sync_state: {
        ...syncState,
        history_synced_at: nowIso,
        channels_synced: channelsSynced,
      },
    })
    .eq("id", integration.id);

  return new Response(
    JSON.stringify({
      success: true,
      channels_processed: channelsToFetch.length,
      messages_fetched: totalFetched,
      messages_inserted: totalInserted,
      messages_skipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
});
