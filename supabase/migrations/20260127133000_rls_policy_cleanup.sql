-- Normalize RLS policies to authenticated-only per table

DO $$
DECLARE
  t text;
  r record;
  tables text[] := ARRAY[
    'affiliations',
    'ai_messages',
    'ai_sessions',
    'ai_shortcuts',
    'assets',
    'certifications',
    'client_tabs',
    'clients',
    'data_catalog_items',
    'devices',
    'educations',
    'frames',
    'journal_entries',
    'journals',
    'languages',
    'memo_tabs',
    'memo_trash',
    'memos',
    'menu_items',
    'nodes',
    'project_tabs',
    'projects',
    'push_subscriptions',
    'skills',
    'subscriptions',
    'task_dividers',
    'task_lists',
    'tasks',
    'tools',
    'user_preferences',
    'user_settings',
    'work_experiences'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      'Users can manage own ' || t,
      t
    );
  END LOOP;
END $$;

-- Profiles use id as the owner key
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;

  EXECUTE 'CREATE POLICY "Users can manage own profiles" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id)';
END $$;
