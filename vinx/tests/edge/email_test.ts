// Email capture (forward mail to your private address): REAL handler + REAL process-memory,
// mock AI gateway, in-memory database.
import { DB, removed } from "./fakedb.ts";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (extra && !ok ? "  :: " + extra : "")); if (!ok) fails++; };

Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("LOVABLE_API_KEY", "k");
Deno.env.set("AI_GATEWAY_URL", "http://localhost:8127/v1");
Deno.env.delete("GEMINI_API_KEY");
Deno.env.set("INBOUND_EMAIL_DOMAIN", "in.vinx.test");
Deno.env.set("EMAIL_WEBHOOK_SECRET", "whsec_test");

const logged: string[] = [];
for (const k of ["log", "error", "warn"] as const) { const o = console[k]; console[k] = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); o(...a); }; }

const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const reply = (c: string) => J({ choices: [{ message: { content: c } }] });
const G = { voiceText: "Remind me to call mum tomorrow at nine.", voiceFail: false, transcribeCalls: 0, visionCalls: 0, structureDelayMs: 0 };
const hashEmbed = (t: string) => { const v = new Array(768).fill(0); for (const w of t.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 768] += 1; } const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); };
Deno.serve({ port: 8127, onListen() {} }, async (req) => {
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
const resend: any[] = []; let resendFail = false;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://api.resend.com/emails") { const b = JSON.parse(init.body); resend.push({ auth: init.headers.Authorization, ...b }); return resendFail ? J({}, 500) : J({ id: "e1" }); }
  if (url.startsWith("http://supabase.test/functions/v1/")) { const name = url.split("/").pop()!; fnCalls.push(name); return handlers[name](new Request(url, init)); }
  return realFetch(input, init);
}) as typeof fetch;
const pending: Promise<unknown>[] = [];
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
const load = async (name: string) => { await import(`./fn/${name}/index.ts`); return (globalThis as any).__lastHandler as (r: Request) => Promise<Response>; };
handlers["process-memory"] = await load("process-memory");
const inbound = await load("email-inbound");
const link = await load("channel-link");

const asUser = (action: string, extra: Record<string, unknown> = {}, who = "user-A") =>
  link(new Request("http://x/channel-link", { method: "POST", headers: { Authorization: `Bearer ${who}`, "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) }));

// ---------- the address ----------
let r = await asUser("email_get"); let b = await r.json();
const ADDR: string = b.address;
check("each person gets a private address on the inbound domain", r.status === 200 && /^[a-z0-9]{14}@in\.vinx\.test$/.test(ADDR), JSON.stringify(b));
check("asking again returns the same address", (await (await asUser("email_get")).json()).address === ADDR);
check("other people get a different one", (await (await asUser("email_get", {}, "user-B")).json()).address !== ADDR);
check("the alias is not the user id", !ADDR.includes("UA"));
check("not signed in -> 401", (await asUser("email_get", {}, "nobody")).status === 401);
Deno.env.delete("INBOUND_EMAIL_DOMAIN");
check("no inbound domain configured -> says so", (await (await asUser("email_get")).json()).configured === false);
Deno.env.set("INBOUND_EMAIL_DOMAIN", "in.vinx.test");
check("bad extra sender rejected", (await asUser("email_add_sender", { email: "not an email" })).status === 400);
b = await (await asUser("email_add_sender", { email: "Work@Corp.com" })).json();
check("extra sender added (lowercased)", b.extra_senders.join() === "work@corp.com");
b = await (await asUser("email_add_sender", { email: "work@corp.com" })).json();
check("adding twice does not duplicate", b.extra_senders.length === 1);
for (const e of ["a@x.com", "b@x.com", "c@x.com", "d@x.com"]) await asUser("email_add_sender", { email: e });
check("at most 5 extra senders", (await asUser("email_add_sender", { email: "f@x.com" })).status === 400);
b = await (await asUser("email_remove_sender", { email: "a@x.com" })).json();
check("sender removed", !b.extra_senders.includes("a@x.com") && b.extra_senders.length === 4);

// ---------- inbound mail ----------
const ok = [{ Name: "Received-SPF", Value: "Pass (sender SPF authorized)" }];
const mail = (o: Record<string, unknown> = {}) => ({ FromFull: { Email: "ada@example.com" }, ToFull: [{ Email: ADDR }], Subject: "Idea", TextBody: "Weekly founder newsletter", MessageID: crypto.randomUUID(), Headers: ok, ...o });
const post = (o: unknown, headers: Record<string, string> = { Authorization: "Basic " + btoa("vinx:whsec_test") }) =>
  inbound(new Request("http://x/email-inbound", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(o) }));
const mem = (u = "UA") => DB.t.raw_memories.filter((m) => m.user_id === u);

check("GET is a health check", (await inbound(new Request("http://x/email-inbound"))).status === 200);
check("no secret -> 401", (await post(mail(), {})).status === 401);
check("wrong secret -> 401", (await post(mail(), { Authorization: "Basic " + btoa("vinx:nope") })).status === 401);
check("nothing saved by rejected calls", mem().length === 0);
check("header secret also works", (await post(mail({ MessageID: "h1" }), { "x-webhook-secret": "whsec_test" })).status === 201);
await settle();

r = await post(mail({ Subject: "Pricing idea", TextBody: "Charge $15/month for the pro plan" })); b = await r.json(); await settle();
let m = mem().find((x) => x.id === b.id)!;
check("forwarded mail becomes a memory for the owner", r.status === 201 && m.user_id === "UA" && m.raw_content === "Pricing idea\n\nCharge $15/month for the pro plan" && m.source === "email" && m.platform === "email", JSON.stringify(m));
check("subject and sender recorded; processed afterwards", m.metadata.subject === "Pricing idea" && m.metadata.from === "ada@example.com" && m.status === "processed");

r = await post(mail({ ToFull: undefined, To: `V <${ADDR.replace("@", "+news@")}>` })); await settle();
check("plus-tags and display names in the To line are fine", r.status === 201);
r = await post(mail({ FromFull: undefined, From: "Ada <ADA@example.com>" }));
check("From header with a display name is understood", r.status === 201);
r = await post(mail({ FromFull: { Email: "work@corp.com" } }));
check("an approved extra sender is accepted", r.status === 201);
await settle();

// ---------- drops: always 200 so the provider doesn't retry, and nothing is saved ----------
const n = mem().length;
const dropped = async (name: string, o: unknown, why: string) => { const rr = await post(o); const bb = await rr.json(); check(`${name} -> dropped (${why})`, rr.status === 200 && bb.dropped === why && mem().length === n, JSON.stringify(bb)); };
await dropped("a stranger writing to your address", mail({ FromFull: { Email: "evil@spam.com" } }), "sender not allowed");
await dropped("spoofed From with a failing SPF", mail({ Headers: [{ Name: "Received-SPF", Value: "Fail (domain does not designate)" }] }), "sender not verified");
await dropped("no authentication verdict at all", mail({ Headers: [] }), "sender not verified");
await dropped("SPF softfail", mail({ Headers: [{ Name: "Received-SPF", Value: "SoftFail" }] }), "sender not verified");
await dropped("an address that does not exist", mail({ ToFull: [{ Email: "zzzzzzzzzzzz@in.vinx.test" }] }), "no such address");
await dropped("another domain", mail({ ToFull: [{ Email: ADDR.replace("in.vinx.test", "other.com") }] }), "no such address");
await dropped("a one-time code email", mail({ Subject: "Your code", TextBody: "Your verification code is 482913" }), "sensitive");
await dropped("an empty message", mail({ Subject: "", TextBody: "" }), "empty");
check("DKIM pass alone is enough", (await post(mail({ Headers: [{ Name: "Authentication-Results", Value: "mx; dkim=pass header.d=example.com; spf=none" }] }))).status === 201);
await settle();

// ---------- content handling ----------
r = await post(mail({ TextBody: "", HtmlBody: "<style>p{}</style><h1>Hello&nbsp;team</h1><p>Meet at <b>5pm</b> &amp; bring the deck</p><script>alert(1)</script>" })); b = await r.json();
m = mem().find((x) => x.id === b.id)!;
check("html-only mail becomes clean text (no scripts or styles)", /Hello team/.test(m.raw_content) && /Meet at 5pm & bring the deck/.test(m.raw_content) && !/alert|p\{\}|<b>/.test(m.raw_content), m.raw_content);
r = await post(mail({ TextBody: "---------- Forwarded message ---------\nFrom: Bob\n\n\n\n\nSee you Friday" })); b = await r.json();
check("forward banners are tidied", !/Forwarded message/.test(mem().find((x) => x.id === b.id)!.raw_content));
r = await post(mail({ TextBody: "card 4242 4242 4242 4242 for the trip" })); b = await r.json();
check("card numbers are masked in mail too", mem().find((x) => x.id === b.id)!.raw_content.includes("[card number removed]") && /card number/.test(b.note));
r = await post(mail({ TextBody: "x".repeat(50_000) })); b = await r.json();
check("very long mail is capped", mem().find((x) => x.id === b.id)!.raw_content.length <= 20_000);
await settle();

// ---------- attachments ----------
const png = btoa(String.fromCharCode(137, 80, 78, 71, 1, 2, 3, 4));
r = await post(mail({ Subject: "whiteboard", TextBody: "from the meeting", Attachments: [{ Name: "a.png", ContentType: "image/png", Content: png }, { Name: "doc.pdf", ContentType: "application/pdf", Content: "AAAA" }] })); b = await r.json(); await settle();
m = mem().find((x) => x.id === b.id)!;
check("first image stored privately and read; other files noted, not stored", /^UA\/.+\.png$/.test(m.media_url) && DB.files.has(m.media_url) && m.metadata.skipped_attachments === 1 && G.visionCalls >= 1, JSON.stringify(m.metadata));
r = await post(mail({ Subject: "", TextBody: "", Attachments: [{ Name: "a.png", ContentType: "image/png", Content: png }] })); b = await r.json();
m = mem().find((x) => x.id === b.id)!;
check("an image-only mail is saved as a screenshot", r.status === 201 && m.source === "image" && m.raw_content === "[Screenshot]");
await settle();

// ---------- safe to retry ----------
const same = mail({ MessageID: "dup-1", Subject: "Same mail" });
await post(same); r = await post(same); b = await r.json();
check("the same MessageID twice is saved once", b.duplicate === true && mem().filter((x) => x.metadata?.subject === "Same mail").length === 1);
await settle();

// ---------- cost limit ----------
for (let i = 0; i < 65; i++) DB.t.raw_memories.push({ id: `rl${i}`, user_id: "UA", platform: "email", metadata: { channel: "email" }, raw_content: "x", status: "processed", created_at: new Date().toISOString(), source: "email" });
r = await post(mail()); b = await r.json();
check("hourly limit -> dropped quietly", r.status === 200 && b.dropped === "rate limited");
DB.t.raw_memories = DB.t.raw_memories.filter((x) => !String(x.id).startsWith("rl"));

// ---------- rotating the address ----------
const old = ADDR;
b = await (await asUser("email_regenerate")).json();
check("regenerating gives a new address and keeps approved senders", b.address !== old && b.extra_senders.length === 4, JSON.stringify(b));
b = await (await post(mail({ ToFull: [{ Email: old }] }))).json();
check("the old address stops working", b.dropped === "no such address");
check("another user's data untouched", mem("UB").length === 0);
check("the webhook secret never appears in logs", !logged.some((l) => l.includes("whsec_test")));

// ---------- reminders by email: the last resort ----------
Deno.env.delete("VAPID_PUBLIC_KEY"); Deno.env.delete("VAPID_PRIVATE_KEY"); Deno.env.delete("TELEGRAM_BOT_TOKEN");
const sendReminders = await load("send-reminders");
const runReminders = () => sendReminders(new Request("http://x/send-reminders", { method: "POST", headers: { "x-worker-secret": "w", "content-type": "application/json" }, body: "{}" })).then(async (x) => ({ status: x.status, body: await x.json() }));
const due = (id: string, user: string) => DB.t.pending_intents.push({ id, user_id: user, intent_text: `Task ${id}`, trigger_type: "date", trigger_value: null, trigger_date: new Date(Date.now() - 60_000).toISOString(), status: "pending" });
due("e1", "UA");
let rr = await runReminders();
check("no channel at all (no push, Telegram or email) -> clear 503", rr.status === 503, JSON.stringify(rr));
DB.t.pending_intents.find((i) => i.id === "e1")!.status = "pending";
Deno.env.set("RESEND_API_KEY", "re_test_secret"); Deno.env.set("EMAIL_FROM", "V <v@test.dev>");
rr = await runReminders();
check("with email configured and no device, the reminder is emailed to the account address", rr.status === 200 && rr.body.delivered === 1 && resend.length === 1 && resend[0].to[0] === "ada@example.com" && /Task e1/.test(resend[0].subject) && resend[0].auth === "Bearer re_test_secret", JSON.stringify([rr, resend]));
due("e2", "UB"); resendFail = true;
rr = await runReminders();
check("an email provider outage is counted as undelivered, not a crash", rr.status === 200 && rr.body.noDevice === 1 && rr.body.delivered === 0, JSON.stringify(rr));
check("the email API key never appears in logs", !logged.some((l) => l.includes("re_test_secret")), logged.filter((l) => l.includes("re_test_secret")).join("|").slice(0, 300));

console.log(fails ? `\n${fails} FAILED` : "\nall email tests passed");
Deno.exit(fails ? 1 : 0);
