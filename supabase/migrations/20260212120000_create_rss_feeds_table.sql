-- Create rss_feeds table
CREATE TABLE IF NOT EXISTS rss_feeds (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE rss_feeds ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own RSS feeds"
    ON rss_feeds FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own RSS feeds"
    ON rss_feeds FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own RSS feeds"
    ON rss_feeds FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own RSS feeds"
    ON rss_feeds FOR DELETE
    USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_rss_feeds_user_id ON rss_feeds(user_id);
CREATE INDEX idx_rss_feeds_is_active ON rss_feeds(user_id, is_active);
