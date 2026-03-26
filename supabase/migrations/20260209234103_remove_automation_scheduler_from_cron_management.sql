-- Remove automation-scheduler from manageable cron jobs
-- automation-scheduler must stay fixed at */5 * * * * to avoid missing scheduled automations

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
    'fetch-gmail-messages'
  )
  ORDER BY j.jobname;
END;
$$;
