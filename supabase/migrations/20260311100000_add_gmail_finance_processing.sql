-- Gmail Finance Processing: columns + cron job + whitelist update

-- 1) Add finance tracking columns to google_gmail_messages
ALTER TABLE google_gmail_messages
  ADD COLUMN IF NOT EXISTS finance_processed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS finance_classification JSONB DEFAULT NULL;

COMMENT ON COLUMN google_gmail_messages.finance_processed IS 'Whether this message has been analyzed for invoices/expenses';
COMMENT ON COLUMN google_gmail_messages.finance_classification IS 'Gemini classification result: {type, confidence, ...}';

-- 2) Add source tracking columns to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_gmail_message_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_drive_file_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vendor TEXT DEFAULT NULL;

-- 3) Add source tracking columns to expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source_gmail_message_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_drive_file_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vendor TEXT DEFAULT NULL;

-- 4) Index for fast "unprocessed" lookup
CREATE INDEX IF NOT EXISTS idx_gmail_messages_finance_unprocessed
  ON google_gmail_messages (user_id, finance_processed)
  WHERE finance_processed = FALSE AND has_attachments = TRUE;

-- 5) SQL function to invoke the Edge Function
CREATE OR REPLACE FUNCTION call_process_gmail_finance()
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
    url := supabase_url || '/functions/v1/process_gmail_finance',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION call_process_gmail_finance() IS 'Triggers the process_gmail_finance Edge Function to classify Gmail messages and create invoice/expense records';

-- 6) Schedule every 15 minutes (offset from gmail fetch)
SELECT cron.schedule(
  'process-gmail-finance',
  '7,22,37,52 * * * *',
  'SELECT call_process_gmail_finance();'
);

-- 7) Update toggle_cron_job whitelist
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
    'proactive-agent',
    'process-gmail-finance'
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

-- 8) Update get_cron_job_schedules
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
    'proactive-agent',
    'process-gmail-finance'
  )
  ORDER BY j.jobname;
END;
$$;

COMMENT ON FUNCTION get_cron_job_schedules() IS 'Returns current schedules for all managed cron jobs.';
