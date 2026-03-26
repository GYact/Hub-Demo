-- Fix the automation scheduler function with correct Supabase URL
CREATE OR REPLACE FUNCTION call_automation_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
BEGIN
  supabase_url := 'https://oxzzdkwvjdxpgdnrbflq.supabase.co';

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/automation_scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;
