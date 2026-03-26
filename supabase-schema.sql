-- Supabase Schema for AI Org Manager
-- Run this SQL in your Supabase SQL Editor

-- Create nodes table
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  type TEXT NOT NULL CHECK (type IN ('human', 'ai', 'item')),
  shape TEXT NOT NULL CHECK (shape IN ('circle', 'card', 'group')),
  description TEXT NOT NULL DEFAULT '',
  system_instruction TEXT,
  linked_to TEXT[] DEFAULT '{}',
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  group_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_shape ON nodes(shape);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_nodes_updated_at ON nodes;
CREATE TRIGGER update_nodes_updated_at
  BEFORE UPDATE ON nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your auth requirements)
-- Option 1: Allow all operations (for development/demo)
CREATE POLICY "Allow all operations on nodes" ON nodes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Option 2: If you want authenticated users only, uncomment below and comment above:
-- CREATE POLICY "Allow authenticated users" ON nodes
--   FOR ALL
--   TO authenticated
--   USING (true)
--   WITH CHECK (true);

-- ===== Frames Table =====

-- Create frames table
CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  label TEXT,
  color TEXT NOT NULL DEFAULT 'blue',
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 300,
  height REAL NOT NULL DEFAULT 200,
  linked_to TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_frames_color ON frames(color);

-- Create updated_at trigger for frames
DROP TRIGGER IF EXISTS update_frames_updated_at ON frames;
CREATE TRIGGER update_frames_updated_at
  BEFORE UPDATE ON frames
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE frames ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on frames" ON frames
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== Tools Table =====

-- Create tools table
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);

-- Create updated_at trigger for tools
DROP TRIGGER IF EXISTS update_tools_updated_at ON tools;
CREATE TRIGGER update_tools_updated_at
  BEFORE UPDATE ON tools
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on tools" ON tools
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== Memo Tabs Table =====

-- Create memo_tabs table
CREATE TABLE IF NOT EXISTS memo_tabs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'blue',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_memo_tabs_order ON memo_tabs(order_index);

-- Create updated_at trigger for memo_tabs
DROP TRIGGER IF EXISTS update_memo_tabs_updated_at ON memo_tabs;
CREATE TRIGGER update_memo_tabs_updated_at
  BEFORE UPDATE ON memo_tabs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE memo_tabs ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on memo_tabs" ON memo_tabs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== Memos Table =====

-- Create memos table
CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL REFERENCES memo_tabs(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_memos_tab ON memos(tab_id);
CREATE INDEX IF NOT EXISTS idx_memos_order ON memos(order_index);

-- Create updated_at trigger for memos
DROP TRIGGER IF EXISTS update_memos_updated_at ON memos;
CREATE TRIGGER update_memos_updated_at
  BEFORE UPDATE ON memos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on memos" ON memos
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== Project Tabs Table =====

-- Create project_tabs table
CREATE TABLE IF NOT EXISTS project_tabs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'blue',
  parent_project_id TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_project_tabs_order ON project_tabs(order_index);
CREATE INDEX IF NOT EXISTS idx_project_tabs_parent ON project_tabs(parent_project_id);

-- Create updated_at trigger for project_tabs
DROP TRIGGER IF EXISTS update_project_tabs_updated_at ON project_tabs;
CREATE TRIGGER update_project_tabs_updated_at
  BEFORE UPDATE ON project_tabs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE project_tabs ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on project_tabs" ON project_tabs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== Projects Table =====

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL REFERENCES project_tabs(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  client_id TEXT,
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15, 2),
  budgets JSONB,
  currency TEXT DEFAULT 'JPY',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_tab ON projects(tab_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_order ON projects(order_index);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);

-- Create updated_at trigger for projects
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on projects" ON projects
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== Push Subscriptions Table =====

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on push_subscriptions" ON push_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);
