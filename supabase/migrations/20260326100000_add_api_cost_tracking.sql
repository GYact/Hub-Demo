-- API Usage Logs — track every AI API call for cost management
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,          -- 'gemini', 'openai', 'anthropic', 'perplexity'
  model text NOT NULL,
  function_name text NOT NULL,     -- 'ai_hub_chat', 'generate_journal', etc.
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  estimated_cost_usd numeric(10,6) DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- API Cost Limits — per-provider spending limits
CREATE TABLE IF NOT EXISTS api_cost_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  daily_limit_usd numeric(10,2),
  monthly_limit_usd numeric(10,2),
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider ON api_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider_created ON api_usage_logs(provider, created_at);

-- Initialize default limits (disabled by default)
INSERT INTO api_cost_limits (provider, daily_limit_usd, monthly_limit_usd, enabled)
VALUES
  ('gemini',     5.00, 50.00, false),
  ('openai',     5.00, 50.00, false),
  ('anthropic',  5.00, 50.00, false),
  ('perplexity', 5.00, 50.00, false)
ON CONFLICT (provider) DO NOTHING;
