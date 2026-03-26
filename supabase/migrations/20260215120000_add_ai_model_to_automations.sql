-- Add ai_model column to ai_automations table
ALTER TABLE ai_automations ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'gemini';

-- Add comment explaining the column
COMMENT ON COLUMN ai_automations.ai_model IS 'AI provider to use: gemini, openai, anthropic, perplexity';
