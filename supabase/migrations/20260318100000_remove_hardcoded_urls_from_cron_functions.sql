-- ============================================
-- Remove all hardcoded Supabase URLs and JWT tokens from cron helper functions.
-- Uses a hub_settings table to store config values.
-- ============================================

-- 1) Create settings table
CREATE TABLE IF NOT EXISTS public.hub_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hub_settings ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write
CREATE POLICY "service_role_only" ON public.hub_settings
  FOR ALL USING (auth.role() = 'service_role');

-- Allow postgres role (used by cron) to read
GRANT SELECT ON public.hub_settings TO postgres;

-- Insert config values
INSERT INTO public.hub_settings (key, value) VALUES
  ('supabase_url', 'https://oxzzdkwvjdxpgdnrbflq.supabase.co'),
  ('supabase_anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqaHRudWlmYXpkb29teXZsd3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MTE0NTgsImV4cCI6MjA4MzE4NzQ1OH0.EXb14V6xMgAman9ZT7IGYDex_J3grLIE6krXic5lBGs')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 2) Helper to read settings
CREATE OR REPLACE FUNCTION get_hub_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT value FROM public.hub_settings WHERE key = p_key LIMIT 1;
$$;

-- 3) Recreate all cron helper functions without hardcoded URLs

CREATE OR REPLACE FUNCTION call_send_task_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send_task_notifications',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_automation_scheduler()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
  anon_key TEXT := get_hub_setting('supabase_anon_key');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/automation_scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_slack_fetch_history()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/slack_fetch_history',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_fetch_rss()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/fetch_rss',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_fetch_switchbot_status()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/fetch_switchbot_status',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_fetch_calendar_events()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/fetch_calendar_events',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_fetch_gmail_messages()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/fetch_gmail_messages',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_proactive_agent()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/proactive_agent',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION call_process_gmail_finance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process_gmail_finance',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

-- fetch_x_posts (with apikey + auth headers)
CREATE OR REPLACE FUNCTION call_fetch_x_posts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  supabase_url TEXT := get_hub_setting('supabase_url');
  anon_key TEXT := get_hub_setting('supabase_anon_key');
BEGIN
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/fetch_x_posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'Authorization', 'Bearer ' || anon_key
    ),
    body := '{}'::jsonb
  );
END;
$$;
