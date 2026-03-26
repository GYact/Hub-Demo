-- Add toggle_cron_job function and extend get_cron_job_schedules to return active status

-- Toggle cron job active status
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
    'fetch-switchbot-status'
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

-- Drop and recreate get_cron_job_schedules with active column
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
    'fetch-switchbot-status'
  )
  ORDER BY j.jobname;
END;
$$;

COMMENT ON FUNCTION get_cron_job_schedules() IS 'Returns current schedules for all managed cron jobs.';
