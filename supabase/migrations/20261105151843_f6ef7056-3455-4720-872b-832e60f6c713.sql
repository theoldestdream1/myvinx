ALTER TABLE public.pending_intents
  ADD COLUMN IF NOT EXISTS nudge_count int NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vibrate_pattern text NOT NULL DEFAULT 'buzz';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_vibrate_pattern_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vibrate_pattern_check CHECK (vibrate_pattern IN ('buzz', 'pulse', 'off'));

CREATE OR REPLACE FUNCTION public.claim_stale_reminders(_limit int DEFAULT 100)
RETURNS TABLE (id uuid, user_id uuid, intent_text text, trigger_type text, trigger_value text, trigger_date timestamptz, timezone text, nudge_count int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH stale AS (
    SELECT i.id FROM public.pending_intents i JOIN public.profiles p ON p.id = i.user_id
    WHERE i.deleted_at IS NULL AND i.status = 'reminded'
      AND i.reminded_at IS NOT NULL AND i.reminded_at < now() - interval '30 minutes'
      AND i.nudge_count < 2 AND p.reminders_enabled
    ORDER BY i.reminded_at LIMIT _limit FOR UPDATE OF i SKIP LOCKED
  ), upd AS (
    UPDATE public.pending_intents i SET nudge_count = i.nudge_count + 1, reminded_at = now()
    FROM stale WHERE i.id = stale.id
    RETURNING i.id, i.user_id, i.intent_text, i.trigger_type, i.trigger_value, i.trigger_date, i.nudge_count
  )
  SELECT u.id, u.user_id, u.intent_text, u.trigger_type, u.trigger_value, u.trigger_date, COALESCE(p.timezone, 'UTC'), u.nudge_count
  FROM upd u JOIN public.profiles p ON p.id = u.user_id;
$$;
REVOKE ALL ON FUNCTION public.claim_stale_reminders(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_reminders(int) TO service_role;