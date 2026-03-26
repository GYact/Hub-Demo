ALTER TABLE projects ADD COLUMN IF NOT EXISTS budgets JSONB;

UPDATE projects
SET budgets = jsonb_build_array(budget)
WHERE budgets IS NULL
  AND budget IS NOT NULL;
