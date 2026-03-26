-- =============================================================================
-- SwitchBot credentials + status history + cron
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. switchbot_credentials (token/secret per user)
-- ---------------------------------------------------------------------------
CREATE TABLE switchbot_credentials (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  secret     TEXT NOT NULL,
  is_valid   BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE switchbot_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own switchbot credentials"
  ON switchbot_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own switchbot credentials"
  ON switchbot_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own switchbot credentials"
  ON switchbot_credentials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own switchbot credentials"
  ON switchbot_credentials FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_switchbot_credentials_updated_at ON switchbot_credentials;
CREATE TRIGGER update_switchbot_credentials_updated_at
  BEFORE UPDATE ON switchbot_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. switchbot_status_history (hourly device snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE switchbot_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT,
  status      JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sbh_user_device_time
  ON switchbot_status_history(user_id, device_id, recorded_at DESC);

CREATE INDEX idx_sbh_user_time
  ON switchbot_status_history(user_id, recorded_at DESC);

ALTER TABLE switchbot_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own switchbot history"
  ON switchbot_status_history FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Cron: call_fetch_switchbot_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION call_fetch_switchbot_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
BEGIN
  SELECT current_setting('app.settings.supabase_url', true) INTO supabase_url;

  IF supabase_url IS NULL THEN
    supabase_url := 'https://oxzzdkwvjdxpgdnrbflq.supabase.co';
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/fetch_switchbot_status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule(
  'fetch-switchbot-status',
  '0 * * * *',
  'SELECT call_fetch_switchbot_status();'
);

COMMENT ON FUNCTION call_fetch_switchbot_status() IS 'Triggers the fetch_switchbot_status Edge Function to record device status history every hour';

-- ---------------------------------------------------------------------------
-- 4. Update cron management functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_cron_job_schedule(p_job_name TEXT, p_schedule TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_command TEXT;
BEGIN
  v_command := CASE p_job_name
    WHEN 'fetch-x-posts' THEN 'SELECT call_fetch_x_posts();'
    WHEN 'fetch-calendar-events' THEN 'SELECT call_fetch_calendar_events();'
    WHEN 'fetch-gmail-messages' THEN 'SELECT call_fetch_gmail_messages();'
    WHEN 'send-task-notifications' THEN 'SELECT call_send_task_notifications();'
    WHEN 'automation-scheduler' THEN 'SELECT call_automation_scheduler();'
    WHEN 'slack-fetch-history' THEN 'SELECT call_slack_fetch_history();'
    WHEN 'fetch-rss' THEN 'SELECT call_fetch_rss();'
    WHEN 'fetch-switchbot-status' THEN 'SELECT call_fetch_switchbot_status();'
    ELSE NULL
  END;

  IF v_command IS NULL THEN
    RAISE EXCEPTION 'Invalid job name: %', p_job_name;
  END IF;

  PERFORM cron.unschedule(p_job_name);
  PERFORM cron.schedule(p_job_name, p_schedule, v_command);
END;
$$;

CREATE OR REPLACE FUNCTION get_cron_job_schedules()
RETURNS TABLE(job_name TEXT, schedule TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobname::TEXT, j.schedule::TEXT
  FROM cron.job j
  WHERE j.jobname IN (
    'fetch-x-posts',
    'fetch-calendar-events',
    'fetch-gmail-messages',
    'send-task-notifications',
    'automation-scheduler',
    'slack-fetch-history',
    'fetch-rss',
    'fetch-switchbot-status'
  )
  ORDER BY j.jobname;
END;
$$;
