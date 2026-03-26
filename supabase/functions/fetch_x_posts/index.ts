import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

type XSource = {
  id: string;
  user_id: string;
  name: string;
  source_type: "account" | "keyword";
  query: string;
  category: string | null;
  is_active: boolean;
};

type XPost = {
  post_id: string;
  author_username: string;
  author_display_name: string;
  content: string;
  posted_at: string;
  url: string;
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
  };
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const xaiApiKey = Deno.env.get("XAI_API_KEY") ?? "";

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
};

// Call xAI API with x_search tool to fetch X posts
const fetchXPostsFromApi = async (source: XSource): Promise<XPost[]> => {
  const searchPrompt =
    source.source_type === "account"
      ? `Show me the latest posts from the X/Twitter account @${source.query}. Return the 10 most recent posts.`
      : `Search X/Twitter for recent posts about "${source.query}". Return the 10 most relevant recent posts.`;

  const tools =
    source.source_type === "account"
      ? [
          {
            type: "x_search" as const,
            x_search: {
              allowed_x_handles: [source.query.replace(/^@/, "")],
            },
          },
        ]
      : [{ type: "x_search" as const }];

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${xaiApiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4-fast",
      tools,
      instructions: `You are a helper that retrieves X/Twitter posts.
Return results as a JSON array with this exact structure:
[
  {
    "post_id": "unique post URL like https://x.com/username/status/123",
    "author_username": "username without @",
    "author_display_name": "Display Name",
    "content": "full post text content",
    "posted_at": "ISO 8601 timestamp",
    "url": "https://x.com/username/status/123",
    "metrics": { "likes": 0, "retweets": 0, "replies": 0 }
  }
]
Return ONLY the JSON array, no other text. No markdown code blocks.`,
      input: searchPrompt,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`xAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // Extract text content from the response
  let content = "";
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && item.content) {
        for (const block of item.content) {
          if (block.type === "output_text") {
            content += block.text;
          }
        }
      }
    }
  }

  if (!content) {
    console.error("No text content in xAI response:", JSON.stringify(data));
    return [];
  }

  // Parse JSON from response (handle potential markdown code blocks)
  const jsonStr = content
    .replace(/```json?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const posts = JSON.parse(jsonStr) as XPost[];
    return Array.isArray(posts) ? posts : [];
  } catch (parseErr) {
    console.error("Failed to parse xAI response as JSON:", parseErr);
    console.error("Raw content:", content.substring(0, 500));
    return [];
  }
};

// Process X sources for a single user
const processUserXSources = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{
  newItems: number;
  results: { source: string; items: number; error?: string }[];
}> => {
  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from("x_sources")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (sourcesError) {
    console.error("Failed to fetch X sources:", sourcesError);
    return { newItems: 0, results: [] };
  }

  if (!sources || sources.length === 0) {
    return { newItems: 0, results: [] };
  }

  // Get existing post IDs to avoid duplicates
  const { data: existingNotifs } = await supabaseAdmin
    .from("media_feed_items")
    .select("metadata")
    .eq("user_id", userId)
    .eq("source", "x");

  const existingPostIds = new Set<string>();
  for (const notif of existingNotifs ?? []) {
    const metadata = notif.metadata as { post_id?: string } | null;
    if (metadata?.post_id) {
      existingPostIds.add(metadata.post_id);
    }
  }

  let totalNewItems = 0;
  const fetchResults: { source: string; items: number; error?: string }[] = [];

  for (const source of sources as XSource[]) {
    try {
      console.log(
        `Fetching X posts for source: ${source.name} (${source.source_type}: ${source.query})`,
      );

      const posts = await fetchXPostsFromApi(source);
      let newItems = 0;

      for (const post of posts.slice(0, 20)) {
        const postId = post.url || post.post_id;
        if (!postId || existingPostIds.has(postId)) {
          continue;
        }

        const notificationId = `x-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const nowIso = new Date().toISOString();

        const { error: insertError } = await supabaseAdmin
          .from("media_feed_items")
          .insert({
            id: notificationId,
            user_id: userId,
            category_id: null,
            source: "x",
            priority: "low",
            title: `@${post.author_display_name || post.author_username}`,
            body: post.content,
            metadata: {
              post_id: postId,
              author_username: post.author_username,
              author_display_name: post.author_display_name,
              url: post.url,
              posted_at: post.posted_at,
              metrics: post.metrics,
              sourceId: source.id,
              sourceName: source.name,
              sourceType: source.source_type,
              sourceCategory: source.category,
            },
            is_read: false,
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (insertError) {
          console.error(`Failed to insert X post:`, insertError);
        } else {
          existingPostIds.add(postId);
          newItems++;
          totalNewItems++;
        }
      }

      // Update last_fetched_at
      await supabaseAdmin
        .from("x_sources")
        .update({ last_fetched_at: new Date().toISOString() })
        .eq("id", source.id);

      fetchResults.push({ source: source.name, items: newItems });
    } catch (err) {
      console.error(`Error fetching X posts for ${source.name}:`, err);
      fetchResults.push({
        source: source.name,
        items: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { newItems: totalNewItems, results: fetchResults };
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

  if (!xaiApiKey) {
    return new Response(
      JSON.stringify({ error: "Missing XAI_API_KEY configuration" }),
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Get user ID from request body or auth header
  let userId: string | null = null;
  try {
    const body = await req.json();
    userId = body.user_id;
  } catch {
    // No body provided (cron job)
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

  // If no user_id provided (cron job), process all users with active x_sources
  if (!userId) {
    const { data: activeUsers } = await supabaseAdmin
      .from("x_sources")
      .select("user_id")
      .eq("is_active", true);

    const uniqueUserIds = [
      ...new Set(
        (activeUsers ?? []).map((s: { user_id: string }) => s.user_id),
      ),
    ];

    if (uniqueUserIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active X sources",
          users_processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let totalNewItems = 0;
    const allResults: Record<string, unknown>[] = [];

    for (const uid of uniqueUserIds) {
      const { newItems, results } = await processUserXSources(
        supabaseAdmin,
        uid,
      );
      totalNewItems += newItems;
      allResults.push({ user_id: uid, newItems, results });
    }

    return new Response(
      JSON.stringify({
        success: true,
        users_processed: uniqueUserIds.length,
        new_items: totalNewItems,
        results: allResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Single user mode (manual refresh)
  const { newItems, results } = await processUserXSources(
    supabaseAdmin,
    userId,
  );

  return new Response(
    JSON.stringify({
      success: true,
      new_items: newItems,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
