CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.memory_vectors
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(768),
  ADD COLUMN IF NOT EXISTS raw_memory_id uuid REFERENCES public.raw_memories(id) ON DELETE CASCADE;

ALTER TABLE public.memory_vectors
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS memory_vectors_fts_idx ON public.memory_vectors USING gin (fts);
CREATE INDEX IF NOT EXISTS memory_vectors_embedding_idx ON public.memory_vectors USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memory_vectors_user_idx ON public.memory_vectors (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS memory_vectors_event_unique ON public.memory_vectors (structured_event_id) WHERE structured_event_id IS NOT NULL;

GRANT UPDATE ON public.memory_vectors TO authenticated;
DROP POLICY IF EXISTS "Users can update own vectors" ON public.memory_vectors;
CREATE POLICY "Users can update own vectors" ON public.memory_vectors FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.match_memories(
  _user_id uuid,
  _query_embedding extensions.vector(768) DEFAULT NULL,
  _query_text text DEFAULT '',
  _match_count int DEFAULT 8,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  structured_event_id uuid, raw_memory_id uuid, title text, summary text, content_text text,
  event_date timestamptz, captured_at timestamptz, source memory_source, media_url text, score double precision
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH scoped AS (
    SELECT mv.*, COALESCE(se.event_date, rm.captured_at, mv.created_at) AS effective_date
    FROM public.memory_vectors mv
    LEFT JOIN public.structured_events se ON se.id = mv.structured_event_id
    LEFT JOIN public.raw_memories rm ON rm.id = COALESCE(mv.raw_memory_id, se.raw_memory_id)
    WHERE mv.user_id = _user_id
  ),
  filtered AS (
    SELECT * FROM scoped
    WHERE (_date_from IS NULL OR effective_date >= _date_from)
      AND (_date_to   IS NULL OR effective_date <= _date_to)
  ),
  semantic AS (
    SELECT id, row_number() OVER (ORDER BY embedding <=> _query_embedding) AS rnk
    FROM filtered
    WHERE _query_embedding IS NOT NULL AND embedding IS NOT NULL
    ORDER BY embedding <=> _query_embedding
    LIMIT 40
  ),
  keyword AS (
    SELECT id, row_number() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', _query_text)) DESC) AS rnk
    FROM filtered
    WHERE length(trim(_query_text)) > 0 AND fts @@ websearch_to_tsquery('english', _query_text)
    ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', _query_text)) DESC
    LIMIT 40
  ),
  fused AS (
    SELECT COALESCE(s.id, k.id) AS id,
           COALESCE(1.0 / (60 + s.rnk), 0) + COALESCE(1.0 / (60 + k.rnk), 0) AS score
    FROM semantic s FULL OUTER JOIN keyword k ON k.id = s.id
  )
  SELECT f.structured_event_id, COALESCE(f.raw_memory_id, se.raw_memory_id), se.title, se.summary,
         f.content_text, se.event_date, rm.captured_at, rm.source, rm.media_url, fu.score::double precision
  FROM fused fu
  JOIN filtered f ON f.id = fu.id
  LEFT JOIN public.structured_events se ON se.id = f.structured_event_id
  LEFT JOIN public.raw_memories rm ON rm.id = COALESCE(f.raw_memory_id, se.raw_memory_id)
  ORDER BY fu.score DESC
  LIMIT _match_count;
$$;

REVOKE ALL ON FUNCTION public.match_memories(uuid, extensions.vector, text, int, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_memories(uuid, extensions.vector, text, int, timestamptz, timestamptz) TO service_role;

ALTER TABLE public.ingestion_queue
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_ingestion_batch(_limit int DEFAULT 20)
RETURNS SETOF public.ingestion_queue
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ingestion_queue
  SET status = 'failed', last_error = COALESCE(last_error, 'exceeded retry limit')
  WHERE attempts >= 5
    AND (status = 'queued' OR (status = 'processing' AND locked_at < now() - interval '5 minutes'));

  RETURN QUERY
  UPDATE public.ingestion_queue q
  SET status = 'processing', locked_at = now(), attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.ingestion_queue
    WHERE status = 'queued' OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
    ORDER BY created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ingestion_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ingestion_batch(int) TO service_role;

DROP POLICY IF EXISTS "memory-media read own" ON storage.objects;
CREATE POLICY "memory-media read own" ON storage.objects FOR SELECT
  USING (bucket_id = 'memory-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "memory-media insert own" ON storage.objects;
CREATE POLICY "memory-media insert own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'memory-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "memory-media delete own" ON storage.objects;
CREATE POLICY "memory-media delete own" ON storage.objects FOR DELETE
  USING (bucket_id = 'memory-media' AND auth.uid()::text = (storage.foldername(name))[1]);