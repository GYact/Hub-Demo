-- Create menu_items table for sidebar menu items
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  path TEXT NOT NULL,
  icon TEXT NOT NULL,
  label TEXT NOT NULL,
  color_class TEXT NOT NULL DEFAULT 'text-slate-600',
  hover_class TEXT NOT NULL DEFAULT 'hover:bg-slate-100 hover:text-slate-800',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_user_id ON menu_items(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_order ON menu_items(order_index);

-- Create updated_at trigger
DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to manage their own menu items
CREATE POLICY "Users can manage their own menu items" ON menu_items
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
