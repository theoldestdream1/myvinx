import { p256 } from "npm:@noble/curves@1.8.2/p256";
import { sha256 } from "npm:@noble/hashes@1.7.2/sha256";

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Deterministic P-256 pair from an encrypted, high-entropy app-only seed. Never rotate on deploy. */
export function vapidKeys() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (publicKey && privateKey) return { publicKey, privateKey };
  const seed = Deno.env.get("VAPID_KEY_SEED");
  if (!seed) return null;
  const hash = sha256(new TextEncoder().encode(`vinx-web-push-v1:${seed}`));
  const value = BigInt(`0x${Array.from(hash, b => b.toString(16).padStart(2, "0")).join("")}`);
  const scalar = value % (p256.CURVE.n - 1n) + 1n;
  const bytes = Uint8Array.from(scalar.toString(16).padStart(64, "0").match(/../g) ?? [], h => parseInt(h, 16));
  return { publicKey: base64url(p256.getPublicKey(bytes, false)), privateKey: base64url(bytes) };
}