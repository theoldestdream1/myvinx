CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TYPE public.memory_source AS ENUM ('whatsapp','sms','email','calendar','notes','voice','image','browser','notification','manual');
CREATE TYPE public.memory_status AS ENUM ('pending','processing','processed','failed');
CREATE TYPE public.intent_status AS ENUM ('pending','reminded','resolved','expired');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT, avatar_url TEXT, timezone TEXT DEFAULT 'UTC',
  reminders_enabled boolean NOT NULL DEFAULT true,
  daily_brief_enabled boolean NOT NULL DEFAULT true,
  brief_hour smallint NOT NULL DEFAULT 8 CONSTRAINT profiles_brief_hour_range CHECK (brief_hour BETWEEN 0 AND 20),
  last_brief_sent_on date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
  RETURN new;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- raw_memories
CREATE TABLE public.raw_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source memory_source NOT NULL DEFAULT 'manual',
  raw_content TEXT NOT NULL,
  media_url TEXT,
  metadata JSONB DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status memory_status NOT NULL DEFAULT 'pending',
  platform text, app_package text, capture_type text,
  process_attempts int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_memories TO authenticated;
GRANT ALL ON public.raw_memories TO service_role;
ALTER TABLE public.raw_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own memories" ON public.raw_memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON public.raw_memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON public.raw_memories FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.raw_memories FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_raw_memories_user_id ON public.raw_memories(user_id);
CREATE INDEX idx_raw_memories_status ON public.raw_memories(status);
CREATE INDEX raw_memories_unprocessed_idx ON public.raw_memories (created_at) WHERE status IN ('pending','processing','failed');

-- entities
CREATE TABLE public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, entity_type TEXT NOT NULL,
  attributes JSONB DEFAULT '{}', mention_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name, entity_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own entities" ON public.entities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_entities_user_id ON public.entities(user_id);
CREATE INDEX idx_entities_type ON public.entities(entity_type);

-- structured_events
CREATE TABLE public.structured_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_memory_id UUID REFERENCES public.raw_memories(id) ON DELETE CASCADE,
  title TEXT NOT NULL, summary TEXT, event_date TIMESTAMPTZ, location TEXT,
  participants TEXT[], topics TEXT[],
  salience_score REAL DEFAULT 0.5, emotional_tone TEXT, confidence_score REAL DEFAULT 0.8,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.structured_events TO authenticated;
GRANT ALL ON public.structured_events TO service_role;
ALTER TABLE public.structured_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own events" ON public.structured_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_structured_events_user_id ON public.structured_events(user_id);
CREATE INDEX idx_structured_events_date ON public.structured_events(event_date);

-- entity_relationships
CREATE TABLE public.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_a_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  entity_b_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, strength REAL DEFAULT 1.0, context TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_a_id, entity_b_id, relationship_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_relationships TO authenticated;
GRANT ALL ON public.entity_relationships TO service_role;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own relationships" ON public.entity_relationships FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- pending_intents
CREATE TABLE public.pending_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_memory_id UUID REFERENCES public.raw_memories(id) ON DELETE CASCADE,
  structured_event_id UUID REFERENCES public.structured_events(id) ON DELETE SET NULL,
  intent_text TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT, trigger_date TIMESTAMPTZ,
  priority REAL DEFAULT 0.5,
  status intent_status NOT NULL DEFAULT 'pending',
  reminded_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_intents TO authenticated;
GRANT ALL ON public.pending_intents TO service_role;
ALTER TABLE public.pending_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own intents" ON public.pending_intents FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_pending_intents_user_id ON public.pending_intents(user_id);
CREATE INDEX idx_pending_intents_status ON public.pending_intents(status);
CREATE INDEX pending_intents_due_idx ON public.pending_intents (trigger_date) WHERE status = 'pending' AND trigger_date IS NOT NULL;

-- memory_vectors
CREATE TABLE public.memory_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  structured_event_id UUID REFERENCES public.structured_events(id) ON DELETE CASCADE,
  raw_memory_id uuid REFERENCES public.raw_memories(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL,
  embedding_text TEXT,
  embedding extensions.vector(768),
  embedding_model text,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content_text, ''))) STORED,
  platform text, app_package text, capture_type text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_vectors TO authenticated;
GRANT ALL ON public.memory_vectors TO service_role;
ALTER TABLE public.memory_vectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own vectors" ON public.memory_vectors FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX memory_vectors_fts_idx ON public.memory_vectors USING gin (fts);
CREATE INDEX memory_vectors_embedding_idx ON public.memory_vectors USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX memory_vectors_user_idx ON public.memory_vectors (user_id, created_at DESC);
CREATE UNIQUE INDEX memory_vectors_event_unique ON public.memory_vectors (structured_event_id) WHERE structured_event_id IS NOT NULL;
CREATE INDEX memory_vectors_filter_idx ON public.memory_vectors (user_id, platform, app_package, capture_type);

-- device_tokens
CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, token_hash text NOT NULL UNIQUE, token_prefix text NOT NULL,
  last_used_at timestamptz, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own device tokens" ON public.device_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own device tokens" ON public.device_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own device tokens" ON public.device_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validate_device_token(_token_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid;
BEGIN
  SELECT user_id INTO _user_id FROM public.device_tokens WHERE token_hash = _token_hash AND revoked_at IS NULL LIMIT 1;
  IF _user_id IS NOT NULL THEN
    UPDATE public.device_tokens SET last_used_at = now() WHERE token_hash = _token_hash;
  END IF;
  RETURN _user_id;
END; $$;
REVOKE ALL ON FUNCTION public.validate_device_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_device_token(text) TO service_role;

-- ingestion_queue
CREATE TABLE public.ingestion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_app text, capture_type text, platform text, app_package text,
  raw_content text NOT NULL, client_timestamp timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb, content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0, last_error text, locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ingestion_queue TO authenticated;
GRANT ALL ON public.ingestion_queue TO service_role;
ALTER TABLE public.ingestion_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own queue" ON public.ingestion_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ingestion_queue_worker_idx ON public.ingestion_queue (status, created_at);
CREATE INDEX ingestion_queue_dedup_idx ON public.ingestion_queue (user_id, content_hash, created_at);

CREATE OR REPLACE FUNCTION public.claim_ingestion_batch(_limit int DEFAULT 20) RETURNS SETOF public.ingestion_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ingestion_queue SET status = 'failed', last_error = COALESCE(last_error, 'exceeded retry limit')
  WHERE attempts >= 5 AND (status = 'queued' OR (status = 'processing' AND locked_at < now() - interval '5 minutes'));
  RETURN QUERY
  UPDATE public.ingestion_queue q SET status = 'processing', locked_at = now(), attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.ingestion_queue
    WHERE status = 'queued' OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
    ORDER BY created_at LIMIT _limit FOR UPDATE SKIP LOCKED
  ) RETURNING q.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_ingestion_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ingestion_batch(int) TO service_role;

-- push_subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz
);
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own push subscriptions" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own push subscriptions" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);

CREATE OR REPLACE FUNCTION public.register_push_subscription(_endpoint text, _p256dh text, _auth text, _user_agent text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _endpoint IS NULL OR length(_endpoint) = 0 OR _p256dh IS NULL OR _auth IS NULL THEN RAISE EXCEPTION 'invalid subscription'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text) TO authenticated;

-- channels
CREATE TABLE public.channel_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('telegram')),
  external_id text NOT NULL, display_name text,
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id), UNIQUE (user_id, channel)
);
REVOKE ALL ON public.channel_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.channel_links TO authenticated;
GRANT ALL ON public.channel_links TO service_role;
ALTER TABLE public.channel_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own channel links" ON public.channel_links FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own channel links" ON public.channel_links FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_channel_paused(_channel text, _paused boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.channel_links SET paused = _paused WHERE user_id = auth.uid() AND channel = _channel;
$$;
REVOKE ALL ON FUNCTION public.set_channel_paused(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_channel_paused(text, boolean) TO authenticated, service_role;

CREATE TABLE public.channel_link_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.channel_link_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.channel_link_codes TO service_role;
ALTER TABLE public.channel_link_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.channel_events (
  channel text NOT NULL, event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, event_id)
);
REVOKE ALL ON public.channel_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.channel_events TO service_role;
ALTER TABLE public.channel_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX channel_events_created_idx ON public.channel_events (created_at);

CREATE TABLE public.inbound_addresses (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE CHECK (alias ~ '^[a-z0-9]{10,32}$'),
  extra_senders text[] NOT NULL DEFAULT '{}' CHECK (cardinality(extra_senders) <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.inbound_addresses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inbound_addresses TO authenticated;
GRANT ALL ON public.inbound_addresses TO service_role;
ALTER TABLE public.inbound_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own inbound address" ON public.inbound_addresses FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.resolve_inbound_address(_alias text)
RETURNS TABLE (user_id uuid, account_email text, extra_senders text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT a.user_id, lower(u.email)::text, a.extra_senders
  FROM public.inbound_addresses a JOIN auth.users u ON u.id = a.user_id WHERE a.alias = lower(_alias)
$$;
REVOKE ALL ON FUNCTION public.resolve_inbound_address(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_inbound_address(text) TO service_role;

CREATE OR REPLACE FUNCTION public.account_email(_user_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT lower(email)::text FROM auth.users WHERE id = _user_id
$$;
REVOKE ALL ON FUNCTION public.account_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_email(uuid) TO service_role;

CREATE TABLE public.calendar_feeds (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (token ~ '^[a-z0-9]{24,48}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.calendar_feeds FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.calendar_feeds TO service_role;
ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;

-- reminders & briefs
CREATE OR REPLACE FUNCTION public.claim_due_intents(_limit int DEFAULT 100)
RETURNS TABLE (id uuid, user_id uuid, intent_text text, trigger_type text, trigger_value text, trigger_date timestamptz, timezone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT i.id FROM public.pending_intents i JOIN public.profiles p ON p.id = i.user_id
    WHERE i.status = 'pending' AND i.trigger_date IS NOT NULL
      AND i.trigger_date <= now() AND i.trigger_date > now() - interval '2 days' AND p.reminders_enabled
    ORDER BY i.trigger_date LIMIT _limit FOR UPDATE OF i SKIP LOCKED
  ), upd AS (
    UPDATE public.pending_intents i SET status = 'reminded', reminded_at = now()
    FROM due WHERE i.id = due.id
    RETURNING i.id, i.user_id, i.intent_text, i.trigger_type, i.trigger_value, i.trigger_date
  )
  SELECT u.id, u.user_id, u.intent_text, u.trigger_type, u.trigger_value, u.trigger_date, COALESCE(p.timezone, 'UTC')
  FROM upd u JOIN public.profiles p ON p.id = u.user_id;
$$;
REVOKE ALL ON FUNCTION public.claim_due_intents(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_intents(int) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_due_briefs(_limit int DEFAULT 50)
RETURNS TABLE (user_id uuid, timezone text, display_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH valid AS MATERIALIZED (
    SELECT p.id, p.timezone AS tz, p.brief_hour, p.last_brief_sent_on, p.display_name
    FROM public.profiles p JOIN pg_catalog.pg_timezone_names n ON n.name = p.timezone
    WHERE p.daily_brief_enabled AND (
      EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = p.id)
      OR EXISTS (SELECT 1 FROM public.channel_links c WHERE c.user_id = p.id AND NOT c.paused))
  ), due AS (
    SELECT v.id FROM valid v
    WHERE extract(hour FROM now() AT TIME ZONE v.tz) >= v.brief_hour
      AND extract(hour FROM now() AT TIME ZONE v.tz) < v.brief_hour + 4
      AND (v.last_brief_sent_on IS NULL OR v.last_brief_sent_on < (now() AT TIME ZONE v.tz)::date)
    LIMIT _limit
  ), locked AS (
    SELECT p.id FROM public.profiles p JOIN due ON due.id = p.id FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE public.profiles p SET last_brief_sent_on = (now() AT TIME ZONE p.timezone)::date
  FROM locked WHERE p.id = locked.id
  RETURNING p.id, p.timezone, p.display_name;
$$;
REVOKE ALL ON FUNCTION public.claim_due_briefs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_briefs(int) TO service_role;

CREATE OR REPLACE FUNCTION public.build_brief(_user_id uuid, _tz text, _seed text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tz_ok text := COALESCE((SELECT n.name FROM pg_catalog.pg_timezone_names n WHERE n.name = _tz LIMIT 1), 'UTC');
  _day_end timestamptz; _due jsonb; _upcoming int; _waiting int; _captured int; _resurfaced jsonb;
BEGIN
  _day_end := (date_trunc('day', now() AT TIME ZONE _tz_ok) + interval '1 day') AT TIME ZONE _tz_ok;
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.trigger_date), '[]'::jsonb) INTO _due FROM (
    SELECT id, intent_text, trigger_type, trigger_value, trigger_date, status FROM public.pending_intents
    WHERE user_id = _user_id AND status IN ('pending','reminded') AND trigger_date IS NOT NULL AND trigger_date < _day_end
    ORDER BY trigger_date LIMIT 10) d;
  SELECT count(*) INTO _upcoming FROM public.pending_intents
  WHERE user_id = _user_id AND status IN ('pending','reminded') AND trigger_date >= _day_end AND trigger_date < _day_end + interval '3 days';
  SELECT count(*) INTO _waiting FROM public.pending_intents WHERE user_id = _user_id AND status = 'pending' AND trigger_date IS NULL;
  SELECT count(*) INTO _captured FROM public.raw_memories WHERE user_id = _user_id AND created_at > now() - interval '7 days';
  SELECT jsonb_build_object('event_id', se.id, 'title', se.title, 'summary', se.summary, 'saved_at', se.created_at) INTO _resurfaced
  FROM public.structured_events se
  WHERE se.user_id = _user_id AND NOT COALESCE(se.is_private, false) AND COALESCE(se.salience_score, 0) >= 0.6
    AND se.created_at < now() - interval '14 days' AND se.created_at > now() - interval '120 days'
  ORDER BY md5(se.id::text || _seed) LIMIT 1;
  RETURN jsonb_build_object('due', _due, 'upcoming_count', _upcoming, 'waiting_count', _waiting, 'captured_7d', _captured, 'resurfaced', _resurfaced);
END; $$;
REVOKE ALL ON FUNCTION public.build_brief(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_brief(uuid, text, text) TO service_role;

-- search
CREATE OR REPLACE FUNCTION public.or_tsquery(_text text) RETURNS tsquery
LANGUAGE plpgsql IMMUTABLE SET client_min_messages = error SET search_path = public AS $$
DECLARE _t tsquery;
BEGIN
  IF _text IS NULL OR length(btrim(_text)) = 0 THEN RETURN NULL; END IF;
  _t := plainto_tsquery('english', _text);
  IF numnode(_t) = 0 THEN RETURN NULL; END IF;
  RETURN replace(_t::text, ' & ', ' | ')::tsquery;
END; $$;

CREATE OR REPLACE FUNCTION public.match_memories(
  _user_id uuid, _query_embedding extensions.vector(768) DEFAULT NULL, _query_text text DEFAULT '',
  _match_count int DEFAULT 8, _date_from timestamptz DEFAULT NULL, _date_to timestamptz DEFAULT NULL,
  _embedding_model text DEFAULT NULL
) RETURNS TABLE (
  structured_event_id uuid, raw_memory_id uuid, title text, summary text, content_text text,
  event_date timestamptz, captured_at timestamptz, source memory_source, media_url text, score double precision
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH q AS (SELECT public.or_tsquery(_query_text) AS tsq),
  scoped AS (
    SELECT mv.*, COALESCE(se.event_date, rm.captured_at, mv.created_at) AS effective_date
    FROM public.memory_vectors mv
    LEFT JOIN public.structured_events se ON se.id = mv.structured_event_id
    LEFT JOIN public.raw_memories rm ON rm.id = COALESCE(mv.raw_memory_id, se.raw_memory_id)
    WHERE mv.user_id = _user_id
  ), filtered AS (
    SELECT * FROM scoped WHERE (_date_from IS NULL OR effective_date >= _date_from) AND (_date_to IS NULL OR effective_date <= _date_to)
  ), semantic AS (
    SELECT id, row_number() OVER (ORDER BY embedding <=> _query_embedding) AS rnk FROM filtered
    WHERE _query_embedding IS NOT NULL AND embedding IS NOT NULL AND embedding_model IS NOT DISTINCT FROM _embedding_model
    ORDER BY embedding <=> _query_embedding LIMIT 40
  ), keyword AS (
    SELECT f.id, row_number() OVER (ORDER BY ts_rank_cd(f.fts, q.tsq) DESC) AS rnk FROM filtered f, q
    WHERE q.tsq IS NOT NULL AND f.fts @@ q.tsq ORDER BY ts_rank_cd(f.fts, q.tsq) DESC LIMIT 40
  ), fused AS (
    SELECT COALESCE(s.id, k.id) AS id, COALESCE(1.0 / (60 + s.rnk), 0) + COALESCE(1.0 / (60 + k.rnk), 0) AS score
    FROM semantic s FULL OUTER JOIN keyword k ON k.id = s.id
  )
  SELECT f.structured_event_id, COALESCE(f.raw_memory_id, se.raw_memory_id), se.title, se.summary, f.content_text,
         se.event_date, rm.captured_at, rm.source, rm.media_url, fu.score::double precision
  FROM fused fu JOIN filtered f ON f.id = fu.id
  LEFT JOIN public.structured_events se ON se.id = f.structured_event_id
  LEFT JOIN public.raw_memories rm ON rm.id = COALESCE(f.raw_memory_id, se.raw_memory_id)
  ORDER BY fu.score DESC LIMIT _match_count;
$$;
REVOKE ALL ON FUNCTION public.match_memories(uuid, extensions.vector, text, int, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_memories(uuid, extensions.vector, text, int, timestamptz, timestamptz, text) TO service_role;

CREATE OR REPLACE FUNCTION public.memory_search_stats(_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id),
    'processed', (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id AND status = 'processed'),
    'failed', (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id AND status = 'failed'),
    'waiting', (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id AND status IN ('pending','processing')),
    'screenshots', (SELECT count(*) FROM public.raw_memories WHERE user_id = _user_id AND media_url IS NOT NULL),
    'indexed', (SELECT count(*) FROM public.memory_vectors WHERE user_id = _user_id),
    'with_embedding', (SELECT count(*) FROM public.memory_vectors WHERE user_id = _user_id AND embedding IS NOT NULL),
    'embedding_models', COALESCE((SELECT jsonb_object_agg(COALESCE(m, 'unknown'), c) FROM (
        SELECT embedding_model AS m, count(*) AS c FROM public.memory_vectors
        WHERE user_id = _user_id AND embedding IS NOT NULL GROUP BY embedding_model) t), '{}'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.memory_search_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memory_search_stats(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_stuck_memories(_limit int DEFAULT 5) RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH picked AS (
    SELECT m.id FROM public.raw_memories m
    WHERE m.process_attempts < 4 AND (
      (m.status = 'pending' AND m.created_at < now() - interval '60 seconds'
        AND (m.last_attempt_at IS NULL OR m.last_attempt_at < now() - interval '2 minutes'))
      OR (m.status = 'processing' AND COALESCE(m.last_attempt_at, m.created_at) < now() - interval '5 minutes')
      OR (m.status = 'failed' AND COALESCE(m.last_attempt_at, m.created_at) < now() - interval '3 minutes'))
    ORDER BY m.created_at LIMIT _limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.raw_memories m SET process_attempts = m.process_attempts + 1, last_attempt_at = now(),
    status = CASE WHEN m.status = 'processing' THEN 'pending'::memory_status ELSE m.status END
  FROM picked WHERE m.id = picked.id RETURNING m.id;
$$;
REVOKE ALL ON FUNCTION public.claim_stuck_memories(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stuck_memories(int) TO service_role;

-- storage policies (bucket created separately)
CREATE POLICY "memory-media read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'memory-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "memory-media insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'memory-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "memory-media delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'memory-media' AND auth.uid()::text = (storage.foldername(name))[1]);