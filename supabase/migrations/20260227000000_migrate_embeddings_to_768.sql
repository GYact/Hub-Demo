-- Migrate document_embeddings from vector(1536) to vector(768)
-- Required for switching from OpenAI text-embedding-3-small to Gemini gemini-embedding-001

-- Step 1: Drop IVFFlat index (requires same dimensions)
DROP INDEX IF EXISTS idx_embeddings_vector;

-- Step 2: Truncate all existing embeddings (will be regenerated via backfill)
-- Old 1536-dim vectors are incompatible with new 768-dim model
TRUNCATE document_embeddings;

-- Step 3: Alter column dimension
ALTER TABLE document_embeddings
  ALTER COLUMN embedding TYPE vector(768)
  USING embedding::vector(768);

-- Step 4: Update match_documents function to use new dimensions
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
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

-- Step 5: Recreate IVFFlat index (will be built properly after backfill)
-- Using lists=1 for empty table; after backfill, recreate with appropriate lists count
CREATE INDEX idx_embeddings_vector ON document_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1);
