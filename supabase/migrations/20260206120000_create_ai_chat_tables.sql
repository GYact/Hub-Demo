-- Initial creation of AI chat tables (duplicate of 20260206130000, applied via MCP)
-- The fetch_x_posts cron function was applied separately outside migrations

CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES ai_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id ON ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user_id ON ai_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id ON ai_messages(session_id);

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI sessions"
  ON ai_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI sessions"
  ON ai_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI sessions"
  ON ai_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI sessions"
  ON ai_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own AI messages"
  ON ai_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI messages"
  ON ai_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI messages"
  ON ai_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI messages"
  ON ai_messages FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_ai_sessions_updated_at ON ai_sessions;
CREATE TRIGGER update_ai_sessions_updated_at
  BEFORE UPDATE ON ai_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_messages_updated_at ON ai_messages;
CREATE TRIGGER update_ai_messages_updated_at
  BEFORE UPDATE ON ai_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
