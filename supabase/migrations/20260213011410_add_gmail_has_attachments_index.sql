CREATE INDEX IF NOT EXISTS idx_gmail_has_attachments
ON google_gmail_messages (user_id, google_email, date DESC)
WHERE has_attachments = true;
