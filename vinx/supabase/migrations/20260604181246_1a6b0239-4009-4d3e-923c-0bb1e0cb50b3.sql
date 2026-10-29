
ALTER TABLE public.raw_memories
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS app_package text,
  ADD COLUMN IF NOT EXISTS capture_type text;

UPDATE public.raw_memories
  SET platform = COALESCE(platform, 'web'),
      capture_type = COALESCE(capture_type, source::text);

ALTER TABLE public.memory_vectors
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS app_package text,
  ADD COLUMN IF NOT EXISTS capture_type text;

CREATE INDEX IF NOT EXISTS memory_vectors_filter_idx
  ON public.memory_vectors (user_id, platform, app_package, capture_type);

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own device tokens"
  ON public.device_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ingestion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_app text,
  capture_type text,
  platform text,
  app_package text,
  raw_content text NOT NULL,
  client_timestamp timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingestion_queue TO authenticated;
GRANT ALL ON public.ingestion_queue TO service_role;

CREATE INDEX IF NOT EXISTS ingestion_queue_worker_idx
  ON public.ingestion_queue (status, created_at);
CREATE INDEX IF NOT EXISTS ingestion_queue_dedup_idx
  ON public.ingestion_queue (user_id, content_hash, created_at);

ALTER TABLE public.ingestion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own queue"
  ON public.ingestion_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validate_device_token(_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  SELECT user_id INTO _user_id
  FROM public.device_tokens
  WHERE token_hash = _token_hash
    AND revoked_at IS NULL
  LIMIT 1;

  IF _user_id IS NOT NULL THEN
    UPDATE public.device_tokens
      SET last_used_at = now()
      WHERE token_hash = _token_hash;
  END IF;

  RETURN _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_device_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_device_token(text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
