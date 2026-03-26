-- AI Automations table for storing user-defined automation workflows
CREATE TABLE IF NOT EXISTS ai_automations (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  automation_type TEXT NOT NULL CHECK (automation_type IN ('paper_search', 'news_collection', 'custom')),
  config JSONB NOT NULL DEFAULT '{}',
  schedule TEXT NOT NULL DEFAULT 'daily' CHECK (schedule IN ('hourly', 'daily', 'weekly', 'monthly', 'manual')),
  ai_model TEXT NOT NULL DEFAULT 'gemini' CHECK (ai_model IN ('gemini', 'openai', 'anthropic', 'perplexity')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'error', 'running', 'pending')),
  last_run_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Automation Runs table for tracking execution history
CREATE TABLE IF NOT EXISTS ai_automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT REFERENCES ai_automations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'running', 'pending')),
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_automations_user_id ON ai_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_automations_enabled ON ai_automations(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_ai_automation_runs_automation_id ON ai_automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_ai_automation_runs_user_id ON ai_automation_runs(user_id);

-- Enable RLS
ALTER TABLE ai_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_automation_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_automations
CREATE POLICY "Users can view own AI automations"
  ON ai_automations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI automations"
  ON ai_automations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI automations"
  ON ai_automations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI automations"
  ON ai_automations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for ai_automation_runs
CREATE POLICY "Users can view own AI automation runs"
  ON ai_automation_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI automation runs"
  ON ai_automation_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI automation runs"
  ON ai_automation_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI automation runs"
  ON ai_automation_runs FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_ai_automations_updated_at ON ai_automations;
CREATE TRIGGER update_ai_automations_updated_at
  BEFORE UPDATE ON ai_automations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
