-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to call the automation scheduler
CREATE OR REPLACE FUNCTION call_automation_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get environment variables from vault (if available) or use direct values
  -- Note: In production, these should be stored securely
  SELECT current_setting('app.settings.supabase_url', true) INTO supabase_url;
  SELECT current_setting('app.settings.service_role_key', true) INTO service_role_key;

  -- If not set via app settings, try to get from edge function URL pattern
  IF supabase_url IS NULL THEN
    -- Use the project's Supabase URL (this will be set during deployment)
    supabase_url := 'https://oxzzdkwvjdxpgdnrbflq.supabase.co';
  END IF;

  -- Make HTTP POST request to the automation scheduler
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/automation_scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule the automation scheduler to run every 5 minutes
-- This ensures timely execution of scheduled automations
SELECT cron.schedule(
  'automation-scheduler',
  '*/5 * * * *',  -- Every 5 minutes
  'SELECT call_automation_scheduler();'
);

-- Add a comment for documentation
COMMENT ON FUNCTION call_automation_scheduler() IS 'Triggers the automation scheduler Edge Function to process scheduled automations';
