-- Create storage bucket for Gmail attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('gmail-attachments', 'gmail-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Users can read their own attachments
CREATE POLICY "Users can read own gmail attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'gmail-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
