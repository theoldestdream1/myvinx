// Short-lived signed tokens that let a notification's Done / Snooze buttons act on ONE
// intent without the service worker holding the user's session.
//   token = <intentId>.<expiryUnixSeconds>.<base64url(HMAC-SHA256)>

const enc = new TextEncoder();

function secret(): string {
  const s = Deno.env.get("ACTION_SECRET") || Deno.env.get("WORKER_SECRET");
  if (!s) throw new Error("ACTION_SECRET or WORKER_SECRET must be set");
  return s;
}

async function hmacKey(usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signActionToken(intentId: string, ttlSeconds = 3 * 24 * 3600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = `${intentId}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey("sign"), enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

/** Returns the intent id if the token is authentic and unexpired, else null. */
export async function verifyActionToken(token: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [intentId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
    if (!/^[0-9a-f-]{36}$/i.test(intentId)) return null;
    const ok = await crypto.subtle.verify(
      "HMAC", await hmacKey("verify"), fromB64url(sig), enc.encode(`${intentId}.${expStr}`),
    );
    return ok ? intentId : null;
  } catch {
    return null;
  }
}
