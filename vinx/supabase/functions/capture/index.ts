import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { screenText, describeRemoved } from "../_shared/redact.ts";

// ---------------------------------------------------------------------------------------------
// The one door every "send this to V" integration uses: iOS Shortcuts (Siri, Back Tap, Action
// Button, share sheet), the browser extension, Zapier/Make, scripts. Authenticated with a device key
// from Settings. DESIGN RULE: saving never waits for AI. We write the raw memory, answer, and let
// process-memory do the understanding afterwards (voice notes are transcribed there too).
//
//   POST  Authorization: Bearer mm_...        (or header X-Vinx-Key)
//   JSON            { text?, url?, title?, image_base64?, audio_base64?, mime?, source?, client?, client_id? }
//   multipart/form  same fields, plus files named image | audio | file
//   raw body        Content-Type image/* | audio/* | text/plain, extras in the query string
//   -> 201 { ok: true, id, kind: "text" | "image" | "voice", duplicate?: true }
// ---------------------------------------------------------------------------------------------

const MAX_BODY_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // the storage bucket limit
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
const HOURLY_LIMIT = 120;
const ALLOWED_SOURCES = new Set(["manual", "notes", "browser", "email", "calendar", "voice", "image"]);

const env = (k: string) => Deno.env.get(k) || "";

function background(p: Promise<unknown>) {
  const safe = p.catch((e) => console.error("background task failed:", e instanceof Error ? e.message : e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(safe);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Parsed {
  text: string;
  url: string;
  title: string;
  source?: string;
  client: string;
  clientId: string;
  timestamp?: string;
  image?: { bytes: Uint8Array; mime: string };
  audio?: { bytes: Uint8Array; mime: string };
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/^data:[^,]+,/, "").replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

function assign(p: Parsed, f: Record<string, unknown>) {
  p.text ||= clean(f.text ?? f.content ?? f.note ?? f.body, MAX_TEXT_CHARS);
  p.url ||= clean(f.url ?? f.link, 2000);
  p.title ||= clean(f.title ?? f.subject, 300);
  p.source ||= clean(f.source, 20) || undefined;
  p.client ||= clean(f.client ?? f.app ?? f.platform, 40).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "");
  p.clientId ||= clean(f.client_id ?? f.clientId ?? f.id, 100);
  p.timestamp ||= clean(f.timestamp ?? f.captured_at, 40) || undefined;
}

const kindOf = (mime: string): "image" | "audio" | null =>
  mime.startsWith("image/") ? "image" : mime.startsWith("audio/") || mime === "video/mp4" || mime === "video/webm" ? "audio" : null;

async function parse(req: Request): Promise<Parsed | { error: string; status: number }> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return { error: "Request is too large", status: 413 };
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const url = new URL(req.url);
  const p: Parsed = { text: "", url: "", title: "", client: "", clientId: "" };
  assign(p, Object.fromEntries(url.searchParams)); // extras for raw-body requests

  if (ct.includes("application/json")) {
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== "object") return { error: "Body must be JSON", status: 400 };
    assign(p, b);
    const mime = clean((b as any).mime ?? (b as any).mime_type, 100).toLowerCase();
    if (typeof (b as any).image_base64 === "string") {
      const bytes = b64ToBytes((b as any).image_base64); if (!bytes) return { error: "image_base64 is not valid base64", status: 400 };
      p.image = { bytes, mime: mime.startsWith("image/") ? mime : "image/png" };
    }
    if (typeof (b as any).audio_base64 === "string") {
      const bytes = b64ToBytes((b as any).audio_base64); if (!bytes) return { error: "audio_base64 is not valid base64", status: 400 };
      p.audio = { bytes, mime: mime.startsWith("audio/") ? mime : "audio/mp4" };
    }
  } else if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData().catch(() => null);
    if (!form) return { error: "Could not read the form", status: 400 };
    const fields: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") { fields[k] = v; continue; }
      const mime = (v.type || "").toLowerCase();
      const kind = kindOf(mime) ?? (k === "image" ? "image" : k === "audio" ? "audio" : null);
      const bytes = new Uint8Array(await v.arrayBuffer());
      if (kind === "image" && !p.image) p.image = { bytes, mime: mime.startsWith("image/") ? mime : "image/png" };
      else if (kind === "audio" && !p.audio) p.audio = { bytes, mime: mime.startsWith("audio/") ? mime : "audio/mp4" };
    }
    assign(p, fields);
  } else if (kindOf(ct.split(";")[0])) {
    const bytes = new Uint8Array(await req.arrayBuffer());
    const mime = ct.split(";")[0].trim();
    if (kindOf(mime) === "image") p.image = { bytes, mime }; else p.audio = { bytes, mime };
  } else {
    // text/plain or anything else: the body is the note
    p.text ||= clean(await req.text().catch(() => ""), MAX_TEXT_CHARS);
  }
  return p;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "Access-Control-Allow-Headers": "authorization, content-type, x-vinx-key, x-client-info, apikey" } });
  if (req.method === "GET") return json({ ok: true, service: "Vinx capture", method: "POST to save" }); // harmless: lets people test the URL in a browser
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    // ---- who is this? ----
    const header = req.headers.get("authorization") || "";
    const key = (header.startsWith("Bearer ") ? header.slice(7) : req.headers.get("x-vinx-key") || "").trim();
    if (!key.startsWith("mm_")) return json({ error: "Missing or invalid device key. Create one in Vinx > Settings." }, 401);
    const supabase = adminClient();
    const { data: userId, error: authErr } = await supabase.rpc("validate_device_token", { _token_hash: await sha256Hex(key) });
    if (authErr || !userId) return json({ error: "Invalid or revoked device key" }, 401);

    const parsed = await parse(req);
    if ("error" in parsed) return json({ error: parsed.error }, parsed.status);
    const p = parsed;

    // ---- what is it? ----
    const kind: "text" | "image" | "voice" = p.image ? "image" : p.audio ? "voice" : "text";
    if (p.image && p.image.bytes.length > MAX_IMAGE_BYTES) return json({ error: "Image is over 10 MB" }, 413);
    if (p.audio && p.audio.bytes.length > MAX_AUDIO_BYTES) return json({ error: "Audio is over 20 MB" }, 413);
    let content = [p.title, p.text, p.url].filter(Boolean).join("\n");
    if (kind === "text" && !content) return json({ error: "Nothing to save. Send text, a url, an image or audio." }, 400);
    if ((p.image && p.image.bytes.length === 0) || (p.audio && p.audio.bytes.length === 0)) return json({ error: "The file was empty" }, 400);

    // ---- keep secrets out ----
    const removedNotes: string[] = [];
    if (content) {
      const s = screenText(content);
      if (s.skip) return json({ ok: true, skipped: "sensitive", message: `Not saved: it looks like ${describeRemoved(s.removed)}.` });
      content = s.text;
      removedNotes.push(...s.removed);
    }

    // ---- safe to repeat (flaky connections, double-tapped shortcuts) ----
    if (p.clientId) {
      const { error } = await supabase.from("channel_events").insert({ channel: `capture:${userId}`, event_id: p.clientId });
      if (error && (error as any).code === "23505") return json({ ok: true, duplicate: true });
    } else if (kind === "text") {
      const { data: same } = await supabase.from("raw_memories").select("id")
        .eq("user_id", userId).eq("raw_content", content).gte("created_at", new Date(Date.now() - 60_000).toISOString()).limit(1);
      if (same?.length) return json({ ok: true, duplicate: true, id: same[0].id });
    }

    // ---- bounded cost ----
    const { data: recent } = await supabase.from("raw_memories").select("id")
      .eq("user_id", userId).eq("metadata->>channel", "api").gte("created_at", new Date(Date.now() - 3600_000).toISOString()).limit(HOURLY_LIMIT + 1);
    if ((recent?.length ?? 0) >= HOURLY_LIMIT) return json({ error: "Hourly limit reached. Try again soon." }, 429);

    // ---- save: file first, then the row ----
    const meta: Record<string, unknown> = { channel: "api", client: p.client || "api" };
    if (p.url) meta.url = p.url;
    if (p.timestamp && !Number.isNaN(Date.parse(p.timestamp))) meta.client_timestamp = new Date(p.timestamp).toISOString();
    if (removedNotes.length) meta.redacted = removedNotes;

    let mediaPath: string | null = null;
    if (p.image) {
      const ext = (p.image.mime.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
      mediaPath = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("memory-media").upload(mediaPath, p.image.bytes, { contentType: p.image.mime, upsert: false });
      if (error) throw error;
    }
    if (p.audio) {
      const ext = (p.audio.mime.split("/")[1] || "m4a").replace(/[^a-z0-9]/g, "").slice(0, 5) || "m4a";
      const audioPath = `${userId}/audio-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("memory-media").upload(audioPath, p.audio.bytes, { contentType: p.audio.mime, upsert: false });
      if (error) throw error;
      meta.audio_path = audioPath; // transcribed in the background, then deleted
      meta.audio_mime = p.audio.mime;
    }

    const source = p.image ? "image" : p.audio ? "voice" : ALLOWED_SOURCES.has(p.source ?? "") && p.source !== "image" && p.source !== "voice" ? p.source! : "manual";
    const { data: row, error } = await supabase.from("raw_memories").insert([{
      user_id: userId,
      raw_content: content || (p.image ? "[Screenshot]" : "[Voice note]"),
      source,
      media_url: mediaPath,
      status: "pending",
      platform: "api",
      capture_type: p.image ? "screenshot" : p.audio ? "voice" : "manual",
      metadata: meta,
    }]).select().single();
    if (error || !row) {
      if (mediaPath) await supabase.storage.from("memory-media").remove([mediaPath]);
      if (meta.audio_path) await supabase.storage.from("memory-media").remove([meta.audio_path as string]);
      throw error ?? new Error("insert failed");
    }

    // ---- understand it afterwards; the cron sweeper retries if this is lost ----
    background(fetch(`${env("SUPABASE_URL")}/functions/v1/process-memory`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ memoryId: row.id }),
    }));

    return json({ ok: true, id: row.id, kind, ...(removedNotes.length ? { note: `Left out ${describeRemoved(removedNotes)}.` } : {}) }, 201);
  } catch (e) {
    console.error("capture error:", e instanceof Error ? e.message : e);
    return json({ error: "Could not save that. Please try again." }, 500);
  }
});
