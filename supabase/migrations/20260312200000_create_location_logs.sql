-- Location logs: periodic GPS tracking for journal auto-generation
CREATE TABLE IF NOT EXISTS location_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  name TEXT,                          -- reverse-geocoded place name (nullable, filled async)
  logged_at TIMESTAMPTZ NOT NULL,     -- when the position was captured
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE location_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own location_logs"
  ON location_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own location_logs"
  ON location_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own location_logs"
  ON location_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own location_logs"
  ON location_logs FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_location_logs_user_id ON location_logs(user_id);
CREATE INDEX idx_location_logs_user_date ON location_logs(user_id, logged_at);

CREATE TRIGGER update_location_logs_updated_at
  BEFORE UPDATE ON location_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE location_logs IS 'Periodic GPS location logs from browser geolocation API';
COMMENT ON COLUMN location_logs.name IS 'Reverse-geocoded place name (filled by client)';
COMMENT ON COLUMN location_logs.logged_at IS 'Timestamp when position was captured on device';
