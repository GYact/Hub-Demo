-- ============================================================
-- #5: RLS initplan optimization
--     auth.uid() → (select auth.uid()) to prevent per-row re-evaluation
-- #6: Fix document_embeddings permissive USING(true) policy
-- ============================================================

-- ============================================================
-- Type A: ALL command, authenticated role, auth.uid() = user_id
-- ============================================================

-- affiliations
DROP POLICY IF EXISTS "Users can manage own affiliations" ON affiliations;
CREATE POLICY "Users can manage own affiliations" ON affiliations
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ai_messages
DROP POLICY IF EXISTS "Users can manage own ai_messages" ON ai_messages;
CREATE POLICY "Users can manage own ai_messages" ON ai_messages
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ai_sessions
DROP POLICY IF EXISTS "Users can manage own ai_sessions" ON ai_sessions;
CREATE POLICY "Users can manage own ai_sessions" ON ai_sessions
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ai_shortcuts
DROP POLICY IF EXISTS "Users can manage own ai_shortcuts" ON ai_shortcuts;
CREATE POLICY "Users can manage own ai_shortcuts" ON ai_shortcuts
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- assets
DROP POLICY IF EXISTS "Users can manage own assets" ON assets;
CREATE POLICY "Users can manage own assets" ON assets
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- certifications
DROP POLICY IF EXISTS "Users can manage own certifications" ON certifications;
CREATE POLICY "Users can manage own certifications" ON certifications
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- client_tabs
DROP POLICY IF EXISTS "Users can manage own client_tabs" ON client_tabs;
CREATE POLICY "Users can manage own client_tabs" ON client_tabs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- clients
DROP POLICY IF EXISTS "Users can manage own clients" ON clients;
CREATE POLICY "Users can manage own clients" ON clients
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- data_catalog_items
DROP POLICY IF EXISTS "Users can manage own data_catalog_items" ON data_catalog_items;
CREATE POLICY "Users can manage own data_catalog_items" ON data_catalog_items
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- devices
DROP POLICY IF EXISTS "Users can manage own devices" ON devices;
CREATE POLICY "Users can manage own devices" ON devices
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- educations
DROP POLICY IF EXISTS "Users can manage own educations" ON educations;
CREATE POLICY "Users can manage own educations" ON educations
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- frames
DROP POLICY IF EXISTS "Users can manage own frames" ON frames;
CREATE POLICY "Users can manage own frames" ON frames
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- journal_entries
DROP POLICY IF EXISTS "Users can manage own journal_entries" ON journal_entries;
CREATE POLICY "Users can manage own journal_entries" ON journal_entries
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- journals
DROP POLICY IF EXISTS "Users can manage own journals" ON journals;
CREATE POLICY "Users can manage own journals" ON journals
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- languages
DROP POLICY IF EXISTS "Users can manage own languages" ON languages;
CREATE POLICY "Users can manage own languages" ON languages
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- memo_tabs
DROP POLICY IF EXISTS "Users can manage own memo_tabs" ON memo_tabs;
CREATE POLICY "Users can manage own memo_tabs" ON memo_tabs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- memo_trash
DROP POLICY IF EXISTS "Users can manage own memo_trash" ON memo_trash;
CREATE POLICY "Users can manage own memo_trash" ON memo_trash
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- memos
DROP POLICY IF EXISTS "Users can manage own memos" ON memos;
CREATE POLICY "Users can manage own memos" ON memos
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- menu_items
DROP POLICY IF EXISTS "Users can manage own menu_items" ON menu_items;
CREATE POLICY "Users can manage own menu_items" ON menu_items
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- nodes
DROP POLICY IF EXISTS "Users can manage own nodes" ON nodes;
CREATE POLICY "Users can manage own nodes" ON nodes
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- project_tabs
DROP POLICY IF EXISTS "Users can manage own project_tabs" ON project_tabs;
CREATE POLICY "Users can manage own project_tabs" ON project_tabs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- projects
DROP POLICY IF EXISTS "Users can manage own projects" ON projects;
CREATE POLICY "Users can manage own projects" ON projects
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- push_subscriptions
DROP POLICY IF EXISTS "Users can manage own push_subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage own push_subscriptions" ON push_subscriptions
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- skills
DROP POLICY IF EXISTS "Users can manage own skills" ON skills;
CREATE POLICY "Users can manage own skills" ON skills
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- subscriptions
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON subscriptions;
CREATE POLICY "Users can manage own subscriptions" ON subscriptions
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- task_dividers
DROP POLICY IF EXISTS "Users can manage own task_dividers" ON task_dividers;
CREATE POLICY "Users can manage own task_dividers" ON task_dividers
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- task_lists
DROP POLICY IF EXISTS "Users can manage own task_lists" ON task_lists;
CREATE POLICY "Users can manage own task_lists" ON task_lists
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- tasks
DROP POLICY IF EXISTS "Users can manage own tasks" ON tasks;
CREATE POLICY "Users can manage own tasks" ON tasks
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- tools
DROP POLICY IF EXISTS "Users can manage own tools" ON tools;
CREATE POLICY "Users can manage own tools" ON tools
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_preferences
DROP POLICY IF EXISTS "Users can manage own user_preferences" ON user_preferences;
CREATE POLICY "Users can manage own user_preferences" ON user_preferences
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_settings
DROP POLICY IF EXISTS "Users can manage own user_settings" ON user_settings;
CREATE POLICY "Users can manage own user_settings" ON user_settings
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- work_experiences
DROP POLICY IF EXISTS "Users can manage own work_experiences" ON work_experiences;
CREATE POLICY "Users can manage own work_experiences" ON work_experiences
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- profiles (uses auth.uid() = id, not user_id)
DROP POLICY IF EXISTS "Users can manage own profiles" ON profiles;
CREATE POLICY "Users can manage own profiles" ON profiles
  FOR ALL TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ============================================================
-- Type B: Separate CRUD policies, public role
-- ============================================================

-- ai_automations
DROP POLICY IF EXISTS "Users can view own AI automations" ON ai_automations;
DROP POLICY IF EXISTS "Users can insert own AI automations" ON ai_automations;
DROP POLICY IF EXISTS "Users can update own AI automations" ON ai_automations;
DROP POLICY IF EXISTS "Users can delete own AI automations" ON ai_automations;
CREATE POLICY "Users can view own AI automations" ON ai_automations
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own AI automations" ON ai_automations
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own AI automations" ON ai_automations
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own AI automations" ON ai_automations
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- ai_automation_runs
DROP POLICY IF EXISTS "Users can view own AI automation runs" ON ai_automation_runs;
DROP POLICY IF EXISTS "Users can insert own AI automation runs" ON ai_automation_runs;
DROP POLICY IF EXISTS "Users can update own AI automation runs" ON ai_automation_runs;
DROP POLICY IF EXISTS "Users can delete own AI automation runs" ON ai_automation_runs;
CREATE POLICY "Users can view own AI automation runs" ON ai_automation_runs
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own AI automation runs" ON ai_automation_runs
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own AI automation runs" ON ai_automation_runs
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own AI automation runs" ON ai_automation_runs
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- ai_notification_api_keys
DROP POLICY IF EXISTS "Users can view own API keys" ON ai_notification_api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON ai_notification_api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON ai_notification_api_keys;
DROP POLICY IF EXISTS "Users can delete own API keys" ON ai_notification_api_keys;
CREATE POLICY "Users can view own API keys" ON ai_notification_api_keys
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own API keys" ON ai_notification_api_keys
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own API keys" ON ai_notification_api_keys
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own API keys" ON ai_notification_api_keys
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- ai_notification_categories
DROP POLICY IF EXISTS "Users can view own notification categories" ON ai_notification_categories;
DROP POLICY IF EXISTS "Users can insert own notification categories" ON ai_notification_categories;
DROP POLICY IF EXISTS "Users can update own notification categories" ON ai_notification_categories;
DROP POLICY IF EXISTS "Users can delete own notification categories" ON ai_notification_categories;
CREATE POLICY "Users can view own notification categories" ON ai_notification_categories
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own notification categories" ON ai_notification_categories
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own notification categories" ON ai_notification_categories
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own notification categories" ON ai_notification_categories
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- ai_notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON ai_notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON ai_notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON ai_notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON ai_notifications;
CREATE POLICY "Users can view own notifications" ON ai_notifications
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own notifications" ON ai_notifications
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own notifications" ON ai_notifications
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own notifications" ON ai_notifications
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- rss_feeds
DROP POLICY IF EXISTS "Users can view own RSS feeds" ON rss_feeds;
DROP POLICY IF EXISTS "Users can insert own RSS feeds" ON rss_feeds;
DROP POLICY IF EXISTS "Users can update own RSS feeds" ON rss_feeds;
DROP POLICY IF EXISTS "Users can delete own RSS feeds" ON rss_feeds;
CREATE POLICY "Users can view own RSS feeds" ON rss_feeds
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own RSS feeds" ON rss_feeds
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own RSS feeds" ON rss_feeds
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own RSS feeds" ON rss_feeds
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- slack_integrations
DROP POLICY IF EXISTS "Users can view own Slack integrations" ON slack_integrations;
DROP POLICY IF EXISTS "Users can insert own Slack integrations" ON slack_integrations;
DROP POLICY IF EXISTS "Users can update own Slack integrations" ON slack_integrations;
DROP POLICY IF EXISTS "Users can delete own Slack integrations" ON slack_integrations;
CREATE POLICY "Users can view own Slack integrations" ON slack_integrations
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own Slack integrations" ON slack_integrations
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own Slack integrations" ON slack_integrations
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own Slack integrations" ON slack_integrations
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- switchbot_credentials
DROP POLICY IF EXISTS "Users can view own switchbot credentials" ON switchbot_credentials;
DROP POLICY IF EXISTS "Users can insert own switchbot credentials" ON switchbot_credentials;
DROP POLICY IF EXISTS "Users can update own switchbot credentials" ON switchbot_credentials;
DROP POLICY IF EXISTS "Users can delete own switchbot credentials" ON switchbot_credentials;
CREATE POLICY "Users can view own switchbot credentials" ON switchbot_credentials
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own switchbot credentials" ON switchbot_credentials
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own switchbot credentials" ON switchbot_credentials
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own switchbot credentials" ON switchbot_credentials
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- ============================================================
-- Type C: Limited policies (SELECT/UPDATE only)
-- ============================================================

-- google_calendar_events (SELECT only)
DROP POLICY IF EXISTS "Users can view own calendar events" ON google_calendar_events;
CREATE POLICY "Users can view own calendar events" ON google_calendar_events
  FOR SELECT TO public USING ((select auth.uid()) = user_id);

-- google_gmail_messages (SELECT + UPDATE)
DROP POLICY IF EXISTS "Users can view own gmail messages" ON google_gmail_messages;
DROP POLICY IF EXISTS "Users can update own gmail messages" ON google_gmail_messages;
CREATE POLICY "Users can view own gmail messages" ON google_gmail_messages
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own gmail messages" ON google_gmail_messages
  FOR UPDATE TO public USING ((select auth.uid()) = user_id);

-- media_feed_items (SELECT + UPDATE)
DROP POLICY IF EXISTS "Users can view own media feed items" ON media_feed_items;
DROP POLICY IF EXISTS "Users can update own media feed items" ON media_feed_items;
CREATE POLICY "Users can view own media feed items" ON media_feed_items
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own media feed items" ON media_feed_items
  FOR UPDATE TO public USING ((select auth.uid()) = user_id);

-- switchbot_status_history (SELECT only)
DROP POLICY IF EXISTS "Users can view own switchbot history" ON switchbot_status_history;
CREATE POLICY "Users can view own switchbot history" ON switchbot_status_history
  FOR SELECT TO public USING ((select auth.uid()) = user_id);

-- ============================================================
-- Type D: x_sources (service_role + per-user CRUD)
-- ============================================================

DROP POLICY IF EXISTS "Service role can manage X sources" ON x_sources;
DROP POLICY IF EXISTS "Users can view own X sources" ON x_sources;
DROP POLICY IF EXISTS "Users can insert own X sources" ON x_sources;
DROP POLICY IF EXISTS "Users can update own X sources" ON x_sources;
DROP POLICY IF EXISTS "Users can delete own X sources" ON x_sources;

CREATE POLICY "Service role can manage X sources" ON x_sources
  FOR ALL TO public USING ((select auth.role()) = 'service_role');
CREATE POLICY "Users can view own X sources" ON x_sources
  FOR SELECT TO public USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own X sources" ON x_sources
  FOR INSERT TO public WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own X sources" ON x_sources
  FOR UPDATE TO public USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own X sources" ON x_sources
  FOR DELETE TO public USING ((select auth.uid()) = user_id);

-- ============================================================
-- #6: Fix document_embeddings - restrict service role policy
--     USING(true) on role public → USING(auth.role()='service_role')
-- ============================================================

DROP POLICY IF EXISTS "Service role can manage all embeddings" ON document_embeddings;
DROP POLICY IF EXISTS "Users can read own embeddings" ON document_embeddings;

-- Service role only: for Edge Functions (generate_embedding, backfill_embeddings, ai_hub_chat)
CREATE POLICY "Service role can manage all embeddings" ON document_embeddings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own embeddings
CREATE POLICY "Users can read own embeddings" ON document_embeddings
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
