-- Add health_info JSONB column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS health_info JSONB DEFAULT '{}';

COMMENT ON COLUMN profiles.health_info IS 'Health information: date_of_birth, height_cm, weight_kg, blood_type, allergies, medical_notes';
