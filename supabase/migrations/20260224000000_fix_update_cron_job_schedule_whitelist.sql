-- Fix update_cron_job_schedule to include fetch-switchbot-status and proactive-agent

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
    WHEN 'proactive-agent' THEN 'SELECT call_proactive_agent();'
    ELSE NULL
  END;

  IF v_command IS NULL THEN
    RAISE EXCEPTION 'Invalid job name: %', p_job_name;
  END IF;

  PERFORM cron.unschedule(p_job_name);
  PERFORM cron.schedule(p_job_name, p_schedule, v_command);
END;
$$;
