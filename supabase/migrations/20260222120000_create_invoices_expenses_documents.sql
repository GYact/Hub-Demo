-- =============================================
-- invoices テーブル
-- =============================================
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT NOT NULL DEFAULT '',
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  issue_date DATE,
  due_date DATE,
  paid_date DATE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JPY',
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'cancelled')),
  pdf_storage_path TEXT,
  notes TEXT NOT NULL DEFAULT '',
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoices_user_status ON invoices(user_id, status);
CREATE INDEX idx_invoices_user_due_date ON invoices(user_id, due_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invoices"
  ON invoices FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- expenses テーブル
-- =============================================
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JPY',
  expense_date DATE,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('transport', 'food', 'supplies', 'software', 'hardware', 'communication', 'entertainment', 'education', 'other')),
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  receipt_storage_path TEXT,
  ocr_extracted JSONB DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expenses_user_category ON expenses(user_id, category);
CREATE INDEX idx_expenses_user_date ON expenses(user_id, expense_date);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own expenses"
  ON expenses FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- money_documents テーブル
-- =============================================
CREATE TABLE money_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT 'other'
    CHECK (document_type IN ('contract', 'receipt', 'report', 'other')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  storage_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  notes TEXT NOT NULL DEFAULT '',
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_money_documents_user ON money_documents(user_id);
CREATE INDEX idx_money_documents_tags ON money_documents USING GIN(tags);

ALTER TABLE money_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own money_documents"
  ON money_documents FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- Supabase Storage バケット: money-files
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('money-files', 'money-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own money files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'money-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can read own money files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'money-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can update own money files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'money-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can delete own money files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'money-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
