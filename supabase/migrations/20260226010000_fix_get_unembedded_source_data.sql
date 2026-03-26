-- Fix get_unembedded_source_data: restore correct table/column names
-- that were overwritten by 20260221120002 and 20260222130000 migrations.
--
-- Fixes:
--   journal: journals → journal_entries, j.date → j.entry_date, add j.title
--   task:    t.description → t.notes
--   media_feed: media_feeds → media_feed_items, content_snippet → body, source_type → source
--
-- Keeps: invoice, expense, money_document from 20260222130000

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

    WHEN 'invoice' THEN
      RETURN QUERY
        SELECT inv.id::TEXT,
          (COALESCE(inv.invoice_number, '') || ' ' || COALESCE(inv.notes, '') || ' ' || COALESCE(inv.amount::TEXT, ''))::TEXT,
          jsonb_build_object('invoice_number', inv.invoice_number, 'status', inv.status, 'amount', inv.amount, 'currency', inv.currency)
        FROM invoices inv
        WHERE inv.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = inv.id::TEXT AND de.source_type = 'invoice' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    WHEN 'expense' THEN
      RETURN QUERY
        SELECT exp.id::TEXT,
          (COALESCE(exp.title, '') || ' ' || COALESCE(exp.notes, '') || ' ' || COALESCE(exp.category, '') || ' ' || COALESCE(exp.amount::TEXT, ''))::TEXT,
          jsonb_build_object('title', exp.title, 'category', exp.category, 'amount', exp.amount, 'currency', exp.currency)
        FROM expenses exp
        WHERE exp.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = exp.id::TEXT AND de.source_type = 'expense' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    WHEN 'money_document' THEN
      RETURN QUERY
        SELECT md.id::TEXT,
          (COALESCE(md.title, '') || ' ' || COALESCE(md.notes, '') || ' ' || COALESCE(md.document_type, '') || ' ' || COALESCE(md.file_name, ''))::TEXT,
          jsonb_build_object('title', md.title, 'document_type', md.document_type, 'tags', md.tags)
        FROM money_documents md
        WHERE md.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM document_embeddings de
            WHERE de.source_id = md.id::TEXT AND de.source_type = 'money_document' AND de.user_id = p_user_id
          )
        LIMIT p_limit;

    ELSE
      RAISE EXCEPTION 'Unknown source_type: %', p_source_type;
  END CASE;
END;
$function$;
