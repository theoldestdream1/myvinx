// The quick-capture API (Siri Shortcuts, extension, Zapier ...): REAL handler + REAL process-memory,
// mock AI gateway, in-memory database.
import { DB, removed } from "./fakedb.ts";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (extra && !ok ? "  :: " + extra : "")); if (!ok) fails++; };

Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("LOVABLE_API_KEY", "k");
Deno.env.set("AI_GATEWAY_URL", "http://localhost:8126/v1");
Deno.env.delete("GEMINI_API_KEY");

const logged: string[] = [];
for (const k of ["log", "error", "warn"] as const) { const o = console[k]; console[k] = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); o(...a); }; }

const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const reply = (c: string) => J({ choices: [{ message: { content: c } }] });
const G = { voiceText: "Remind me to call mum tomorrow at nine.", voiceFail: false, transcribeCalls: 0, visionCalls: 0, structureDelayMs: 0 };
const hashEmbed = (t: string) => { const v = new Array(768).fill(0); for (const w of t.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 768] += 1; } const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); };
Deno.serve({ port: 8126, onListen() {} }, async (req) => {
  const url = new URL(req.url); const body = await req.json();
  if (url.pathname === "/v1/embeddings") return J({ data: [{ embedding: hashEmbed(String(body.input)) }] });
  const sys: string = body.messages[0].content;
  if (sys.startsWith("You are a high-accuracy speech-to-text")) { G.transcribeCalls++; return G.voiceFail ? J({}, 500) : reply(G.voiceText); }
  if (sys.startsWith("You describe images")) { G.visionCalls++; return reply("VISIBLE TEXT: none\nDESCRIPTION: A whiteboard photo."); }
  if (sys.startsWith("You are a memory processing AI")) {
    if (G.structureDelayMs) await new Promise((r) => setTimeout(r, G.structureDelayMs));
    return reply(JSON.stringify({ structured_event: { title: "Note", summary: "s", event_date: null, location: null, participants: [], topics: [], salience_score: 0.5, emotional_tone: "neutral", is_private: false }, intent: { detected: false }, entities: [], relationships: [] }));
  }
  return J({}, 404);
});

const handlers: Record<string, (r: Request) => Promise<Response>> = {};
(globalThis as any).__handlers = handlers;
const realFetch = globalThis.fetch;
const fnCalls: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("http://supabase.test/functions/v1/")) { const name = url.split("/").pop()!; fnCalls.push(name); return handlers[name](new Request(url, init)); }
  return realFetch(input, init);
}) as typeof fetch;
const pending: Promise<unknown>[] = [];
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
const load = async (name: string) => { await import(`./fn/${name}/index.ts`); return (globalThis as any).__lastHandler as (r: Request) => Promise<Response>; };
handlers["process-memory"] = await load("process-memory");
const capture = await load("capture");

// device keys
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const KEY = "mm_testkey_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
DB.t.device_tokens.push({ id: "d1", user_id: "UA", token_hash: await sha(KEY), name: "iPhone" });
const REVOKED = "mm_revoked_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
DB.t.device_tokens.push({ id: "d2", user_id: "UA", token_hash: await sha(REVOKED), name: "old", revoked_at: new Date().toISOString() });

const call = (init: RequestInit & { key?: string | null; query?: string; headers?: Record<string, string> } = {}) => {
  const { key = KEY, query = "", headers = {}, ...rest } = init;
  return capture(new Request("http://x/capture" + query, { method: "POST", ...rest, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers } }));
};
const jsonBody = (o: unknown) => ({ body: JSON.stringify(o), headers: { "content-type": "application/json" } });
const mem = (user = "UA") => DB.t.raw_memories.filter((m) => m.user_id === user);
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

// ---------- auth ----------
check("GET is a harmless health check", (await capture(new Request("http://x/capture"))).status === 200);
check("no key -> 401", (await call({ key: null, ...jsonBody({ text: "x" }) })).status === 401);
check("wrong key -> 401", (await call({ key: "mm_nope", ...jsonBody({ text: "x" }) })).status === 401);
check("revoked key -> 401", (await call({ key: REVOKED, ...jsonBody({ text: "x" }) })).status === 401);
check("key in the query string is not accepted", (await call({ key: null, query: `?key=${KEY}`, ...jsonBody({ text: "x" }) })).status === 401);
check("nothing was saved by rejected calls", DB.t.raw_memories.length === 0);
check("X-Vinx-Key header works", (await call({ key: null, headers: { "x-vinx-key": KEY, "content-type": "application/json" }, body: JSON.stringify({ text: "via header" }) })).status === 201);
await settle();

// ---------- text ----------
let r = await call(jsonBody({ text: "Idea: weekly founder newsletter", client: "iOS Shortcut", source: "notes" }));
let b = await r.json();
let m = mem().find((x) => x.id === b.id)!;
check("text saved (201) for the key's owner", r.status === 201 && b.kind === "text" && m.user_id === "UA" && m.raw_content === "Idea: weekly founder newsletter");
check("recorded as an api capture with a cleaned client label", m.platform === "api" && m.metadata.channel === "api" && m.metadata.client === "ios-shortcut" && m.source === "notes");
await settle();
check("processed in the background afterwards", fnCalls.includes("process-memory") && m.status === "processed");
check("last_used_at updated on the key", !!DB.t.device_tokens[0].last_used_at);

r = await call(jsonBody({ title: "Great article", url: "https://example.com/a", text: "read later" })); b = await r.json(); await settle();
check("title + text + url are combined", mem().find((x) => x.id === b.id)!.raw_content === "Great article\nread later\nhttps://example.com/a");
r = await call({ body: "plain text body note", headers: { "content-type": "text/plain" } }); b = await r.json(); await settle();
check("a plain text body works", r.status === 201 && mem().find((x) => x.id === b.id)!.raw_content === "plain text body note");
r = await call({ body: "x=1", headers: { "content-type": "application/x-www-form-urlencoded" }, query: "?text=from+query" });
check("form-encoded + query params are understood (Zapier/Make style)", r.status === 201);
await settle();
r = await call(jsonBody({ text: "hello", source: "image" })); b = await r.json();
check("a source that doesn't match the content is ignored", mem().find((x) => x.id === b.id)!.source === "manual");
r = await call(jsonBody({ text: "from the browser", source: "browser" })); b = await r.json();
check("extension source honoured", mem().find((x) => x.id === b.id)!.source === "browser");
r = await call(jsonBody({ text: "hax", source: "'; drop table raw_memories;--" })); b = await r.json();
check("odd source values fall back safely", mem().find((x) => x.id === b.id)!.source === "manual");
await settle();

// ---------- idempotency ----------
const before = mem().length;
await call(jsonBody({ text: "once only", client_id: "abc-1" })); r = await call(jsonBody({ text: "once only", client_id: "abc-1" })); b = await r.json();
check("same client_id twice -> saved once", b.duplicate === true && mem().length === before + 1);
await call(jsonBody({ text: "double tap" })); r = await call(jsonBody({ text: "double tap" })); b = await r.json();
check("identical text within a minute -> saved once", b.duplicate === true && mem().filter((x) => x.raw_content === "double tap").length === 1);
await settle();

// ---------- sensitive ----------
const n1 = mem().length;
r = await call(jsonBody({ text: "Your verification code is 123456" })); b = await r.json();
check("one-time codes are refused (and the caller is told why)", b.skipped === "sensitive" && mem().length === n1, JSON.stringify(b));
r = await call(jsonBody({ text: "card 4242 4242 4242 4242 expires 12/30" })); b = await r.json();
check("card numbers are masked, with a note", r.status === 201 && mem().find((x) => x.id === b.id)!.raw_content.includes("[card number removed]") && /card number/.test(b.note));
await settle();

// ---------- images ----------
const fd = new FormData(); fd.set("image", new Blob([png], { type: "image/png" }), "shot.png"); fd.set("client", "ios-shortcut"); fd.set("text", "pricing page");
r = await call({ body: fd }); b = await r.json();
m = mem().find((x) => x.id === b.id)!;
check("multipart screenshot saved with its note", r.status === 201 && b.kind === "image" && m.source === "image" && m.capture_type === "screenshot" && m.raw_content === "pricing page" && /^UA\/.+\.png$/.test(m.media_url), JSON.stringify(m));
check("file stored in the user's private folder", DB.files.has(m.media_url));
await settle(); check("screenshot read by the vision model afterwards", G.visionCalls >= 1 && m.status === "processed");

r = await call({ body: png, headers: { "content-type": "image/png" }, query: "?client=back-tap" }); b = await r.json();
check("a raw image body works (Shortcuts 'File' request body)", r.status === 201 && mem().find((x) => x.id === b.id)!.raw_content === "[Screenshot]");
await settle();
r = await call(jsonBody({ image_base64: b64(png), mime: "image/jpeg", text: "base64 shot" })); b = await r.json();
check("base64 image in JSON works", r.status === 201 && mem().find((x) => x.id === b.id)!.media_url.endsWith(".jpg"));
await settle();
r = await call(jsonBody({ image_base64: "%%%not base64%%%" }));
check("bad base64 -> 400", r.status === 400);
r = await call({ body: new Uint8Array(11 * 1024 * 1024), headers: { "content-type": "image/png" } });
check("oversize image -> 413", r.status === 413);
r = await call({ body: new Uint8Array(0), headers: { "content-type": "image/png" } });
check("empty file -> 400", r.status === 400);
r = await call(jsonBody({}));
check("nothing to save -> 400", r.status === 400);

// ---------- voice: saved instantly, transcribed afterwards ----------
G.transcribeCalls = 0;
const fa = new FormData(); fa.set("audio", new Blob([new Uint8Array(3000)], { type: "audio/mp4" }), "note.m4a");
r = await call({ body: fa }); b = await r.json();
m = mem().find((x) => x.id === b.id)!;
check("voice note acknowledged BEFORE any transcription", r.status === 201 && b.kind === "voice" && G.transcribeCalls === 0 && m.raw_content === "[Voice note]" && m.status === "pending" && m.source === "voice");
const audioPath = m.metadata.audio_path;
check("recording held privately until transcribed", DB.files.has(audioPath) && m.media_url === null);
await settle();
check("then transcribed into the memory", G.transcribeCalls === 1 && m.raw_content === G.voiceText && m.metadata.transcribed === true && m.status === "processed", JSON.stringify(m));
check("recording deleted once the words are kept", !DB.files.has(audioPath) && removed.includes(audioPath) && !("audio_path" in m.metadata));

G.voiceText = "my otp is 482913 please";
const fo = new FormData(); fo.set("audio", new Blob([new Uint8Array(500)], { type: "audio/mp4" }));
r = await call({ body: fo }); b = await r.json(); await settle();
check("a spoken one-time code is never kept (memory and audio both removed)", !mem().some((x) => x.id === b.id), "");
G.voiceText = "Remind me to call mum tomorrow at nine."; G.voiceFail = true;
const ff = new FormData(); ff.set("audio", new Blob([new Uint8Array(500)], { type: "audio/mp4" }));
r = await call({ body: ff }); b = await r.json(); await settle();
m = mem().find((x) => x.id === b.id)!;
check("transcription outage: memory is marked failed (retried later), recording kept", m.status === "failed" && DB.files.has(m.metadata.audio_path));
G.voiceFail = false;
r = await handlers["process-memory"](new Request("http://x/", { method: "POST", headers: { Authorization: "Bearer service", "content-type": "application/json" }, body: JSON.stringify({ memoryId: m.id }) }));
check("the retry (cron sweeper) completes it", m.status === "processed" && m.raw_content === G.voiceText);

// ---------- the whole point: saving never waits for AI ----------
G.structureDelayMs = 700;
const t0 = performance.now();
r = await call(jsonBody({ text: "fast save please" }));
const ms = performance.now() - t0;
check(`save returns while AI is still thinking (${Math.round(ms)}ms with a 700ms AI)`, r.status === 201 && ms < 300, String(ms));
await settle(); G.structureDelayMs = 0;

// ---------- limits + hygiene ----------
for (let i = 0; i < 125; i++) DB.t.raw_memories.push({ id: `rl${i}`, user_id: "UA", platform: "api", metadata: { channel: "api" }, raw_content: "x", status: "processed", created_at: new Date().toISOString(), source: "manual" });
r = await call(jsonBody({ text: "over the limit" }));
check("hourly limit -> 429", r.status === 429);
DB.t.raw_memories = DB.t.raw_memories.filter((x) => !String(x.id).startsWith("rl"));
const o = await capture(new Request("http://x/capture", { method: "OPTIONS" }));
check("CORS preflight allows the key header", o.headers.get("access-control-allow-headers")!.includes("x-vinx-key"));
check("device keys never appear in logs", !logged.some((l) => l.includes(KEY)));
check("another user's data untouched", mem("UB").length === 0);

console.log(fails ? `\n${fails} FAILED` : "\nall capture tests passed");
Deno.exit(fails ? 1 : 0);
