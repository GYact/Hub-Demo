-- Health metrics from HealthKit / Apple Watch / iOS Shortcuts
CREATE TABLE IF NOT EXISTS health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  metric_type TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  source TEXT DEFAULT 'shortcuts',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, metric_type, recorded_at)
);

CREATE INDEX idx_health_metrics_user_type_date ON health_metrics (user_id, metric_type, recorded_at DESC);
CREATE INDEX idx_health_metrics_user_date ON health_metrics (user_id, recorded_at DESC);

CREATE TRIGGER set_health_metrics_updated_at
  BEFORE UPDATE ON health_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own health metrics" ON health_metrics
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own health metrics" ON health_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own health metrics" ON health_metrics
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own health metrics" ON health_metrics
  FOR DELETE USING (auth.uid() = user_id);
