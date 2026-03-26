-- Add url field to tools table
ALTER TABLE tools
ADD COLUMN IF NOT EXISTS url TEXT;

-- Create index for url field
CREATE INDEX IF NOT EXISTS idx_tools_url ON tools(url);
