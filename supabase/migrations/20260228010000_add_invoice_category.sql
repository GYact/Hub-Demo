ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS category text;
