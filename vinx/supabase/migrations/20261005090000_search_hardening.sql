-- =====================================================================
-- Search hardening
--  1. Keyword leg used websearch_to_tsquery, which ANDs every word. A natural
--     description ("black and white girl looking at a colorful ceiling") almost never
--     contains ALL of its words, so keyword search silently returned nothing.
--     It now matches ANY word and ranks documents by how many they contain.
--  2. Track which model produced each embedding. Vectors from different models are
--     not comparable, so search only compares like with like.
--  3. Deleting a memory now removes its events, reminders and search rows.
--  4. Stats for the in-app "search health" panel.
-- =====================================================================

-- ---------- 1. OR-style keyword matching --------------------------------
-- plainto_tsquery sanitizes arbitrary user text (never raises on punctuation) and
-- returns 'a' & 'b' & 'c'; swapping & for | gives "any of these words".
CREATE OR REPLACE FUNCTION public.or_tsquery(_text text)
RETURNS tsquery
LANGUAGE plpgsql
IMMUTABLE
SET client_min_messages = error  -- stopword-only input would otherwise log a NOTICE per search
AS $$
DECLARE
  _t tsquery;
BEGIN
  IF _text IS NULL OR length(btrim(_text)) = 0 THEN
    RETURN NULL;
  END IF;
  _t := plainto_tsquery('english', _text);
  IF numnode(_t) = 0 THEN   -- nothing but stopwords / punctuation
    RETURN NULL;
  END IF;
  RETURN replace(_t::text, ' & ', ' | ')::tsquery;
END;
$$;

-- ---------- 2. Embedding model tracking ----------------------------------
ALTER TABLE public.memory_vectors
  ADD COLUMN IF NOT EXISTS embedding_model text;

-- New signature (extra _embedding_model), so drop the old overload first.
DROP FUNCTION IF EXISTS public.match_memories(uuid, extensions.vector, text, int, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.match_memories(
  _user_id uuid,
  _query_embedding extensions.vector(768) DEFAULT NULL,
  _query_text text DEFAULT '',
  _match_count int DEFAULT 8,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _embedding_model text DEFAULT NULL
)
RETURNS TABLE (
  structured_event_id uuid,
  raw_memory_id uuid,
  title text,
  summary text,
  content_text text,
  event_date timestamptz,
  captured_at timestamptz,
  source memory_source,
  media_url text,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT public.or_tsquery(_query_text) AS tsq
  ),
  scoped AS (
    SELECT mv.*,
           COALESCE(se.event_date, rm.captured_at, mv.created_at) AS effective_date
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
    WHERE _query_embedding IS NOT NULL
      AND embedding IS NOT NULL
      AND embedding_model IS NOT DISTINCT FROM _embedding_model
    ORDER BY embedding <=> _query_embedding
    LIMIT 40
  ),
  keyword AS (
    SELECT f.id, row_number() OVER (ORDER BY ts_rank_cd(f.fts, q.tsq) DESC) AS rnk
    FROM filtered f, q
    WHERE q.tsq IS NOT NULL AND f.fts @@ q.tsq
    ORDER BY ts_rank_cd(f.fts, q.tsq) DESC
    LIMIT 40
  ),
  fused AS (
    SELECT COALESCE(s.id, k.id) AS id,
           COALESCE(1.0 / (60 + s.rnk), 0) + COALESCE(1.0 / (60 + k.rnk), 0) AS score
    FROM semantic s
    FULL OUTER JOIN keyword k ON k.id = s.id
  )
  SELECT f.structured_event_id,
         COALESCE(f.raw_memory_id, se.raw_memory_id),
         se.title,
         se.summary,
         f.content_text,
         se.event_date,
         rm.captured_at,
         rm.source,
         rm.media_url,
         fu.score::double precision
  FROM fused fu
  JOIN filtered f ON f.id = fu.id
  LEFT JOIN public.structured_events se ON se.id = f.structured_event_id
  LEFT JOIN public.raw_memories rm ON rm.id = COALESCE(f.raw_memory_id, se.raw_memory_id)
  ORDER BY fu.score DESC
  LIMIT _match_count;
$$;

REVOKE ALL ON FUNCTION public.match_memories(uuid, extensions.vector, text, int, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_memories(uuid, extensions.vector, text, int, timestamptz, timestamptz, text)
  TO service_role;

-- ---------- 3. Deleting a memory removes everything derived from it --------
DO $$
DECLARE
  _c text;
BEGIN
  FOR _c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'structured_events'
      AND con.contype = 'f' AND con.confrelid = 'public.raw_memories'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.structured_events DROP CONSTRAINT %I', _c);
  END LOOP;
  ALTER TABLE public.structured_events
    ADD CONSTRAINT structured_events_raw_memory_id_fkey
    FOREIGN KEY (raw_memory_id) REFERENCES public.raw_memories(id) ON DELETE CASCADE;

  FOR _c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'pending_intents'
      AND con.contype = 'f' AND con.confrelid = 'public.raw_memories'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.pending_intents DROP CONSTRAINT %I', _c);
  END LOOP;
  ALTER TABLE public.pending_intents
    ADD CONSTRAINT pending_intents_raw_memory_id_fkey
    FOREIGN KEY (raw_memory_id) REFERENCES public.raw_memories(id) ON DELETE CASCADE;
END $$;

-- ---------- 4. Search health stats ---------------------------------------
CREATE OR REPLACE FUNCTION public.memory_search_stats(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total',      (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id),
    'processed',  (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id AND status = 'processed'),
    'failed',     (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id AND status = 'failed'),
    'waiting',    (SELECT count(*) FROM public.raw_memories
                    WHERE user_id = _user_id AND status IN ('pending', 'processing')),
    'screenshots',(SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id AND media_url IS NOT NULL),
    'indexed',    (SELECT count(*) FROM public.memory_vectors WHERE user_id = _user_id),
    'with_embedding', (SELECT count(*) FROM public.memory_vectors WHERE user_id = _user_id AND embedding IS NOT NULL),
    'embedding_models', COALESCE((
      SELECT jsonb_object_agg(COALESCE(m, 'unknown'), c) FROM (
        SELECT embedding_model AS m, count(*) AS c
        FROM public.memory_vectors
        WHERE user_id = _user_id AND embedding IS NOT NULL
        GROUP BY embedding_model
      ) t), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.memory_search_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memory_search_stats(uuid) TO service_role;

-- ---------- 5. Make sure the screenshot bucket exists ----------------------
-- (An earlier migration was rewritten to keep only the policies, so create it here.
--  Wrapped so a restricted environment can't fail the whole migration.)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('memory-media', 'memory-media', false, 10485760,
          ARRAY['image/png','image/jpeg','image/webp','image/gif','image/heic'])
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create memory-media bucket here (%). Create it in Storage as a PRIVATE bucket.', SQLERRM;
END $$;

-- ---------- 6. Self-healing: never leave a memory stuck unprocessed ----------
-- Memories can get stranded (the tab closed mid-request, the AI had a hiccup). The cron worker
-- claims them here and re-runs processing. Failures are retried a few times, then left alone.
ALTER TABLE public.raw_memories
  ADD COLUMN IF NOT EXISTS process_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS raw_memories_unprocessed_idx
  ON public.raw_memories (created_at)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE OR REPLACE FUNCTION public.claim_stuck_memories(_limit int DEFAULT 5)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT m.id
    FROM public.raw_memories m
    WHERE m.process_attempts < 4
      AND (
        -- never started (client closed before/while calling process-memory)
        (m.status = 'pending'
          AND m.created_at < now() - interval '60 seconds'
          AND (m.last_attempt_at IS NULL OR m.last_attempt_at < now() - interval '2 minutes'))
        -- started but the worker died
        OR (m.status = 'processing'
          AND COALESCE(m.last_attempt_at, m.created_at) < now() - interval '5 minutes')
        -- failed: retry a few times with a pause
        OR (m.status = 'failed'
          AND COALESCE(m.last_attempt_at, m.created_at) < now() - interval '3 minutes')
      )
    ORDER BY m.created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.raw_memories m
  SET process_attempts = m.process_attempts + 1,
      last_attempt_at = now(),
      status = CASE WHEN m.status = 'processing' THEN 'pending'::memory_status ELSE m.status END
  FROM picked
  WHERE m.id = picked.id
  RETURNING m.id;
$$;

REVOKE ALL ON FUNCTION public.claim_stuck_memories(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stuck_memories(int) TO service_role;
