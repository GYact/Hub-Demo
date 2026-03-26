-- Fix: media_feed_items に Slack メッセージの UNIQUE 制約がなかった
-- (旧 ai_notifications テーブルにのみ適用されていた)

-- 1. 既存の重複を削除（最古のレコードを残す）
DELETE FROM media_feed_items
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          user_id,
          metadata->>'team_id',
          metadata->>'channel_id',
          metadata->>'timestamp'
        ORDER BY created_at ASC
      ) as row_num
    FROM media_feed_items
    WHERE source = 'slack'
      AND metadata->>'timestamp' IS NOT NULL
      AND metadata->>'channel_id' IS NOT NULL
  ) ranked
  WHERE row_num > 1
);

-- 2. UNIQUE INDEX を追加して DB レベルで重複を防止
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_feed_slack_unique
  ON media_feed_items (user_id, (metadata->>'team_id'), (metadata->>'channel_id'), (metadata->>'timestamp'))
  WHERE source = 'slack' AND metadata->>'timestamp' IS NOT NULL;
