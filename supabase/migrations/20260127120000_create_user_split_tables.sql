-- Split user settings into dedicated tables

-- Updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== data_catalog_items =====
CREATE TABLE IF NOT EXISTS data_catalog_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  link TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_catalog_items_user_id ON data_catalog_items(user_id);
CREATE INDEX IF NOT EXISTS idx_data_catalog_items_user_order ON data_catalog_items(user_id, order_index);

ALTER TABLE data_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own data catalog items" ON data_catalog_items;
DROP POLICY IF EXISTS "Users can insert own data catalog items" ON data_catalog_items;
DROP POLICY IF EXISTS "Users can update own data catalog items" ON data_catalog_items;
DROP POLICY IF EXISTS "Users can delete own data catalog items" ON data_catalog_items;

CREATE POLICY "Users can view own data catalog items"
  ON data_catalog_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data catalog items"
  ON data_catalog_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data catalog items"
  ON data_catalog_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own data catalog items"
  ON data_catalog_items FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_data_catalog_items_updated_at ON data_catalog_items;
CREATE TRIGGER update_data_catalog_items_updated_at
  BEFORE UPDATE ON data_catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===== devices =====
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own devices" ON devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON devices;
DROP POLICY IF EXISTS "Users can update own devices" ON devices;
DROP POLICY IF EXISTS "Users can delete own devices" ON devices;

CREATE POLICY "Users can view own devices"
  ON devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices"
  ON devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
  ON devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices"
  ON devices FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;
CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===== ai_shortcuts =====
CREATE TABLE IF NOT EXISTS ai_shortcuts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_shortcuts_user_id ON ai_shortcuts(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_shortcuts_user_order ON ai_shortcuts(user_id, order_index);

ALTER TABLE ai_shortcuts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai shortcuts" ON ai_shortcuts;
DROP POLICY IF EXISTS "Users can insert own ai shortcuts" ON ai_shortcuts;
DROP POLICY IF EXISTS "Users can update own ai shortcuts" ON ai_shortcuts;
DROP POLICY IF EXISTS "Users can delete own ai shortcuts" ON ai_shortcuts;

CREATE POLICY "Users can view own ai shortcuts"
  ON ai_shortcuts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai shortcuts"
  ON ai_shortcuts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai shortcuts"
  ON ai_shortcuts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai shortcuts"
  ON ai_shortcuts FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_ai_shortcuts_updated_at ON ai_shortcuts;
CREATE TRIGGER update_ai_shortcuts_updated_at
  BEFORE UPDATE ON ai_shortcuts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===== task_dividers =====
CREATE TABLE IF NOT EXISTS task_dividers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  list_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'rose',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_dividers_user_id ON task_dividers(user_id);
CREATE INDEX IF NOT EXISTS idx_task_dividers_list_id ON task_dividers(list_id);
CREATE INDEX IF NOT EXISTS idx_task_dividers_list_position ON task_dividers(list_id, position);

ALTER TABLE task_dividers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own task dividers" ON task_dividers;
DROP POLICY IF EXISTS "Users can insert own task dividers" ON task_dividers;
DROP POLICY IF EXISTS "Users can update own task dividers" ON task_dividers;
DROP POLICY IF EXISTS "Users can delete own task dividers" ON task_dividers;

CREATE POLICY "Users can view own task dividers"
  ON task_dividers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own task dividers"
  ON task_dividers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own task dividers"
  ON task_dividers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own task dividers"
  ON task_dividers FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_task_dividers_updated_at ON task_dividers;
CREATE TRIGGER update_task_dividers_updated_at
  BEFORE UPDATE ON task_dividers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===== memo_trash =====
CREATE TABLE IF NOT EXISTS memo_trash (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tab_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  original_tab_id TEXT NOT NULL,
  original_tab_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memo_trash_user_id ON memo_trash(user_id);
CREATE INDEX IF NOT EXISTS idx_memo_trash_tab_id ON memo_trash(tab_id);
CREATE INDEX IF NOT EXISTS idx_memo_trash_deleted_at ON memo_trash(deleted_at);

ALTER TABLE memo_trash ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own memo trash" ON memo_trash;
DROP POLICY IF EXISTS "Users can insert own memo trash" ON memo_trash;
DROP POLICY IF EXISTS "Users can update own memo trash" ON memo_trash;
DROP POLICY IF EXISTS "Users can delete own memo trash" ON memo_trash;

CREATE POLICY "Users can view own memo trash"
  ON memo_trash FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memo trash"
  ON memo_trash FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memo trash"
  ON memo_trash FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memo trash"
  ON memo_trash FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_memo_trash_updated_at ON memo_trash;
CREATE TRIGGER update_memo_trash_updated_at
  BEFORE UPDATE ON memo_trash
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
