-- =============================================================
-- Fix 1: Add WITH CHECK to UPDATE policies (9 tables)
-- Prevents user_id tampering via UPDATE
-- =============================================================

-- ai_automation_runs
DROP POLICY IF EXISTS "Users can update own AI automation runs" ON ai_automation_runs;
CREATE POLICY "Users can update own AI automation runs" ON ai_automation_runs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ai_automations
DROP POLICY IF EXISTS "Users can update own AI automations" ON ai_automations;
CREATE POLICY "Users can update own AI automations" ON ai_automations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ai_notification_api_keys
DROP POLICY IF EXISTS "Users can update own API keys" ON ai_notification_api_keys;
CREATE POLICY "Users can update own API keys" ON ai_notification_api_keys
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ai_notification_categories
DROP POLICY IF EXISTS "Users can update own notification categories" ON ai_notification_categories;
CREATE POLICY "Users can update own notification categories" ON ai_notification_categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ai_notifications
DROP POLICY IF EXISTS "Users can update own notifications" ON ai_notifications;
CREATE POLICY "Users can update own notifications" ON ai_notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- rss_feeds
DROP POLICY IF EXISTS "Users can update own RSS feeds" ON rss_feeds;
CREATE POLICY "Users can update own RSS feeds" ON rss_feeds
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- slack_integrations
DROP POLICY IF EXISTS "Users can update own Slack integrations" ON slack_integrations;
CREATE POLICY "Users can update own Slack integrations" ON slack_integrations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- switchbot_credentials
DROP POLICY IF EXISTS "Users can update own switchbot credentials" ON switchbot_credentials;
CREATE POLICY "Users can update own switchbot credentials" ON switchbot_credentials
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- x_sources
DROP POLICY IF EXISTS "Users can update own X sources" ON x_sources;
CREATE POLICY "Users can update own X sources" ON x_sources
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================
-- Fix 2: Remove redundant public CRUD policies (4 tables)
-- These tables have "authenticated ALL" with proper WITH CHECK
-- =============================================================

-- ai_messages
DROP POLICY IF EXISTS "Users can view own AI messages" ON ai_messages;
DROP POLICY IF EXISTS "Users can insert own AI messages" ON ai_messages;
DROP POLICY IF EXISTS "Users can update own AI messages" ON ai_messages;
DROP POLICY IF EXISTS "Users can delete own AI messages" ON ai_messages;

-- ai_sessions
DROP POLICY IF EXISTS "Users can view own AI sessions" ON ai_sessions;
DROP POLICY IF EXISTS "Users can insert own AI sessions" ON ai_sessions;
DROP POLICY IF EXISTS "Users can update own AI sessions" ON ai_sessions;
DROP POLICY IF EXISTS "Users can delete own AI sessions" ON ai_sessions;

-- user_preferences
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;

-- user_settings
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;
