-- Add hp_post to automation_type CHECK constraint
ALTER TABLE ai_automations DROP CONSTRAINT IF EXISTS ai_automations_automation_type_check;
ALTER TABLE ai_automations ADD CONSTRAINT ai_automations_automation_type_check
  CHECK (automation_type IN ('paper_search', 'news_collection', 'custom', 'hp_post'));
