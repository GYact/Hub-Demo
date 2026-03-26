ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'invoice';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status = ANY (ARRAY['draft', 'issued', 'paid', 'overdue', 'cancelled', 'accepted', 'rejected', 'expired']));
