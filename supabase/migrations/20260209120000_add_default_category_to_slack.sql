-- Add default_category_id to slack_integrations
ALTER TABLE slack_integrations
ADD COLUMN IF NOT EXISTS default_category_id TEXT REFERENCES ai_notification_categories(id) ON DELETE SET NULL;

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_slack_integrations_default_category ON slack_integrations(default_category_id);
