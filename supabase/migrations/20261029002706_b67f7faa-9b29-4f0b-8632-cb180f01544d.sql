-- lovable-cron-fallback-reviewed: reminders fire at user-chosen minutes (needs 1-min cadence); stuck-memory rescue every 5 min matches its 2-5 min cool-downs; brief hourly fits its 4-hour window
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'worker_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'worker_secret');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    PERFORM vault.create_secret('https://lotrulidgneaeysgblok.supabase.co', 'project_url');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(_secret text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _expected text;
BEGIN
  SELECT decrypted_secret INTO _expected FROM vault.decrypted_secrets WHERE name = 'worker_secret' LIMIT 1;
  IF _expected IS NULL OR _secret IS NULL OR length(_secret) <> length(_expected) THEN RETURN false; END IF;
  RETURN digest(_secret, 'sha256') = digest(_expected, 'sha256');
END; $$;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(_name text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _url text; _secret text;
BEGIN
  SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'worker_secret' LIMIT 1;
  IF _url IS NULL OR _secret IS NULL THEN
    RAISE WARNING 'invoke_edge_function(%): vault secrets missing', _name;
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url := rtrim(_url, '/') || '/functions/v1/' || _name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', _secret),
    body := _body
  );
END; $$;
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('process-ingestion-queue','send-reminders','daily-brief');
  PERFORM cron.schedule('send-reminders', '* * * * *', $job$ SELECT public.invoke_edge_function('send-reminders'); $job$);
  PERFORM cron.schedule('process-ingestion-queue', '*/5 * * * *', $job$ SELECT public.invoke_edge_function('process-ingestion-queue'); $job$);
  PERFORM cron.schedule('daily-brief', '7 * * * *', $job$ SELECT public.invoke_edge_function('daily-brief', '{"mode":"cron"}'::jsonb); $job$);
END $$;