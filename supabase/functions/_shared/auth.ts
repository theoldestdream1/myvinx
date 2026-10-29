import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type Caller =
  | { kind: "service" } // another edge function / cron using the service-role key
  | { kind: "user"; userId: string };

/** Constant-time-ish string compare to avoid trivial timing leaks. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Identify the caller. Returns null when the request is not authenticated.
 * - Service-role bearer token  -> trusted internal caller
 * - Valid user JWT             -> that user
 */
export async function authenticate(req: Request): Promise<Caller | null> {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  if (safeEqual(token, SUPABASE_SERVICE_ROLE_KEY)) return { kind: "service" };

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return null;
  return { kind: "user", userId: data.user.id };
}

export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/** For the cron-triggered worker: shared secret header. */
export function hasWorkerSecret(req: Request): boolean {
  const expected = Deno.env.get("WORKER_SECRET");
  const got = req.headers.get("x-worker-secret") || "";
  return !!expected && safeEqual(got, expected);
}

/**
 * Cron jobs send a secret that lives only in the database vault, so it never has
 * to be copied between systems. Accept either the env secret or that vault secret.
 */
export async function isWorker(req: Request): Promise<boolean> {
  if (hasWorkerSecret(req)) return true;
  const got = req.headers.get("x-worker-secret") || "";
  if (got.length < 32) return false;
  const { data, error } = await adminClient().rpc("verify_cron_secret", { _secret: got });
  return !error && data === true;
}
