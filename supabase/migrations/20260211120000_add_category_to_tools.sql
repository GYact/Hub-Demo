-- Add category field to tools table
ALTER TABLE tools
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- Create index for category field
CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
