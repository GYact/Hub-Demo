-- Create task_lists table
CREATE TABLE task_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  list_id UUID REFERENCES task_lists(id) ON DELETE CASCADE NOT NULL,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'needsAction' CHECK (status IN ('needsAction', 'completed')),
  due_date TIMESTAMPTZ,
  due_time TEXT, -- HH:mm format (e.g., "14:30")
  completed_at TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  is_starred BOOLEAN DEFAULT FALSE,
  repeat_type TEXT CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_lists
CREATE POLICY "Users can view own task lists"
  ON task_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own task lists"
  ON task_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own task lists"
  ON task_lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own task lists"
  ON task_lists FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for tasks
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_task_lists_user_id ON task_lists(user_id);
CREATE INDEX idx_task_lists_position ON task_lists(user_id, position);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_list_id ON tasks(list_id);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_tasks_position ON tasks(list_id, position);
CREATE INDEX idx_tasks_due_date ON tasks(user_id, due_date) WHERE status = 'needsAction' AND due_date IS NOT NULL;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_task_lists_updated_at
  BEFORE UPDATE ON task_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
