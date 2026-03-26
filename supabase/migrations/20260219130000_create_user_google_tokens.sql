-- ユーザーのGoogle OAuth refresh tokenをサーバー側で安全に保管するテーブル
CREATE TABLE IF NOT EXISTS user_google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT,
  sync_state JSONB DEFAULT '{}'::jsonb,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_google_tokens_user_id ON user_google_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_google_tokens_is_valid ON user_google_tokens(is_valid);

-- RLSを有効にするがポリシーは設けない (service_role keyのみアクセス可能)
ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_user_google_tokens_updated_at ON user_google_tokens;
CREATE TRIGGER update_user_google_tokens_updated_at
  BEFORE UPDATE ON user_google_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ai_notifications source CHECK 制約に x, calendar, gmail を追加
ALTER TABLE ai_notifications DROP CONSTRAINT IF EXISTS ai_notifications_source_check;
ALTER TABLE ai_notifications ADD CONSTRAINT ai_notifications_source_check
  CHECK (source = ANY (ARRAY[
    'webhook'::text, 'slack'::text, 'automation'::text, 'system'::text,
    'rss'::text, 'x'::text, 'calendar'::text, 'gmail'::text
  ]));
