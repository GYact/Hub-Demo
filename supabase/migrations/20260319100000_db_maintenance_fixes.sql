-- DB maintenance fixes: duplicate index, missing RLS policies

-- 1. Drop duplicate IVFFlat index (337 MB savings)
-- idx_embeddings_vector (lists=10) was never used; planner uses document_embeddings_embedding_idx (lists=50)
DROP INDEX IF EXISTS idx_embeddings_vector;

-- 2. Add missing RLS policies for user_google_tokens
-- RLS was enabled but had 0 policies, causing frontend UPDATE (removeGoogleAccount) to silently fail
CREATE POLICY "Users can view own google tokens"
  ON user_google_tokens FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own google tokens"
  ON user_google_tokens FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
