-- Link AI automations to org chart nodes
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS linked_automation_ids JSONB DEFAULT '[]';
ALTER TABLE ai_automations ADD COLUMN IF NOT EXISTS linked_node_id TEXT;
