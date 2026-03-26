-- Add sync_state to slack_integrations for tracking history backfill status
ALTER TABLE slack_integrations
  ADD COLUMN IF NOT EXISTS sync_state JSONB DEFAULT '{}'::jsonb;
