-- Cleanup duplicate indexes/constraints, add missing FKs/constraints, and add composite indexes

-- Normalize empty string references
UPDATE projects SET client_id = NULL WHERE client_id = '';
UPDATE project_tabs SET parent_project_id = NULL WHERE parent_project_id = '';

-- Fix task_dividers list_id type to match task_lists.id if still text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_dividers'
      AND column_name = 'list_id'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE task_dividers
      ALTER COLUMN list_id TYPE uuid USING list_id::uuid;
  END IF;
END $$;

-- Add foreign keys and constraints if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dividers_list_id_fkey'
  ) THEN
    ALTER TABLE task_dividers
      ADD CONSTRAINT task_dividers_list_id_fkey
      FOREIGN KEY (list_id) REFERENCES task_lists(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_tab_id_fkey'
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT clients_tab_id_fkey
      FOREIGN KEY (tab_id) REFERENCES client_tabs(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_client_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tabs_parent_project_id_fkey'
  ) THEN
    ALTER TABLE project_tabs
      ADD CONSTRAINT project_tabs_parent_project_id_fkey
      FOREIGN KEY (parent_project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_matches_id'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_user_id_matches_id CHECK (user_id = id);
  END IF;
END $$;

-- Drop duplicate constraints (backed by indexes)
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_user_id_key_unique;
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;

-- Drop duplicate indexes
DROP INDEX IF EXISTS ai_messages_session_id_idx;
DROP INDEX IF EXISTS ai_messages_user_id_idx;
DROP INDEX IF EXISTS ai_sessions_user_id_idx;
DROP INDEX IF EXISTS user_settings_user_id_idx;
DROP INDEX IF EXISTS user_settings_user_key_idx;

-- Composite indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_memo_tabs_user_order ON memo_tabs(user_id, order_index);
CREATE INDEX IF NOT EXISTS idx_memos_user_tab_order ON memos(user_id, tab_id, order_index);
CREATE INDEX IF NOT EXISTS idx_menu_items_user_order ON menu_items(user_id, order_index);
CREATE INDEX IF NOT EXISTS idx_task_dividers_user_list_position ON task_dividers(user_id, list_id, position);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date ON journal_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_client_tabs_user_order ON client_tabs(user_id, order_index);
CREATE INDEX IF NOT EXISTS idx_project_tabs_user_order ON project_tabs(user_id, order_index);
