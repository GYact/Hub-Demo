import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";

type SlackEvent = {
  type: string;
  token?: string;
  challenge?: string;
  team_id?: string;
  event_id?: string; // Slack's unique event ID for deduplication
  event?: {
    type: string;
    channel?: string;
    channel_type?: string;
    user?: string;
    text?: string;
    ts?: string;
    bot_id?: string;
    client_msg_id?: string; // Unique message ID
  };
};

type ChannelFilter = {
  mode: "all" | "include" | "exclude";
  channels: string[];
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const slackSigningSecret = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";

const verifySlackSignature = async (
  req: Request,
  body: string,
): Promise<boolean> => {
  if (!slackSigningSecret) {
    console.warn(
      "SLACK_SIGNING_SECRET not set, skipping signature verification",
    );
    return true; // Allow in development, but warn
  }

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  if (!timestamp || !signature) {
    return false;
  }

  // Check timestamp to prevent replay attacks (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(slackSigningSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(sigBasestring),
  );

  const computedSignature =
    "v0=" +
    Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return computedSignature === signature;
};

const shouldForwardMessage = (
  channelId: string,
  filter: ChannelFilter,
): boolean => {
  if (filter.mode === "all") return true;
  if (filter.mode === "include") return filter.channels.includes(channelId);
  if (filter.mode === "exclude") return !filter.channels.includes(channelId);
  return true;
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

// Replace user mentions <@U0A7GS4JK5G> with actual display names
const replaceUserMentions = async (
  text: string,
  botToken: string,
): Promise<string> => {
  // Match all user mentions like <@U0A7GS4JK5G> or <@U0A7GS4JK5G|display_name>
  const mentionRegex = /<@([A-Z0-9]+)(?:\|[^>]*)?>/g;
  const matches = [...text.matchAll(mentionRegex)];

  if (matches.length === 0) return text;

  // Get unique user IDs
  const userIds = [...new Set(matches.map((m) => m[1]))];

  // Fetch user info for all mentioned users
  const userMap = new Map<string, string>();
  for (const userId of userIds) {
    const userInfo = await getUserInfo(userId, botToken);
    if (userInfo) {
      userMap.set(
        userId,
        userInfo.display_name || userInfo.real_name || userInfo.name,
      );
    }
  }

  // Replace mentions with display names
  let result = text;
  for (const [userId, displayName] of userMap) {
    // Replace both <@U123> and <@U123|name> formats
    result = result.replace(
      new RegExp(`<@${userId}(?:\\|[^>]*)?>`, "g"),
      `@${displayName}`,
    );
  }

  return result;
};

// Replace channel mentions <#C0A7GS4JK5G|channel-name> with readable format
const replaceChannelMentions = (text: string): string => {
  // Match channel mentions like <#C0A7GS4JK5G|channel-name>
  return text.replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1");
};

// Replace special mentions
const replaceSpecialMentions = (text: string): string => {
  return text
    .replace(/<!channel>/g, "@channel")
    .replace(/<!here>/g, "@here")
    .replace(/<!everyone>/g, "@everyone");
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const body = await req.text();

  let payload: SlackEvent;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Handle URL verification challenge FIRST (before any other checks)
  if (payload.type === "url_verification" && payload.challenge) {
    return new Response(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Check Supabase configuration for event processing
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase configuration", { status: 500 });
  }

  // Verify Slack signature for non-challenge requests
  const isValid = await verifySlackSignature(req, body);
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Handle event callbacks
  if (payload.type === "event_callback" && payload.event && payload.team_id) {
    const event = payload.event;

    // Ignore bot messages to prevent loops
    if (event.bot_id) {
      return new Response("OK", { status: 200 });
    }

    // Only process message events
    if (event.type !== "message" || !event.text || !event.channel) {
      return new Response("OK", { status: 200 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Find Slack integration for this team
    const { data: integration, error: integrationError } = await supabaseAdmin
      .from("slack_integrations")
      .select(
        "id, user_id, channel_filters, default_category_id, is_active, bot_token",
      )
      .eq("team_id", payload.team_id)
      .eq("is_active", true)
      .single();

    if (integrationError || !integration) {
      console.log(`No active integration found for team ${payload.team_id}`);
      return new Response("OK", { status: 200 });
    }

    // Check channel filter
    const channelFilter = (integration.channel_filters as ChannelFilter) || {
      mode: "all",
      channels: [],
    };

    if (!shouldForwardMessage(event.channel, channelFilter)) {
      return new Response("OK", { status: 200 });
    }

    // Check for duplicate events using message timestamp and channel
    // Slack retries events if response is not received within 3 seconds
    const messageTs = event.ts || "";
    const dedupeKey = `${payload.team_id}-${event.channel}-${messageTs}`;

    // Check if this message already exists in the database
    const { data: existingNotification } = await supabaseAdmin
      .from("media_feed_items")
      .select("id")
      .eq("user_id", integration.user_id)
      .eq("source", "slack")
      .contains("metadata", {
        team_id: payload.team_id,
        channel_id: event.channel,
        timestamp: messageTs,
      })
      .limit(1)
      .single();

    if (existingNotification) {
      console.log(`Duplicate event detected, skipping: ${dedupeKey}`);
      return new Response("OK", { status: 200 });
    }

    // Resolve channel and user names using Slack API
    let channelName = event.channel;
    let channelIsPrivate = false;
    let userName = event.user || "Unknown";
    let userRealName = event.user || "Unknown";
    let userDisplayName = event.user || "Unknown";
    let messageBody = event.text;

    if (integration.bot_token) {
      // Fetch channel info
      const channelInfo = await getChannelInfo(
        event.channel,
        integration.bot_token,
      );
      if (channelInfo) {
        channelName = channelInfo.name;
        channelIsPrivate = channelInfo.is_private;
      }

      // Fetch user info
      if (event.user) {
        const userInfo = await getUserInfo(event.user, integration.bot_token);
        if (userInfo) {
          userName = userInfo.name;
          userRealName = userInfo.real_name;
          userDisplayName = userInfo.display_name;
        }
      }

      // Replace user mentions in message body with actual names
      messageBody = await replaceUserMentions(
        messageBody,
        integration.bot_token,
      );
    }

    // Replace channel mentions and special mentions (doesn't require API)
    messageBody = replaceChannelMentions(messageBody);
    messageBody = replaceSpecialMentions(messageBody);

    // Create notification with resolved names
    const notificationId = `slack-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("media_feed_items")
      .insert({
        id: notificationId,
        user_id: integration.user_id,
        category_id: integration.default_category_id || null,
        source: "slack",
        priority: "medium",
        title: `#${channelName}`,
        body: messageBody,
        metadata: {
          team_id: payload.team_id,
          channel_id: event.channel,
          channel_name: channelName,
          channel_is_private: channelIsPrivate,
          channel_type: event.channel_type,
          user_id: event.user,
          user_name: userName,
          user_real_name: userRealName,
          user_display_name: userDisplayName,
          timestamp: event.ts,
        },
        is_read: false,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (insertError) {
      // UNIQUE INDEX違反（重複）は正常系として処理
      if (insertError.code === "23505") {
        console.log(`Duplicate message skipped by DB constraint: ${dedupeKey}`);
        return new Response("OK", { status: 200 });
      }
      console.error("Failed to insert Slack notification:", insertError);
    } else {
      // Send push notification if category is enabled
      if (
        await isPushCategoryEnabled(
          supabaseAdmin,
          integration.user_id,
          "pushSlack",
        )
      ) {
        await sendPushToUser(supabaseAdmin, integration.user_id, {
          title: `#${channelName}`,
          body: `${userDisplayName}: ${event.text}`,
          url: "/ai/notify-box",
          tag: `ai-notification-${notificationId}`,
        });
      }
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("OK", { status: 200 });
});
