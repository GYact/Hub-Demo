-- Index for efficient DISTINCT ON (message_id) + NOT EXISTS queries in gmail embedding lookups
CREATE INDEX IF NOT EXISTS idx_gmail_user_message_id
  ON google_gmail_messages (user_id, message_id);

-- Function to find source data that hasn't been embedded yet
-- Used by backfill_embeddings Edge Function
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
          (COALESCE(j.date::TEXT, '') || ' ' || COALESCE(j.content, ''))::TEXT,
          jsonb_build_object('date', j.date)
        FROM journals j
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
          (COALESCE(t.title, '') || ' ' || COALESCE(t.description, ''))::TEXT,
          jsonb_build_object('title', t.title, 'status', t.status, 'priority', t.priority)
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
          (COALESCE(mf.title, '') || ' ' || COALESCE(mf.content_snippet, ''))::TEXT,
          jsonb_build_object('title', mf.title, 'source', mf.source_type, 'url', mf.url)
        FROM media_feeds mf
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
