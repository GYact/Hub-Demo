-- AI Company: orchestration history, chat messages, generated posts

-- Orchestration runs (one row per orchestration session)
CREATE TABLE IF NOT EXISTS ai_company_orchestrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task TEXT NOT NULL,
  target_group TEXT,
  result JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages between user and agents
CREATE TABLE IF NOT EXISTS ai_company_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated social media posts
CREATE TABLE IF NOT EXISTS ai_company_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  agent_id TEXT,
  agent_name TEXT,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_company_orchestrations_user
  ON ai_company_orchestrations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_company_messages_user
  ON ai_company_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_company_messages_agent
  ON ai_company_messages(user_id, from_agent_id, to_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_company_posts_user
  ON ai_company_posts(user_id, created_at DESC);

-- RLS
ALTER TABLE ai_company_orchestrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_company_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_company_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai_company_orchestrations"
  ON ai_company_orchestrations FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users manage own ai_company_messages"
  ON ai_company_messages FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users manage own ai_company_posts"
  ON ai_company_posts FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
