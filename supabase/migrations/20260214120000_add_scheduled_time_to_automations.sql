-- Add scheduled_time column to ai_automations table
ALTER TABLE ai_automations ADD COLUMN IF NOT EXISTS scheduled_time TEXT;

-- Add comment explaining the format
COMMENT ON COLUMN ai_automations.scheduled_time IS 'Scheduled execution time in HH:MM format';
