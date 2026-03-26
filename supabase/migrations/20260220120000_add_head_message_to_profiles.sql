-- Add head_message field to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS head_message TEXT;
