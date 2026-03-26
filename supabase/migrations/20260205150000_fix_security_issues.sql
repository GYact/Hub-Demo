-- Fix security issues: remove hardcoded keys and set search_path

-- 1. Update call_automation_scheduler to use Vault secrets instead of hardcoded key
CREATE OR REPLACE FUNCTION public.call_automation_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  supabase_url TEXT := 'https://oxzzdkwvjdxpgdnrbflq.supabase.co';
  anon_key TEXT;
BEGIN
  -- Try to get the key from Vault secrets
  SELECT decrypted_secret INTO anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_anon_key'
  LIMIT 1;

  -- Fallback: use project settings if Vault is not configured
  IF anon_key IS NULL THEN
    RAISE WARNING 'Vault secret "supabase_anon_key" not found. Please configure via Supabase Dashboard > Project Settings > Vault.';
    RETURN;
  END IF;

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

-- 2. Fix search_path for update_clients_updated_at
CREATE OR REPLACE FUNCTION public.update_clients_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 3. Fix search_path for update_user_preferences_updated_at
CREATE OR REPLACE FUNCTION public.update_user_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 4. Fix search_path for update_client_tabs_updated_at
CREATE OR REPLACE FUNCTION public.update_client_tabs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 5. Fix search_path for handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id)
  VALUES (NEW.id, NEW.id);
  RETURN NEW;
END;
$$;

-- 6. Fix search_path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Comment explaining Vault setup
COMMENT ON FUNCTION public.call_automation_scheduler() IS
'Calls the automation_scheduler Edge Function.
To configure:
1. Go to Supabase Dashboard > Project Settings > Vault
2. Add a new secret with name "supabase_anon_key" and your anon key as the value';
