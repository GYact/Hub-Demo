-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Unified embedding storage table
CREATE TABLE document_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_text TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, source_type, source_id)
);

-- Indexes
CREATE INDEX idx_embeddings_user ON document_embeddings(user_id, source_type);
CREATE INDEX idx_embeddings_vector ON document_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- RLS
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own embeddings"
  ON document_embeddings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all embeddings"
  ON document_embeddings FOR ALL USING (true)
  WITH CHECK (true);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_user_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id TEXT,
  content_text TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.source_type,
    de.source_id,
    de.content_text,
    de.metadata,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM document_embeddings de
  WHERE de.user_id = match_user_id
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
