/**
 * Local script to call backfill_embeddings Edge Function in a loop.
 * Handles Gemini free-tier rate limit (100 embeddings/min) by waiting between calls.
 *
 * Usage:
 *   deno run --allow-net scripts/backfill_embeddings_local.ts
 */

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "https://oxzzdkwvjdxpgdnrbflq.supabase.co";
const USER_ID = Deno.env.get("HUB_USER_ID");
if (!USER_ID) {
  console.error("Error: HUB_USER_ID environment variable is required");
  Deno.exit(1);
}
const BATCH_PER_CALL = 200; // Pay-as-you-go
const WAIT_BETWEEN_CALLS_MS = 3_000; // 3s between calls

const SOURCE_TYPES = [
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SourceSummary = {
  processed: number;
  skipped: number;
  errors: number;
  last_error?: string;
};

async function callBackfill(
  sourceType: string,
  batchSize: number,
): Promise<Record<string, SourceSummary>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/backfill_embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      source_type: sourceType,
      batch_size: batchSize,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Edge Function error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.summary as Record<string, SourceSummary>;
}

console.log("=== Backfill Embeddings via Edge Function ===");
console.log(`User: ${USER_ID}`);
console.log(`Batch per call: ${BATCH_PER_CALL}`);
console.log(`Wait between calls: ${WAIT_BETWEEN_CALLS_MS / 1000}s`);
console.log("");

const totalStats = { processed: 0, skipped: 0, errors: 0 };
const startTime = Date.now();

for (const sourceType of SOURCE_TYPES) {
  console.log(`\n--- ${sourceType} ---`);
  let round = 0;

  while (true) {
    round++;
    console.log(
      `  Round ${round}: calling backfill (batch_size=${BATCH_PER_CALL})...`,
    );

    try {
      const summary = await callBackfill(sourceType, BATCH_PER_CALL);
      const s = summary[sourceType];

      if (!s) {
        console.log("  No data returned, moving to next source.");
        break;
      }

      console.log(
        `  Result: processed=${s.processed}, skipped=${s.skipped}, errors=${s.errors}${s.last_error ? `, error: ${s.last_error.slice(0, 100)}` : ""}`,
      );

      totalStats.processed += s.processed;
      totalStats.skipped += s.skipped;
      totalStats.errors += s.errors;

      // If nothing was processed or skipped, all items for this source are done
      if (s.processed === 0 && s.skipped === 0) {
        console.log(`  ${sourceType} complete.`);
        break;
      }

      // Wait for rate limit to reset before next call
      if (s.processed > 0) {
        console.log(
          `  Waiting ${WAIT_BETWEEN_CALLS_MS / 1000}s for rate limit...`,
        );
        await sleep(WAIT_BETWEEN_CALLS_MS);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Error: ${msg}`);
      // Wait and retry
      console.log("  Waiting 10s before retry...");
      await sleep(10_000);
    }
  }
}

const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log("\n=== Backfill Complete ===");
console.log(
  `Total: ${totalStats.processed} processed, ${totalStats.skipped} skipped, ${totalStats.errors} errors`,
);
console.log(`Elapsed: ${elapsed} minutes`);
