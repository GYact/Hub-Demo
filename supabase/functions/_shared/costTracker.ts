import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Pricing per 1M tokens (USD)
const PRICING: Record<
  string,
  Record<string, { input: number; output: number }>
> = {
  gemini: {
    default: { input: 0.15, output: 0.6 },
    "gemini-2.5-flash": { input: 0.15, output: 0.6 },
    "gemini-2.5-pro": { input: 1.25, output: 10.0 },
    "gemini-3-pro-preview": { input: 1.25, output: 10.0 },
  },
  openai: {
    default: { input: 0.4, output: 1.6 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6 },
    "gpt-5.2": { input: 2.5, output: 10.0 },
  },
  anthropic: {
    default: { input: 3.0, output: 15.0 },
    "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  },
  perplexity: {
    default: { input: 1.0, output: 1.0 },
    "sonar-reasoning-pro": { input: 1.0, output: 5.0 },
  },
};

export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const providerPricing = PRICING[provider] ?? {};
  const modelPricing = providerPricing[model] ??
    providerPricing.default ?? { input: 1.0, output: 3.0 };
  return (
    (inputTokens * modelPricing.input + outputTokens * modelPricing.output) /
    1_000_000
  );
}

/** Estimate tokens from text length (rough heuristic). */
export function estimateTokensFromText(text: string): number {
  const jpChars = (text.match(/[\u3000-\u9fff\uf900-\ufaff]/g) || []).length;
  const otherChars = text.length - jpChars;
  return Math.ceil(jpChars / 1.5 + otherChars / 4);
}

/** Log a single AI API call to api_usage_logs. */
export async function logApiUsage(
  supabaseAdmin: ReturnType<typeof createClient>,
  provider: string,
  model: string,
  functionName: string,
  inputTokens: number,
  outputTokens: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const cost = estimateCost(provider, model, inputTokens, outputTokens);
  await supabaseAdmin.from("api_usage_logs").insert({
    provider,
    model,
    function_name: functionName,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: cost,
    metadata: metadata ?? {},
  });
}

/** Check whether the provider has exceeded its configured cost limits. */
export async function checkCostLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  provider: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: limit } = await supabaseAdmin
    .from("api_cost_limits")
    .select("*")
    .eq("provider", provider)
    .single();

  if (!limit || !limit.enabled) return { allowed: true };

  const now = new Date();

  // Daily limit
  if (limit.daily_limit_usd) {
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("api_usage_logs")
      .select("estimated_cost_usd")
      .eq("provider", provider)
      .gte("created_at", startOfDay);

    const total = (rows ?? []).reduce(
      (s, r) => s + Number(r.estimated_cost_usd),
      0,
    );
    if (total >= Number(limit.daily_limit_usd)) {
      return {
        allowed: false,
        reason: `Daily limit exceeded: $${total.toFixed(2)} / $${limit.daily_limit_usd}`,
      };
    }
  }

  // Monthly limit
  if (limit.monthly_limit_usd) {
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("api_usage_logs")
      .select("estimated_cost_usd")
      .eq("provider", provider)
      .gte("created_at", startOfMonth);

    const total = (rows ?? []).reduce(
      (s, r) => s + Number(r.estimated_cost_usd),
      0,
    );
    if (total >= Number(limit.monthly_limit_usd)) {
      return {
        allowed: false,
        reason: `Monthly limit exceeded: $${total.toFixed(2)} / $${limit.monthly_limit_usd}`,
      };
    }
  }

  return { allowed: true };
}
