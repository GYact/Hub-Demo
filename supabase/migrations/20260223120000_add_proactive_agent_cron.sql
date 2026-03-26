-- Proactive Agent: pg_cron job + management functions update

-- Create SQL function to call the proactive_agent Edge Function
CREATE OR REPLACE FUNCTION call_proactive_agent()
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
    url := supabase_url || '/functions/v1/proactive_agent',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION call_proactive_agent() IS 'Triggers the proactive_agent Edge Function to analyze user data and generate insights';

-- Schedule every 30 minutes
SELECT cron.schedule(
  'proactive-agent',
  '*/30 * * * *',
  'SELECT call_proactive_agent();'
);

-- Update toggle_cron_job to include proactive-agent in whitelist
CREATE OR REPLACE FUNCTION toggle_cron_job(p_job_name TEXT, p_active BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF p_job_name NOT IN (
    'fetch-x-posts',
    'fetch-calendar-events',
    'fetch-gmail-messages',
    'send-task-notifications',
    'automation-scheduler',
    'slack-fetch-history',
    'fetch-rss',
    'fetch-switchbot-status',
    'proactive-agent'
  ) THEN
    RAISE EXCEPTION 'Invalid job name: %', p_job_name;
  END IF;

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = p_job_name;
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_name;
  END IF;

  PERFORM cron.alter_job(v_job_id, active := p_active);
END;
$$;

COMMENT ON FUNCTION toggle_cron_job(TEXT, BOOLEAN) IS 'Toggles a cron job active status. Only allows known job names.';

-- Update get_cron_job_schedules to include proactive-agent
DROP FUNCTION IF EXISTS get_cron_job_schedules();

CREATE FUNCTION get_cron_job_schedules()
RETURNS TABLE(job_name TEXT, schedule TEXT, active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobname::TEXT, j.schedule::TEXT, j.active
  FROM cron.job j
  WHERE j.jobname IN (
    'fetch-x-posts',
    'fetch-calendar-events',
    'fetch-gmail-messages',
    'send-task-notifications',
    'automation-scheduler',
    'slack-fetch-history',
    'fetch-rss',
    'fetch-switchbot-status',
    'proactive-agent'
  )
  ORDER BY j.jobname;
END;
$$;

COMMENT ON FUNCTION get_cron_job_schedules() IS 'Returns current schedules for all managed cron jobs.';
