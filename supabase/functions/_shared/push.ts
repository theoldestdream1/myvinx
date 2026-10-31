// Web Push (RFC 8030/8291/8292). We use web-push only to BUILD the encrypted request
// (pure crypto) and send it with fetch(), which avoids Node's https agent in the edge runtime.
import webpush from "npm:web-push@3.6.7";
import { vapidKeys } from "./vapid.ts";

const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@myvinx.tech";

export interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = "ok" | "gone" | "error";

export function pushConfigured(): boolean {
  return !!vapidKeys();
}

export async function sendPush(sub: PushSub, payload: unknown, ttlSeconds = 3600): Promise<PushResult> {
  const keys = vapidKeys();
  if (!keys) return "error";
  try {
    const details = webpush.generateRequestDetails(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      {
        TTL: ttlSeconds,
        urgency: "high",
        vapidDetails: { subject: VAPID_SUBJECT, ...keys },
      },
    );

    const headers = { ...(details.headers as Record<string, string>) };
    delete headers["Content-Length"]; // fetch computes it

    // Copy into a fresh ArrayBuffer-backed array (what fetch's BodyInit expects)
    const raw = details.body as Uint8Array;
    const body = new Uint8Array(new ArrayBuffer(raw.length));
    body.set(raw);

    const res = await fetch(details.endpoint, { method: details.method, headers, body });

    if (res.ok) return "ok"; // 201 Created
    // 404/410 = subscription expired or user revoked permission: delete it
    if (res.status === 404 || res.status === 410) return "gone";
    console.error("push rejected", res.status);
    return "error";
  } catch (e) {
    console.error("push send failed");
    return "error";
  }
}

/** Sends to every device; removes dead subscriptions via the provided callback. */
export async function sendToAll(
  subs: PushSub[],
  payload: unknown,
  onGone: (ids: string[]) => Promise<void>,
  ttlSeconds = 3600,
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.all(subs.map((s) => sendPush(s, payload, ttlSeconds)));
  const gone = subs.filter((_, i) => results[i] === "gone").map((s) => s.id);
  if (gone.length) await onGone(gone);
  return {
    sent: results.filter((r) => r === "ok").length,
    failed: results.filter((r) => r !== "ok").length,
  };
}
