-- Add body and attachment columns to google_gmail_messages
ALTER TABLE google_gmail_messages
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bcc TEXT,
  ADD COLUMN IF NOT EXISTS reply_to TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS body_fetched BOOLEAN DEFAULT false;

-- Partial index for backfill queries (only rows not yet fetched)
CREATE INDEX IF NOT EXISTS idx_gmail_body_not_fetched
  ON google_gmail_messages(user_id, google_email)
  WHERE body_fetched = false;
