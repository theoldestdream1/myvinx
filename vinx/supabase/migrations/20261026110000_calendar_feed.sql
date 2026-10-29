-- Calendar feed: a private, unguessable subscription link (like Google's "secret iCal address") so a
-- person's reminders show up in Apple/Google/Outlook calendar. The link is the credential; rotating it
-- makes the old one stop working.
CREATE TABLE IF NOT EXISTS public.calendar_feeds (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (token ~ '^[a-z0-9]{24,48}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;  -- no policies: only the server reads or writes it
REVOKE ALL ON public.calendar_feeds FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.calendar_feeds TO service_role;
