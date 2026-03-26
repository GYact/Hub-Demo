import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MAX_INPUT_CHARS = 8000;
const MAX_CONTENT_TEXT_CHARS = 10000;
const MAX_BULK_ITEMS = 500;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

type EmbeddingItem = {
  source_type: string;
  source_id: string;
  content: string;
  metadata?: Record<string, unknown>;
  user_id: string;
};

type EmbeddingResult = {
  source_type: string;
  source_id: string;
  success: boolean;
  error?: string;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function generateEmbedding(
  text: string,
  taskType = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const truncated = text.slice(0, MAX_INPUT_CHARS);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: truncated }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Gemini Embedding API error (${response.status}): ${errText}`,
    );
  }

  const data = await response.json();
  return data.embedding.values;
}

async function processItem(
  supabaseAdmin: ReturnType<typeof createClient>,
  item: EmbeddingItem,
): Promise<EmbeddingResult> {
  const { source_type, source_id, content, metadata, user_id } = item;

  if (!source_type || !source_id || !content || !user_id) {
    return {
      source_type: source_type ?? "",
      source_id: source_id ?? "",
      success: false,
      error:
        "Missing required fields: source_type, source_id, content, user_id",
    };
  }

  try {
    const embedding = await generateEmbedding(content);
    const contentText = content.slice(0, MAX_CONTENT_TEXT_CHARS);

    const { error: upsertError } = await supabaseAdmin
      .from("document_embeddings")
      .upsert(
        {
          user_id,
          source_type,
          source_id,
          content_text: contentText,
          embedding: JSON.stringify(embedding),
          metadata: metadata ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source_type,source_id" },
      );

    if (upsertError) {
      console.error(
        `Upsert error for ${source_type}/${source_id}:`,
        upsertError,
      );
      return {
        source_type,
        source_id,
        success: false,
        error: upsertError.message,
      };
    }

    return { source_type, source_id, success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing ${source_type}/${source_id}:`, errorMsg);
    return { source_type, source_id, success: false, error: errorMsg };
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase configuration" }, 500);
  }

  if (!geminiApiKey) {
    return jsonResponse({ error: "Missing GEMINI_API_KEY" }, 500);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Auth handled by --no-verify-jwt gateway setting.
  // Body requires user_id which provides row-level scoping.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Bulk mode: { items: [...] }
  if (Array.isArray(body.items)) {
    const items = body.items as EmbeddingItem[];

    if (items.length === 0) {
      return jsonResponse({ error: "items array is empty" }, 400);
    }

    if (items.length > MAX_BULK_ITEMS) {
      return jsonResponse(
        { error: `Too many items (max ${MAX_BULK_ITEMS})` },
        400,
      );
    }

    const results: EmbeddingResult[] = [];
    for (const item of items) {
      const result = await processItem(supabaseAdmin, item);
      results.push(result);
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return jsonResponse({
      success: true,
      total: items.length,
      succeeded,
      failed,
      results,
    });
  }

  // Single mode: { source_type, source_id, content, metadata, user_id }
  const item = body as unknown as EmbeddingItem;
  if (!item.source_type || !item.source_id || !item.content || !item.user_id) {
    return jsonResponse(
      {
        error:
          "Missing required fields: source_type, source_id, content, user_id",
      },
      400,
    );
  }

  const result = await processItem(supabaseAdmin, item);

  if (!result.success) {
    return jsonResponse({ error: result.error }, 500);
  }

  return jsonResponse({
    success: true,
    source_type: result.source_type,
    source_id: result.source_id,
  });
});
