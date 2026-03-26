-- Add tax_included column to invoices (true = 内税, false/null = 外税)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_included BOOLEAN DEFAULT false;
