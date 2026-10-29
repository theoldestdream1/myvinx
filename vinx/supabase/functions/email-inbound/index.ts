import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { screenText, describeRemoved } from "../_shared/redact.ts";
import { aliasFromRecipient, bareAddress, htmlToText, inboundDomain, senderAuthenticated } from "../_shared/email.ts";

// ---------------------------------------------------------------------------------------------
// Forward anything to your private Vinx address and it becomes a memory.
// Built for Postmark's inbound webhook (JSON). Other providers can be mapped to the same shape.
//   POST  https://<project>.supabase.co/functions/v1/email-inbound   with  Authorization: Basic base64(user:EMAIL_WEBHOOK_SECRET)
//         (Postmark: put https://vinx:SECRET@host/... as the inbound URL)  or header X-Webhook-Secret.
// Rules: the mail must (1) go to a live alias, (2) come from the owner's account address or a sender they
// approved, and (3) carry an SPF or DKIM pass. Anything else is dropped quietly with a 200, so a provider
// never retries it and a stranger learns nothing. Real failures return 500 so the provider retries.
// ---------------------------------------------------------------------------------------------

const MAX_BODY_BYTES = 35 * 1024 * 1024;
const MAX_TEXT = 20_000;
const MAX_IMAGE = 10 * 1024 * 1024;
const HOURLY_LIMIT = 60;
const env = (k: string) => Deno.env.get(k) || "";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function secretOk(req: Request): boolean {
  const expected = env("EMAIL_WEBHOOK_SECRET");
  if (!expected) return false;
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(h.slice(6).trim());
      return safeEqual(decoded.slice(decoded.indexOf(":") + 1), expected);
    } catch { return false; }
  }
  return safeEqual(req.headers.get("x-webhook-secret") || "", expected);
}

function background(p: Promise<unknown>) {
  const safe = p.catch((e) => console.error("background task failed:", e instanceof Error ? e.message : e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(safe);
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

/** Forwarded mail has "---------- Forwarded message ---------" noise and long quoted chains. Keep the useful part. */
function tidy(s: string): string {
  return s
    .replace(/^-{2,}\s*Forwarded message\s*-{2,}\s*$/gim, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

serve(async (req) => {
  if (req.method === "GET") return json({ ok: true, service: "Vinx email intake" });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!secretOk(req)) return json({ error: "Unauthorized" }, 401);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ ok: true, dropped: "too large" });

  try {
    const mail = await req.json().catch(() => null) as any;
    if (!mail || typeof mail !== "object") return json({ error: "Body must be JSON" }, 400);

    const domain = inboundDomain();
    const recipients: string[] = [
      ...(Array.isArray(mail.ToFull) ? mail.ToFull.map((t: any) => t?.Email) : []),
      mail.OriginalRecipient, mail.To,
    ].filter((x) => typeof x === "string");
    let alias: string | null = null;
    for (const r of recipients) for (const part of String(r).split(",")) { alias ||= aliasFromRecipient(part, domain); }
    if (!alias) return json({ ok: true, dropped: "no such address" });

    const supabase = adminClient();
    const { data: found } = await supabase.rpc("resolve_inbound_address", { _alias: alias });
    const owner = Array.isArray(found) ? found[0] : found;
    if (!owner?.user_id) return json({ ok: true, dropped: "no such address" });

    const from = bareAddress(String(mail.FromFull?.Email || mail.From || ""));
    const allowed = new Set<string>([owner.account_email, ...(owner.extra_senders ?? [])].filter(Boolean).map((s: string) => s.toLowerCase()));
    if (!from || !allowed.has(from)) return json({ ok: true, dropped: "sender not allowed" });
    if (!senderAuthenticated(mail.Headers)) return json({ ok: true, dropped: "sender not verified" });

    // the provider may deliver the same message more than once
    const messageId = String(mail.MessageID || "").slice(0, 200);
    if (messageId) {
      const { error } = await supabase.from("channel_events").insert({ channel: `email:${owner.user_id}`, event_id: messageId });
      if (error && (error as any).code === "23505") return json({ ok: true, duplicate: true });
    }

    const { data: recent } = await supabase.from("raw_memories").select("id")
      .eq("user_id", owner.user_id).eq("metadata->>channel", "email").gte("created_at", new Date(Date.now() - 3600_000).toISOString()).limit(HOURLY_LIMIT + 1);
    if ((recent?.length ?? 0) >= HOURLY_LIMIT) return json({ ok: true, dropped: "rate limited" });

    // ---- the text ----
    const subject = String(mail.Subject || "").trim().slice(0, 300);
    const rawBody = String(mail.TextBody || "").trim() || (mail.HtmlBody ? htmlToText(String(mail.HtmlBody)) : "");
    let content = tidy([subject, rawBody].filter(Boolean).join("\n\n")).slice(0, MAX_TEXT);

    const notes: string[] = [];
    if (content) {
      const s = screenText(content);
      if (s.skip) return json({ ok: true, dropped: "sensitive" });
      content = s.text;
      notes.push(...s.removed);
    }

    // ---- first picture attached (screenshots, photos of whiteboards) ----
    let mediaPath: string | null = null;
    let skippedFiles = 0;
    for (const a of Array.isArray(mail.Attachments) ? mail.Attachments : []) {
      const type = String(a?.ContentType || "").toLowerCase();
      if (!mediaPath && type.startsWith("image/") && typeof a.Content === "string") {
        const bytes = b64ToBytes(a.Content);
        if (bytes && bytes.length > 0 && bytes.length <= MAX_IMAGE) {
          const ext = (type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
          const path = `${owner.user_id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("memory-media").upload(path, bytes, { contentType: type, upsert: false });
          if (error) throw error;
          mediaPath = path;
          continue;
        }
      }
      skippedFiles++;
    }

    if (!content && !mediaPath) return json({ ok: true, dropped: "empty" });

    const { data: row, error } = await supabase.from("raw_memories").insert([{
      user_id: owner.user_id,
      raw_content: content || "[Screenshot]",
      source: mediaPath && !content ? "image" : "email",
      media_url: mediaPath,
      status: "pending",
      platform: "email",
      capture_type: mediaPath && !content ? "screenshot" : "email",
      metadata: { channel: "email", subject, from, ...(notes.length ? { redacted: notes } : {}), ...(skippedFiles ? { skipped_attachments: skippedFiles } : {}) },
    }]).select().single();
    if (error || !row) {
      if (mediaPath) await supabase.storage.from("memory-media").remove([mediaPath]);
      if (messageId) await supabase.from("channel_events").delete().eq("channel", `email:${owner.user_id}`).eq("event_id", messageId); // let the retry through
      throw error ?? new Error("insert failed");
    }

    background(fetch(`${env("SUPABASE_URL")}/functions/v1/process-memory`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ memoryId: row.id }),
    }));
    return json({ ok: true, id: row.id, ...(notes.length ? { note: `Left out ${describeRemoved(notes)}.` } : {}) }, 201);
  } catch (e) {
    console.error("email-inbound error:", e instanceof Error ? e.message : e);
    return json({ error: "Could not save that" }, 500);
  }
});
