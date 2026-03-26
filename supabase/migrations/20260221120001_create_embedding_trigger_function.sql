-- Enable pg_net for async HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to call generate_embedding edge function via pg_net
CREATE OR REPLACE FUNCTION notify_embedding_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_type_val TEXT;
  source_id_val TEXT;
  content_val TEXT;
  metadata_val JSONB;
  edge_function_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Determine source type from trigger argument
  source_type_val := TG_ARGV[0];

  -- Build content based on source type
  CASE source_type_val
    WHEN 'memo' THEN
      source_id_val := NEW.id::TEXT;
      content_val := COALESCE(NEW.title, '') || ': ' || COALESCE(NEW.content, '');
      metadata_val := jsonb_build_object('title', NEW.title, 'tab_id', NEW.tab_id);
    WHEN 'journal' THEN
      source_id_val := NEW.id::TEXT;
      content_val := COALESCE(NEW.entry_date::TEXT, '') || ' ' || COALESCE(NEW.title, '') || ': ' || COALESCE(NEW.content, '');
      metadata_val := jsonb_build_object('title', NEW.title, 'entry_date', NEW.entry_date, 'mood', NEW.mood);
    WHEN 'gmail' THEN
      source_id_val := NEW.message_id;
      content_val := 'From:' || COALESCE(NEW.sender, '') || ' Subject:' || COALESCE(NEW.subject, '') || ' ' || COALESCE(NEW.body_text, COALESCE(NEW.snippet, ''));
      metadata_val := jsonb_build_object('subject', NEW.subject, 'sender', NEW.sender, 'date', NEW.date);
    WHEN 'task' THEN
      source_id_val := NEW.id::TEXT;
      content_val := COALESCE(NEW.title, '') || CASE WHEN NEW.due_date IS NOT NULL THEN ' (due:' || NEW.due_date::TEXT || ')' ELSE '' END || ': ' || COALESCE(NEW.notes, '');
      metadata_val := jsonb_build_object('title', NEW.title, 'status', NEW.status, 'due_date', NEW.due_date);
    WHEN 'media_feed' THEN
      source_id_val := NEW.id::TEXT;
      content_val := '[' || COALESCE(NEW.source, '') || '] ' || COALESCE(NEW.title, '') || ': ' || COALESCE(NEW.body, '');
      metadata_val := jsonb_build_object('title', NEW.title, 'source', NEW.source);
    WHEN 'project' THEN
      source_id_val := NEW.id::TEXT;
      content_val := COALESCE(NEW.name, '') || ': ' || COALESCE(NEW.description, '');
      metadata_val := jsonb_build_object('name', NEW.name, 'status', NEW.status);
    WHEN 'client' THEN
      source_id_val := NEW.id::TEXT;
      content_val := COALESCE(NEW.name, '') || ': ' || COALESCE(NEW.notes, '');
      metadata_val := jsonb_build_object('name', NEW.name, 'status', NEW.status);
    ELSE
      RETURN NEW;
  END CASE;

  -- Skip if content is empty
  IF TRIM(content_val) = '' OR TRIM(content_val) = ':' THEN
    RETURN NEW;
  END IF;

  -- Get edge function URL and service role key
  -- These must be set in Supabase Dashboard > Project Settings > Database > Custom Config
  -- Or via: ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
  -- And: ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
  edge_function_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);

  -- Skip if settings are not configured (graceful degradation)
  IF edge_function_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'app.settings.supabase_url or app.settings.service_role_key not set. Skipping embedding generation.';
    RETURN NEW;
  END IF;

  -- Call edge function via pg_net (async HTTP - does not block the transaction)
  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/generate_embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'source_type', source_type_val,
      'source_id', source_id_val,
      'content', content_val,
      'metadata', metadata_val,
      'user_id', NEW.user_id
    )
  );

  RETURN NEW;
END;
$$;

-- Create triggers for each source table
CREATE TRIGGER trg_memo_embedding
  AFTER INSERT OR UPDATE OF title, content ON memos
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('memo');

CREATE TRIGGER trg_journal_embedding
  AFTER INSERT OR UPDATE OF title, content ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('journal');

CREATE TRIGGER trg_gmail_embedding
  AFTER INSERT OR UPDATE OF subject, body_text ON google_gmail_messages
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('gmail');

CREATE TRIGGER trg_task_embedding
  AFTER INSERT OR UPDATE OF title, notes ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('task');

CREATE TRIGGER trg_media_feed_embedding
  AFTER INSERT OR UPDATE OF title, body ON media_feed_items
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('media_feed');

CREATE TRIGGER trg_project_embedding
  AFTER INSERT OR UPDATE OF name, description ON projects
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('project');

CREATE TRIGGER trg_client_embedding
  AFTER INSERT OR UPDATE OF name, notes ON clients
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('client');
