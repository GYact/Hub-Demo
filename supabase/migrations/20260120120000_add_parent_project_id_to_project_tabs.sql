-- Add parent project linkage for nested project workspaces
ALTER TABLE project_tabs
  ADD COLUMN IF NOT EXISTS parent_project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_project_tabs_parent ON project_tabs(parent_project_id);
