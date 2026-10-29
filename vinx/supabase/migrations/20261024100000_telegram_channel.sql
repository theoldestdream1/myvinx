-- Telegram capture channel: who is linked, one-time link codes, and a de-duplication log.

-- ---------- 1. Linked chat accounts ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('telegram')),
  external_id text NOT NULL,          -- Telegram user id (the same as the private chat id)
  display_name text,                  -- shown in Settings, e.g. "@ada"
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id),
  UNIQUE (user_id, channel)
);
ALTER TABLE public.channel_links ENABLE ROW LEVEL SECURITY;

-- People may see and remove their own links. They may NOT insert or edit: a link decides whose
-- account an incoming message is saved to, so only the server (after a one-time code) creates them.
DROP POLICY IF EXISTS "Users read own channel links" ON public.channel_links;
CREATE POLICY "Users read own channel links" ON public.channel_links FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own channel links" ON public.channel_links;
CREATE POLICY "Users delete own channel links" ON public.channel_links FOR DELETE USING (auth.uid() = user_id);
REVOKE ALL ON public.channel_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.channel_links TO authenticated;
GRANT ALL ON public.channel_links TO service_role;

CREATE OR REPLACE FUNCTION public.set_channel_paused(_channel text, _paused boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.channel_links SET paused = _paused WHERE user_id = auth.uid() AND channel = _channel;
$$;
REVOKE ALL ON FUNCTION public.set_channel_paused(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_channel_paused(text, boolean) TO authenticated, service_role;

-- ---------- 2. One-time link codes (stored hashed, 10 minute life) --------------------------
CREATE TABLE IF NOT EXISTS public.channel_link_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.channel_link_codes ENABLE ROW LEVEL SECURITY;  -- no policies: server only
REVOKE ALL ON public.channel_link_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.channel_link_codes TO service_role;

-- ---------- 3. Webhook de-duplication --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_events (
  channel text NOT NULL,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, event_id)
);
ALTER TABLE public.channel_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.channel_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.channel_events TO service_role;
CREATE INDEX IF NOT EXISTS channel_events_created_idx ON public.channel_events (created_at);

-- ---------- 4. Daily brief also reaches people who only use Telegram -------------------------
CREATE OR REPLACE FUNCTION public.claim_due_briefs(_limit int DEFAULT 50)
RETURNS TABLE (user_id uuid, timezone text, display_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH valid AS MATERIALIZED (
    SELECT p.id, p.timezone AS tz, p.brief_hour, p.last_brief_sent_on, p.display_name
    FROM public.profiles p
    JOIN pg_catalog.pg_timezone_names n ON n.name = p.timezone
    WHERE p.daily_brief_enabled
      AND (
        EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = p.id)
        OR EXISTS (SELECT 1 FROM public.channel_links c WHERE c.user_id = p.id AND NOT c.paused)
      )
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
