-- lovable-cron-fallback-reviewed: user-designed minute-level reminder delivery and queue draining; briefs need local-hour window checks
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_brief_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brief_hour smallint NOT NULL DEFAULT 8
    CONSTRAINT profiles_brief_hour_range CHECK (brief_hour BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS last_brief_sent_on date;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users view own push subscriptions" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users delete own push subscriptions" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  _endpoint text, _p256dh text, _auth text, _user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _endpoint IS NULL OR length(_endpoint) = 0 OR _p256dh IS NULL OR _auth IS NULL THEN
    RAISE EXCEPTION 'invalid subscription';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text) TO authenticated;

CREATE INDEX IF NOT EXISTS pending_intents_due_idx ON public.pending_intents (trigger_date)
  WHERE status = 'pending' AND trigger_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_due_intents(_limit int DEFAULT 100)
RETURNS TABLE (id uuid, user_id uuid, intent_text text, trigger_type text, trigger_value text, trigger_date timestamptz, timezone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH due AS (
    SELECT i.id FROM public.pending_intents i
    JOIN public.profiles p ON p.id = i.user_id
    WHERE i.status = 'pending' AND i.trigger_date IS NOT NULL
      AND i.trigger_date <= now() AND i.trigger_date > now() - interval '2 days'
      AND p.reminders_enabled
    ORDER BY i.trigger_date LIMIT _limit
    FOR UPDATE OF i SKIP LOCKED
  ),
  upd AS (
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
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH valid AS MATERIALIZED (
    SELECT p.id, p.timezone AS tz, p.brief_hour, p.last_brief_sent_on, p.display_name
    FROM public.profiles p
    JOIN pg_catalog.pg_timezone_names n ON n.name = p.timezone
    WHERE p.daily_brief_enabled
      AND EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = p.id)
  ),
  due AS (
    SELECT v.id FROM valid v
    WHERE extract(hour FROM now() AT TIME ZONE v.tz) >= v.brief_hour
      AND extract(hour FROM now() AT TIME ZONE v.tz) <  v.brief_hour + 4
      AND (v.last_brief_sent_on IS NULL OR v.last_brief_sent_on < (now() AT TIME ZONE v.tz)::date)
    LIMIT _limit
  ),
  locked AS (
    SELECT p.id FROM public.profiles p JOIN due ON due.id = p.id FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE public.profiles p
  SET last_brief_sent_on = (now() AT TIME ZONE p.timezone)::date
  FROM locked WHERE p.id = locked.id
  RETURNING p.id, p.timezone, p.display_name;
$$;
REVOKE ALL ON FUNCTION public.claim_due_briefs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_briefs(int) TO service_role;

CREATE OR REPLACE FUNCTION public.build_brief(_user_id uuid, _tz text, _seed text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tz_ok text := COALESCE((SELECT n.name FROM pg_catalog.pg_timezone_names n WHERE n.name = _tz LIMIT 1), 'UTC');
  _day_end timestamptz; _due jsonb; _upcoming int; _waiting int; _captured int; _resurfaced jsonb;
BEGIN
  _day_end := (date_trunc('day', now() AT TIME ZONE _tz_ok) + interval '1 day') AT TIME ZONE _tz_ok;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.trigger_date), '[]'::jsonb) INTO _due
  FROM (
    SELECT id, intent_text, trigger_type, trigger_value, trigger_date, status
    FROM public.pending_intents
    WHERE user_id = _user_id AND status IN ('pending', 'reminded')
      AND trigger_date IS NOT NULL AND trigger_date < _day_end
    ORDER BY trigger_date LIMIT 10
  ) d;

  SELECT count(*) INTO _upcoming FROM public.pending_intents
  WHERE user_id = _user_id AND status IN ('pending', 'reminded')
    AND trigger_date >= _day_end AND trigger_date < _day_end + interval '3 days';

  SELECT count(*) INTO _waiting FROM public.pending_intents
  WHERE user_id = _user_id AND status = 'pending' AND trigger_date IS NULL;

  SELECT count(*) INTO _captured FROM public.raw_memories
  WHERE user_id = _user_id AND created_at > now() - interval '7 days';

  SELECT jsonb_build_object('event_id', se.id, 'title', se.title, 'summary', se.summary, 'saved_at', se.created_at)
  INTO _resurfaced
  FROM public.structured_events se
  WHERE se.user_id = _user_id AND NOT COALESCE(se.is_private, false)
    AND COALESCE(se.salience_score, 0) >= 0.6
    AND se.created_at < now() - interval '14 days' AND se.created_at > now() - interval '120 days'
  ORDER BY md5(se.id::text || _seed) LIMIT 1;

  RETURN jsonb_build_object('due', _due, 'upcoming_count', _upcoming, 'waiting_count', _waiting,
    'captured_7d', _captured, 'resurfaced', _resurfaced);
END;
$$;
REVOKE ALL ON FUNCTION public.build_brief(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_brief(uuid, text, text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(_name text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _url text; _secret text;
BEGIN
  SELECT decrypted_secret INTO _url    FROM vault.decrypted_secrets WHERE name = 'project_url'  LIMIT 1;
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'worker_secret' LIMIT 1;
  IF _url IS NULL OR _secret IS NULL THEN
    RAISE WARNING 'invoke_edge_function(%): Vault secrets project_url and/or worker_secret are not set', _name;
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url     := rtrim(_url, '/') || '/functions/v1/' || _name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', _secret),
    body    := _body
  );
END;
$$;
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
    WHERE jobname IN ('process-ingestion-queue', 'send-reminders', 'daily-brief', 'process-ingestion-queue-every-minute');
  PERFORM cron.schedule('process-ingestion-queue', '* * * * *',
    $job$ SELECT public.invoke_edge_function('process-ingestion-queue'); $job$);
  PERFORM cron.schedule('send-reminders', '* * * * *',
    $job$ SELECT public.invoke_edge_function('send-reminders'); $job$);
  PERFORM cron.schedule('daily-brief', '*/15 * * * *',
    $job$ SELECT public.invoke_edge_function('daily-brief', '{"mode":"cron"}'::jsonb); $job$);
END $$;