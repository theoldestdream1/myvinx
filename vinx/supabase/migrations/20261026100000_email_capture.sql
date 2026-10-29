-- Email capture: every person gets a private address (e.g. k3x9...@in.example.com). Mail they send to it
-- from their own address becomes a memory. The address is an unguessable alias, never the account id.

CREATE TABLE IF NOT EXISTS public.inbound_addresses (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE CHECK (alias ~ '^[a-z0-9]{10,32}$'),
  extra_senders text[] NOT NULL DEFAULT '{}' CHECK (cardinality(extra_senders) <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inbound_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own inbound address" ON public.inbound_addresses;
CREATE POLICY "Users read own inbound address" ON public.inbound_addresses FOR SELECT USING (auth.uid() = user_id);
-- creating/rotating the alias and editing the allowed senders goes through the channel-link function
REVOKE ALL ON public.inbound_addresses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inbound_addresses TO authenticated;
GRANT ALL ON public.inbound_addresses TO service_role;

-- Server-only lookup: who owns this alias, and which sender addresses may use it?
CREATE OR REPLACE FUNCTION public.resolve_inbound_address(_alias text)
RETURNS TABLE (user_id uuid, account_email text, extra_senders text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT a.user_id, lower(u.email)::text, a.extra_senders
  FROM public.inbound_addresses a JOIN auth.users u ON u.id = a.user_id
  WHERE a.alias = lower(_alias)
$$;
REVOKE ALL ON FUNCTION public.resolve_inbound_address(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_inbound_address(text) TO service_role;

-- Server-only: the account email, used as the last-resort reminder channel
CREATE OR REPLACE FUNCTION public.account_email(_user_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT lower(email)::text FROM auth.users WHERE id = _user_id
$$;
REVOKE ALL ON FUNCTION public.account_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_email(uuid) TO service_role;
