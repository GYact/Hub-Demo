-- Fix RAG pipeline: table/column mismatches, delete triggers, gmail trigger scope

-- 1. Fix get_unembedded_source_data RPC function
--    - journal: journals → journal_entries, j.date → j.entry_date
--    - task: t.description → t.notes
--    - media_feed: media_feeds → media_feed_items, content_snippet → body
CREATE OR REPLACE FUNCTION get_unembedded_source_data(
  p_user_id UUID,
  p_source_type TEXT,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE(source_id TEXT, content_text TEXT, metadata JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '60s'
AS $function$
BEGIN
  CASE p_source_type
    WHEN 'memo' THEN
      RETURN QUERY
        SELECT m.id::TEXT,
          (COALESCE(m.title, '') || ' ' || COALESCE(m.content, ''))::TEXT,
          jsonb_build_object('title', m.title)
        FROM memos m
        WHERE m.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = m.id::TEXT AND de.source_type = 'memo' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    WHEN 'journal' THEN
      RETURN QUERY
        SELECT j.id::TEXT,
          (COALESCE(j.entry_date::TEXT, '') || ' ' || COALESCE(j.title, '') || ' ' || COALESCE(j.content, ''))::TEXT,
          jsonb_build_object('title', j.title, 'entry_date', j.entry_date)
        FROM journal_entries j
        WHERE j.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = j.id::TEXT AND de.source_type = 'journal' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    WHEN 'gmail' THEN
      RETURN QUERY
        SELECT DISTINCT ON (g.message_id) g.message_id::TEXT,
          ('From:' || COALESCE(g.sender, '') || ' Subject:' || COALESCE(g.subject, '') || ' ' || COALESCE(g.body_text, COALESCE(g.snippet, '')))::TEXT,
          jsonb_build_object('subject', g.subject, 'sender', g.sender, 'date', g.date)
        FROM google_gmail_messages g
        WHERE g.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = g.message_id AND de.source_type = 'gmail' AND de.user_id = p_user_id
          )
          AND (g.subject IS NOT NULL OR g.body_text IS NOT NULL OR g.snippet IS NOT NULL)
        ORDER BY g.message_id
        LIMIT p_limit;

    WHEN 'task' THEN
      RETURN QUERY
        SELECT t.id::TEXT,
          (COALESCE(t.title, '') || ' ' || COALESCE(t.notes, ''))::TEXT,
          jsonb_build_object('title', t.title, 'status', t.status)
        FROM tasks t
        WHERE t.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = t.id::TEXT AND de.source_type = 'task' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    WHEN 'media_feed' THEN
      RETURN QUERY
        SELECT mf.id::TEXT,
          ('[' || COALESCE(mf.source, '') || '] ' || COALESCE(mf.title, '') || ' ' || COALESCE(mf.body, ''))::TEXT,
          jsonb_build_object('title', mf.title, 'source', mf.source)
        FROM media_feed_items mf
        WHERE mf.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = mf.id::TEXT AND de.source_type = 'media_feed' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    WHEN 'project' THEN
      RETURN QUERY
        SELECT p.id::TEXT,
          (COALESCE(p.name, '') || ' ' || COALESCE(p.description, ''))::TEXT,
          jsonb_build_object('name', p.name)
        FROM projects p
        WHERE p.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = p.id::TEXT AND de.source_type = 'project' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    WHEN 'client' THEN
      RETURN QUERY
        SELECT c.id::TEXT,
          (COALESCE(c.name, '') || ' ' || COALESCE(c.company, '') || ' ' || COALESCE(c.notes, ''))::TEXT,
          jsonb_build_object('name', c.name, 'company', c.company)
        FROM clients c
        WHERE c.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = c.id::TEXT AND de.source_type = 'client' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    ELSE
      RAISE EXCEPTION 'Unknown source_type: %', p_source_type;
  END CASE;
END;
$function$;

-- 2. Fix Gmail trigger to include snippet column
DROP TRIGGER IF EXISTS trg_gmail_embedding ON google_gmail_messages;
CREATE TRIGGER trg_gmail_embedding
  AFTER INSERT OR UPDATE OF subject, body_text, snippet ON google_gmail_messages
  FOR EACH ROW EXECUTE FUNCTION notify_embedding_update('gmail');

-- 3. Delete triggers: clean up orphaned embeddings when source records are deleted
CREATE OR REPLACE FUNCTION delete_orphaned_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM document_embeddings
  WHERE user_id = OLD.user_id
    AND source_type = TG_ARGV[0]
    AND source_id = OLD.id::TEXT;
  RETURN OLD;
END;
$$;

-- Special version for gmail (uses message_id instead of id)
CREATE OR REPLACE FUNCTION delete_orphaned_gmail_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM document_embeddings
  WHERE user_id = OLD.user_id
    AND source_type = 'gmail'
    AND source_id = OLD.message_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_memo_embedding_delete
  AFTER DELETE ON memos
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_embedding('memo');

CREATE TRIGGER trg_journal_embedding_delete
  AFTER DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_embedding('journal');

CREATE TRIGGER trg_gmail_embedding_delete
  AFTER DELETE ON google_gmail_messages
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_gmail_embedding();

CREATE TRIGGER trg_task_embedding_delete
  AFTER DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_embedding('task');

CREATE TRIGGER trg_media_feed_embedding_delete
  AFTER DELETE ON media_feed_items
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_embedding('media_feed');

CREATE TRIGGER trg_project_embedding_delete
  AFTER DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_embedding('project');

CREATE TRIGGER trg_client_embedding_delete
  AFTER DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION delete_orphaned_embedding('client');
