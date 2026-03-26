-- Remove duplicate Slack notifications that were created before deduplication logic was added
-- Keep only the earliest record for each unique message (same team_id, channel_id, timestamp)

-- First, identify and delete duplicates, keeping the earliest created_at
DELETE FROM ai_notifications
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          user_id,
          source,
          metadata->>'team_id',
          metadata->>'channel_id',
          metadata->>'timestamp'
        ORDER BY created_at ASC
      ) as row_num
    FROM ai_notifications
    WHERE source = 'slack'
      AND metadata->>'timestamp' IS NOT NULL
      AND metadata->>'channel_id' IS NOT NULL
  ) ranked
  WHERE row_num > 1
);

-- Add a unique index to prevent future duplicates at the database level
-- This provides an extra layer of protection beyond the application-level check
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_notifications_slack_unique
  ON ai_notifications (user_id, (metadata->>'team_id'), (metadata->>'channel_id'), (metadata->>'timestamp'))
  WHERE source = 'slack' AND metadata->>'timestamp' IS NOT NULL;
