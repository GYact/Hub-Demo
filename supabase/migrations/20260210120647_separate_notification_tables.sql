-- =============================================================================
-- ai_notifications テーブル分離
-- calendar/gmail → 専用Google同期テーブル, slack/rss/x → media_feed_items
-- ai_notifications は automation/webhook/system のみに限定
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. google_calendar_events (Calendar dedup 専用)
-- ---------------------------------------------------------------------------
CREATE TABLE google_calendar_events (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id   TEXT NOT NULL,
  calendar_id   TEXT,
  calendar_name TEXT,
  summary       TEXT,
  start_time    TIMESTAMPTZ,
  end_time      TIMESTAMPTZ,
  location      TEXT,
  description   TEXT,
  html_link     TEXT,
  hangout_link  TEXT,
  status        TEXT,
  attendees     JSONB DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX idx_gce_user ON google_calendar_events(user_id);

ALTER TABLE google_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar events"
  ON google_calendar_events FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_google_calendar_events_updated_at ON google_calendar_events;
CREATE TRIGGER update_google_calendar_events_updated_at
  BEFORE UPDATE ON google_calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. google_gmail_messages (Gmail dedup + バッジ)
-- ---------------------------------------------------------------------------
CREATE TABLE google_gmail_messages (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id    TEXT NOT NULL,
  thread_id     TEXT,
  subject       TEXT,
  snippet       TEXT,
  sender        TEXT,
  recipient     TEXT,
  cc            TEXT,
  date          TIMESTAMPTZ,
  labels        TEXT[] DEFAULT '{}',
  is_unread     BOOLEAN DEFAULT false,
  is_starred    BOOLEAN DEFAULT false,
  is_read       BOOLEAN DEFAULT true,
  history_id    TEXT,
  size_estimate INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX idx_ggm_user ON google_gmail_messages(user_id);
CREATE INDEX idx_ggm_unread ON google_gmail_messages(user_id, is_read) WHERE is_read = false;

ALTER TABLE google_gmail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gmail messages"
  ON google_gmail_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own gmail messages"
  ON google_gmail_messages FOR UPDATE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE google_gmail_messages;

DROP TRIGGER IF EXISTS update_google_gmail_messages_updated_at ON google_gmail_messages;
CREATE TRIGGER update_google_gmail_messages_updated_at
  BEFORE UPDATE ON google_gmail_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. media_feed_items (slack/rss/x 統一テーブル)
-- ---------------------------------------------------------------------------
CREATE TABLE media_feed_items (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES ai_notification_categories(id) ON DELETE SET NULL,
  source      TEXT NOT NULL CHECK (source IN ('slack', 'rss', 'x')),
  priority    TEXT NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  title       TEXT NOT NULL,
  body        TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mfi_user_source ON media_feed_items(user_id, source);
CREATE INDEX idx_mfi_user_created ON media_feed_items(user_id, created_at DESC);
CREATE INDEX idx_mfi_unread ON media_feed_items(user_id, is_read) WHERE is_read = false;

ALTER TABLE media_feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media feed items"
  ON media_feed_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own media feed items"
  ON media_feed_items FOR UPDATE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE media_feed_items;

DROP TRIGGER IF EXISTS update_media_feed_items_updated_at ON media_feed_items;
CREATE TRIGGER update_media_feed_items_updated_at
  BEFORE UPDATE ON media_feed_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. データ移行: calendar → google_calendar_events
-- ---------------------------------------------------------------------------
INSERT INTO google_calendar_events (
  user_id, event_id, calendar_id, calendar_name, summary,
  start_time, end_time, location, description,
  html_link, hangout_link, status, attendees,
  created_at, updated_at
)
SELECT
  user_id,
  metadata->>'event_id',
  metadata->>'calendar_id',
  metadata->>'calendar_name',
  title,
  CASE
    WHEN metadata->>'start' ~ '^\d{4}-\d{2}-\d{2}' THEN (metadata->>'start')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN metadata->>'end' ~ '^\d{4}-\d{2}-\d{2}' THEN (metadata->>'end')::timestamptz
    ELSE NULL
  END,
  metadata->>'location',
  CASE
    WHEN body IS NOT NULL AND body != '' THEN body
    ELSE NULL
  END,
  metadata->>'html_link',
  metadata->>'hangout_link',
  metadata->>'status',
  COALESCE(metadata->'attendees', '[]'::jsonb),
  created_at,
  updated_at
FROM ai_notifications
WHERE source = 'calendar'
  AND metadata->>'event_id' IS NOT NULL
ON CONFLICT (user_id, event_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. データ移行: gmail → google_gmail_messages
-- ---------------------------------------------------------------------------
INSERT INTO google_gmail_messages (
  user_id, message_id, thread_id, subject, snippet,
  sender, recipient, cc, date,
  labels, is_unread, is_starred, is_read,
  history_id, size_estimate,
  created_at, updated_at
)
SELECT
  user_id,
  metadata->>'message_id',
  metadata->>'thread_id',
  title,
  body,
  metadata->>'from',
  metadata->>'to',
  metadata->>'cc',
  CASE
    WHEN created_at IS NOT NULL THEN created_at
    ELSE now()
  END,
  COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(metadata->'labels')),
    '{}'::text[]
  ),
  COALESCE((metadata->>'is_unread')::boolean, false),
  COALESCE((metadata->>'is_starred')::boolean, false),
  is_read,
  metadata->>'history_id',
  (metadata->>'size_estimate')::integer,
  created_at,
  updated_at
FROM ai_notifications
WHERE source = 'gmail'
  AND metadata->>'message_id' IS NOT NULL
ON CONFLICT (user_id, message_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. データ移行: slack/rss/x → media_feed_items
-- ---------------------------------------------------------------------------
INSERT INTO media_feed_items (
  id, user_id, category_id, source, priority,
  title, body, metadata, is_read,
  created_at, updated_at
)
SELECT
  id, user_id, category_id, source, priority,
  title, body, metadata, is_read,
  created_at, updated_at
FROM ai_notifications
WHERE source IN ('slack', 'rss', 'x')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. 旧データ削除 + CHECK制約更新
-- ---------------------------------------------------------------------------
DELETE FROM ai_notifications WHERE source IN ('calendar', 'gmail', 'slack', 'rss', 'x');

ALTER TABLE ai_notifications DROP CONSTRAINT IF EXISTS ai_notifications_source_check;
ALTER TABLE ai_notifications ADD CONSTRAINT ai_notifications_source_check
  CHECK (source = ANY (ARRAY['automation'::text, 'webhook'::text, 'system'::text]));
