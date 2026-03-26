-- Add 'rss' to the ai_notifications source check constraint
ALTER TABLE ai_notifications DROP CONSTRAINT IF EXISTS ai_notifications_source_check;
ALTER TABLE ai_notifications ADD CONSTRAINT ai_notifications_source_check 
  CHECK (source = ANY (ARRAY['webhook'::text, 'slack'::text, 'automation'::text, 'system'::text, 'rss'::text]));
