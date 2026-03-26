-- Create a function to call the fetch_calendar_events Edge Function
CREATE OR REPLACE FUNCTION call_fetch_calendar_events()
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
    url := supabase_url || '/functions/v1/fetch_calendar_events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Create a function to call the fetch_gmail_messages Edge Function
CREATE OR REPLACE FUNCTION call_fetch_gmail_messages()
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
    url := supabase_url || '/functions/v1/fetch_gmail_messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule fetch_calendar_events every 15 minutes
SELECT cron.schedule(
  'fetch-calendar-events',
  '*/15 * * * *',
  'SELECT call_fetch_calendar_events();'
);

-- Schedule fetch_gmail_messages every 15 minutes
SELECT cron.schedule(
  'fetch-gmail-messages',
  '*/15 * * * *',
  'SELECT call_fetch_gmail_messages();'
);

COMMENT ON FUNCTION call_fetch_calendar_events() IS 'Triggers the fetch_calendar_events Edge Function to sync Google Calendar events';
COMMENT ON FUNCTION call_fetch_gmail_messages() IS 'Triggers the fetch_gmail_messages Edge Function to sync Gmail messages';
