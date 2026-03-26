-- AI Notification Categories - ユーザー定義カテゴリ
CREATE TABLE IF NOT EXISTS ai_notification_categories (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  icon TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Notifications - 通知本体
CREATE TABLE IF NOT EXISTS ai_notifications (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category_id TEXT REFERENCES ai_notification_categories(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'slack', 'automation', 'system')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Notification API Keys - Webhook用APIキー
CREATE TABLE IF NOT EXISTS ai_notification_api_keys (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Slack Integrations - Slack連携設定
CREATE TABLE IF NOT EXISTS slack_integrations (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  channel_filters JSONB DEFAULT '{"mode": "all", "channels": []}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);

-- Indexes for ai_notification_categories
CREATE INDEX IF NOT EXISTS idx_ai_notification_categories_user_id ON ai_notification_categories(user_id);

-- Indexes for ai_notifications
CREATE INDEX IF NOT EXISTS idx_ai_notifications_user_id ON ai_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_notifications_user_unread ON ai_notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_notifications_user_created ON ai_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_notifications_category ON ai_notifications(category_id);
CREATE INDEX IF NOT EXISTS idx_ai_notifications_source ON ai_notifications(user_id, source);
CREATE INDEX IF NOT EXISTS idx_ai_notifications_priority ON ai_notifications(user_id, priority);

-- Indexes for ai_notification_api_keys
CREATE INDEX IF NOT EXISTS idx_ai_notification_api_keys_user_id ON ai_notification_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_notification_api_keys_hash ON ai_notification_api_keys(key_hash) WHERE is_active = TRUE;

-- Indexes for slack_integrations
CREATE INDEX IF NOT EXISTS idx_slack_integrations_user_id ON slack_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_integrations_team_id ON slack_integrations(team_id);

-- Enable RLS
ALTER TABLE ai_notification_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_notification_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_notification_categories
CREATE POLICY "Users can view own notification categories"
  ON ai_notification_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification categories"
  ON ai_notification_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification categories"
  ON ai_notification_categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification categories"
  ON ai_notification_categories FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for ai_notifications
CREATE POLICY "Users can view own notifications"
  ON ai_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON ai_notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON ai_notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON ai_notifications FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for ai_notification_api_keys
CREATE POLICY "Users can view own API keys"
  ON ai_notification_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON ai_notification_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON ai_notification_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON ai_notification_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for slack_integrations
CREATE POLICY "Users can view own Slack integrations"
  ON slack_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Slack integrations"
  ON slack_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Slack integrations"
  ON slack_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Slack integrations"
  ON slack_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_ai_notification_categories_updated_at ON ai_notification_categories;
CREATE TRIGGER update_ai_notification_categories_updated_at
  BEFORE UPDATE ON ai_notification_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_notifications_updated_at ON ai_notifications;
CREATE TRIGGER update_ai_notifications_updated_at
  BEFORE UPDATE ON ai_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_notification_api_keys_updated_at ON ai_notification_api_keys;
CREATE TRIGGER update_ai_notification_api_keys_updated_at
  BEFORE UPDATE ON ai_notification_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_slack_integrations_updated_at ON slack_integrations;
CREATE TRIGGER update_slack_integrations_updated_at
  BEFORE UPDATE ON slack_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime for ai_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE ai_notifications;
