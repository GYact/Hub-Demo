import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import { sendPushToUser } from "../_shared/pushSend.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

type RssFeed = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  category: string | null;
  is_active: boolean;
};

type RssItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

// Simple XML parser for RSS/Atom feeds
const parseRssFeed = (xml: string, feedName: string): RssItem[] => {
  const items: RssItem[] = [];

  // Try RSS 2.0 format first
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractTag(itemXml, "title") || "Untitled";
    const link = extractTag(itemXml, "link") || "";
    const description = extractTag(itemXml, "description") || "";
    const pubDate = extractTag(itemXml, "pubDate") || new Date().toISOString();
    const guid =
      extractTag(itemXml, "guid") ||
      link ||
      `${feedName}-${Date.now()}-${Math.random()}`;

    items.push({ title, link, description, pubDate, guid });
  }

  // Try Atom format if no RSS items found
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];

      const title = extractTag(entryXml, "title") || "Untitled";
      // Atom uses <link href="..."/> format
      const linkMatch = entryXml.match(
        /<link[^>]*href=["']([^"']+)["'][^>]*>/i,
      );
      const link = linkMatch ? linkMatch[1] : "";
      const description =
        extractTag(entryXml, "summary") ||
        extractTag(entryXml, "content") ||
        "";
      const pubDate =
        extractTag(entryXml, "published") ||
        extractTag(entryXml, "updated") ||
        new Date().toISOString();
      const guid =
        extractTag(entryXml, "id") ||
        link ||
        `${feedName}-${Date.now()}-${Math.random()}`;

      items.push({ title, link, description, pubDate, guid });
    }
  }

  return items;
};

const extractTag = (xml: string, tagName: string): string => {
  // Handle CDATA sections
  const cdataRegex = new RegExp(
    `<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`,
    "i",
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Regular tag extraction
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? decodeHtmlEntities(match[1].trim()) : "";
};

const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]*>/g, ""); // Strip remaining HTML tags
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
};

type RssResult = {
  new_items: number;
  fetched: number;
  results: { feed: string; items: number; error?: string }[];
};

const processUserRss = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<RssResult> => {
  const { data: feeds, error: feedsError } = await supabaseAdmin
    .from("rss_feeds")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (feedsError || !feeds || feeds.length === 0) {
    return { new_items: 0, fetched: 0, results: [] };
  }

  const { data: existingNotifs } = await supabaseAdmin
    .from("media_feed_items")
    .select("metadata")
    .eq("user_id", userId)
    .eq("source", "rss");

  const existingGuids = new Set<string>();
  for (const notif of existingNotifs ?? []) {
    const metadata = notif.metadata as { guid?: string } | null;
    if (metadata?.guid) existingGuids.add(metadata.guid);
  }

  let totalNewItems = 0;
  const fetchResults: { feed: string; items: number; error?: string }[] = [];

  for (const feed of feeds as RssFeed[]) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          "User-Agent": "Hub-RSS-Fetcher/1.0",
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
      });

      if (!response.ok) {
        fetchResults.push({
          feed: feed.name,
          items: 0,
          error: `HTTP ${response.status}`,
        });
        continue;
      }

      const xml = await response.text();
      const items = parseRssFeed(xml, feed.name);
      let newItems = 0;

      for (const item of items.slice(0, 20)) {
        if (existingGuids.has(item.guid)) continue;

        const notificationId = `rss-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const nowIso = new Date().toISOString();

        const { error: insertError } = await supabaseAdmin
          .from("media_feed_items")
          .insert({
            id: notificationId,
            user_id: userId,
            category_id: null,
            source: "rss",
            priority: "low",
            title: truncateText(item.title, 200),
            body: truncateText(item.description, 500),
            metadata: {
              guid: item.guid,
              link: item.link,
              pubDate: item.pubDate,
              feedId: feed.id,
              feedName: feed.name,
              feedCategory: feed.category,
            },
            is_read: false,
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (!insertError) {
          existingGuids.add(item.guid);
          newItems++;
          totalNewItems++;
        }
      }

      await supabaseAdmin
        .from("rss_feeds")
        .update({ last_fetched_at: new Date().toISOString() })
        .eq("id", feed.id);

      fetchResults.push({ feed: feed.name, items: newItems });
    } catch (err) {
      fetchResults.push({
        feed: feed.name,
        items: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (
    totalNewItems > 0 &&
    (await isPushCategoryEnabled(supabaseAdmin, userId, "pushRss"))
  ) {
    await sendPushToUser(supabaseAdmin, userId, {
      title: "RSS更新",
      body: `${totalNewItems}件の新しい記事があります`,
      url: "/media",
      tag: `rss-update-${Date.now()}`,
    });
  }

  return {
    new_items: totalNewItems,
    fetched: feeds.length,
    results: fetchResults,
  };
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get user ID from request body or auth header
  let userId: string | null = null;
  try {
    const body = await req.json();
    userId = body.user_id;
  } catch {
    // No body provided
  }

  // Try to get user from Authorization header if not in body
  if (!userId) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const {
        data: { user },
      } = await supabaseClient.auth.getUser(token);
      userId = user?.id ?? null;
    }
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Cron mode: process all users with active feeds
  if (!userId) {
    const { data: userRows } = await supabaseAdmin
      .from("rss_feeds")
      .select("user_id")
      .eq("is_active", true);
    const userIds = [
      ...new Set((userRows ?? []).map((r: { user_id: string }) => r.user_id)),
    ];

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No users with active RSS feeds",
          accounts_processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let totalNew = 0;
    const allResults: Record<string, unknown>[] = [];
    for (const uid of userIds) {
      const result = await processUserRss(supabaseAdmin, uid);
      totalNew += result.new_items;
      allResults.push({ user_id: uid, ...result });
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_processed: userIds.length,
        new_items: totalNew,
        results: allResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Single user mode
  const result = await processUserRss(supabaseAdmin, userId);
  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
