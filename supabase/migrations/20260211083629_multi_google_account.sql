-- Multi Google Account Support Migration
-- Allows storing multiple Google account tokens per user

-- 1. Add google_email and is_primary columns to user_google_tokens
ALTER TABLE user_google_tokens ADD COLUMN IF NOT EXISTS google_email TEXT;
ALTER TABLE user_google_tokens ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- 2. Set existing data (single row: demo@hub-demo.com)
UPDATE user_google_tokens
SET google_email = 'demo@hub-demo.com', is_primary = true
WHERE google_email IS NULL;

-- 3. Change UNIQUE constraint from user_id to (user_id, google_email)
ALTER TABLE user_google_tokens DROP CONSTRAINT IF EXISTS user_google_tokens_user_id_key;
ALTER TABLE user_google_tokens ADD CONSTRAINT user_google_tokens_user_id_email_key
  UNIQUE (user_id, google_email);

-- 4. Make google_email NOT NULL now that existing data is updated
ALTER TABLE user_google_tokens ALTER COLUMN google_email SET NOT NULL;

-- 5. Add google_email to google_gmail_messages
ALTER TABLE google_gmail_messages ADD COLUMN IF NOT EXISTS google_email TEXT;

UPDATE google_gmail_messages SET google_email = (
  SELECT google_email FROM user_google_tokens
  WHERE user_google_tokens.user_id = google_gmail_messages.user_id
  AND is_primary = true
  LIMIT 1
)
WHERE google_email IS NULL;

-- Set default for any rows without a matching token
UPDATE google_gmail_messages SET google_email = 'demo@hub-demo.com'
WHERE google_email IS NULL;

ALTER TABLE google_gmail_messages ALTER COLUMN google_email SET NOT NULL;

-- Change PK to include google_email
ALTER TABLE google_gmail_messages DROP CONSTRAINT IF EXISTS google_gmail_messages_pkey;
ALTER TABLE google_gmail_messages ADD PRIMARY KEY (user_id, google_email, message_id);

-- 6. Add google_email to google_calendar_events
ALTER TABLE google_calendar_events ADD COLUMN IF NOT EXISTS google_email TEXT;

UPDATE google_calendar_events SET google_email = (
  SELECT google_email FROM user_google_tokens
  WHERE user_google_tokens.user_id = google_calendar_events.user_id
  AND is_primary = true
  LIMIT 1
)
WHERE google_email IS NULL;

UPDATE google_calendar_events SET google_email = 'demo@hub-demo.com'
WHERE google_email IS NULL;

ALTER TABLE google_calendar_events ALTER COLUMN google_email SET NOT NULL;

ALTER TABLE google_calendar_events DROP CONSTRAINT IF EXISTS google_calendar_events_pkey;
ALTER TABLE google_calendar_events ADD PRIMARY KEY (user_id, google_email, event_id);

-- 7. Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_google_tokens_user_email
  ON user_google_tokens(user_id, google_email);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_email
  ON google_gmail_messages(user_id, google_email);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_email
  ON google_calendar_events(user_id, google_email);
