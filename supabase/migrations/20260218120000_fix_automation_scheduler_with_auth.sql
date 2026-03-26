-- Fix the automation scheduler function to include anon key for authentication
-- The anon key is safe to include in the database as it has limited permissions
CREATE OR REPLACE FUNCTION call_automation_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT := 'https://oxzzdkwvjdxpgdnrbflq.supabase.co';
  anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqaHRudWlmYXpkb29teXZsd3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MTE0NTgsImV4cCI6MjA4MzE4NzQ1OH0.EXb14V6xMgAman9ZT7IGYDex_J3grLIE6krXic5lBGs';
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
