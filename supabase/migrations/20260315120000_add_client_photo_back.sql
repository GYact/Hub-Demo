-- Add back side photo storage path for business cards
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS photo_storage_path_back text;
