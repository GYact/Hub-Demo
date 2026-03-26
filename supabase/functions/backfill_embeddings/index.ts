import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MAX_INPUT_CHARS = 8000;
const MAX_CONTENT_TEXT_CHARS = 10000;
const EMBED_BATCH_SIZE = 50;
const EMBED_RETRY_MAX = 5;
const EMBED_BATCH_DELAY_MS = 2000;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

const VALID_SOURCE_TYPES = [
  "memo",
  "journal",
  "gmail",
  "task",
  "media_feed",
  "project",
  "client",
  "invoice",
  "expense",
  "money_document",
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTrivialContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed === "" || trimmed === ":";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const truncated = texts.map((t) => t.slice(0, MAX_INPUT_CHARS));
  const requests = truncated.map((text) => ({
    model: `models/${GEMINI_EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_DOCUMENT",
    outputDimensionality: EMBEDDING_DIMENSIONS,
  }));

  for (let attempt = 0; attempt < EMBED_RETRY_MAX; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      return data.embeddings.map((e: { values: number[] }) => e.values);
    }

    if (response.status === 429 && attempt < EMBED_RETRY_MAX - 1) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter
        ? Number(retryAfter) * 1000
        : 5000 * (attempt + 1);
      console.warn(
        `Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1})`,
      );
      await response.text();
      await sleep(waitMs);
      continue;
    }

    const errText = await response.text();
    throw new Error(
      `Gemini Embedding API error (${response.status}): ${errText}`,
    );
  }

  throw new Error("Exhausted retries for Gemini embedding API");
}

type SourceSummary = {
  processed: number;
  skipped: number;
  errors: number;
  last_error?: string;
};

type UnembeddedItem = {
  source_id: string;
  content_text: string;
  metadata: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Per-source processing using get_unembedded_source_data RPC
// ---------------------------------------------------------------------------

async function processSource(
  supabaseAdmin: ReturnType<typeof createClient>,
  sourceType: string,
  userId: string,
  batchSize: number,
): Promise<SourceSummary> {
  const summary: SourceSummary = { processed: 0, skipped: 0, errors: 0 };

  // Use SQL function to get only un-embedded items efficiently
  const { data: items, error: rpcError } = await supabaseAdmin.rpc(
    "get_unembedded_source_data",
    {
      p_user_id: userId,
      p_source_type: sourceType,
      p_limit: batchSize,
    },
  );

  if (rpcError) {
    console.error(`RPC error for ${sourceType}:`, rpcError.message);
    summary.errors = 1;
    summary.last_error = `rpc: ${rpcError.message}`;
    return summary;
  }

  if (!items || items.length === 0) {
    return summary;
  }

  // Filter out trivial content
  const validItems: UnembeddedItem[] = [];
  for (const item of items as UnembeddedItem[]) {
    if (isTrivialContent(item.content_text ?? "")) {
      summary.skipped++;
      continue;
    }
    validItems.push(item);
  }

  if (validItems.length === 0) {
    return summary;
  }

  // Process in embedding batches with delay to respect rate limits
  for (let i = 0; i < validItems.length; i += EMBED_BATCH_SIZE) {
    if (i > 0) await sleep(EMBED_BATCH_DELAY_MS);

    const batch = validItems.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((item) => item.content_text);

    try {
      const embeddings = await generateEmbeddingBatch(texts);

      // Batch upsert
      const upsertRows = batch.map((item, j) => ({
        user_id: userId,
        source_type: sourceType,
        source_id: item.source_id,
        content_text: item.content_text.slice(0, MAX_CONTENT_TEXT_CHARS),
        embedding: JSON.stringify(embeddings[j]),
        metadata: item.metadata ?? {},
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabaseAdmin
        .from("document_embeddings")
        .upsert(upsertRows, {
          onConflict: "user_id,source_type,source_id",
        });

      if (upsertError) {
        console.error(`Batch upsert error: ${upsertError.message}`);
        summary.errors += batch.length;
        summary.last_error = `upsert: ${upsertError.message}`;
      } else {
        summary.processed += batch.length;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Batch embedding error: ${errorMsg}`);
      summary.errors += batch.length;
      summary.last_error = errorMsg;
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  let userId: string;

  // If user_id is provided directly in body (admin/backfill mode)
  if (body.user_id) {
    userId = body.user_id as string;
  } else {
    // User JWT mode
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    userId = user.id;
  }

  // source_type filter (required for batch mode, optional otherwise)
  const sourceTypeFilter = body.source_type as string | undefined;
  const batchSize = (body.batch_size as number) || 200;

  const sourceTypes = sourceTypeFilter
    ? [sourceTypeFilter]
    : VALID_SOURCE_TYPES;

  // Validate source types
  for (const st of sourceTypes) {
    if (!VALID_SOURCE_TYPES.includes(st)) {
      return jsonResponse({ error: `Unknown source_type: ${st}` }, 400);
    }
  }

  console.log(
    `Starting backfill for user ${userId}, sources: ${sourceTypes.join(", ")}, batch_size: ${batchSize}`,
  );

  const summary: Record<string, SourceSummary> = {};

  for (const sourceType of sourceTypes) {
    console.log(`Processing source: ${sourceType}`);
    summary[sourceType] = await processSource(
      supabaseAdmin,
      sourceType,
      userId,
      batchSize,
    );
    console.log(
      `  ${sourceType}: processed=${summary[sourceType].processed}, skipped=${summary[sourceType].skipped}, errors=${summary[sourceType].errors}`,
    );
  }

  console.log(`backfill completed for user ${userId}`);

  return jsonResponse({ status: "completed", summary });
});
