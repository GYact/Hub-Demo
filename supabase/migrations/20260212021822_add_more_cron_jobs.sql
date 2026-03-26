-- Add automation-scheduler, slack-fetch-history, and fetch-rss to cron schedule management

-- Update update_cron_job_schedule to include new jobs
CREATE OR REPLACE FUNCTION update_cron_job_schedule(p_job_name TEXT, p_schedule TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_command TEXT;
BEGIN
  -- Validate job name against allowlist
  v_command := CASE p_job_name
    WHEN 'fetch-x-posts' THEN 'SELECT call_fetch_x_posts();'
    WHEN 'fetch-calendar-events' THEN 'SELECT call_fetch_calendar_events();'
    WHEN 'fetch-gmail-messages' THEN 'SELECT call_fetch_gmail_messages();'
    WHEN 'send-task-notifications' THEN 'SELECT call_send_task_notifications();'
    WHEN 'automation-scheduler' THEN 'SELECT call_automation_scheduler();'
    WHEN 'slack-fetch-history' THEN 'SELECT call_slack_fetch_history();'
    WHEN 'fetch-rss' THEN 'SELECT call_fetch_rss();'
    ELSE NULL
  END;

  IF v_command IS NULL THEN
    RAISE EXCEPTION 'Invalid job name: %', p_job_name;
  END IF;

  -- Remove existing schedule and create new one
  PERFORM cron.unschedule(p_job_name);
  PERFORM cron.schedule(p_job_name, p_schedule, v_command);
END;
$$;

-- Update get_cron_job_schedules to include new jobs
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
    'fetch-rss'
  )
  ORDER BY j.jobname;
END;
$$;

-- Create Slack fetch history function
CREATE OR REPLACE FUNCTION call_slack_fetch_history()
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
    url := supabase_url || '/functions/v1/slack_fetch_history',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Create RSS fetch function
CREATE OR REPLACE FUNCTION call_fetch_rss()
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
    url := supabase_url || '/functions/v1/fetch_rss',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule Slack history fetch every 30 minutes
SELECT cron.schedule(
  'slack-fetch-history',
  '*/30 * * * *',
  'SELECT call_slack_fetch_history();'
);

-- Schedule RSS fetch every 6 hours
SELECT cron.schedule(
  'fetch-rss',
  '0 */6 * * *',
  'SELECT call_fetch_rss();'
);

COMMENT ON FUNCTION call_slack_fetch_history() IS 'Triggers the slack_fetch_history Edge Function to sync Slack messages';
COMMENT ON FUNCTION call_fetch_rss() IS 'Triggers the fetch_rss Edge Function to fetch RSS feeds';
