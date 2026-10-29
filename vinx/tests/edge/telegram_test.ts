// Telegram channel: the REAL webhook / link / reminder / brief handlers against a mock Telegram API,
// a mock AI gateway and the in-memory fake database.
import { DB, removed } from "./fakedb.ts";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (extra && !ok ? "  :: " + extra : "")); if (!ok) fails++; };

const TOKEN = "8123456789:TESTTOKEN_abcdefghijklmnopqrstuvwxyz";
Deno.env.set("TELEGRAM_BOT_TOKEN", TOKEN);
Deno.env.set("TELEGRAM_WEBHOOK_SECRET", "whsec");
Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("LOVABLE_API_KEY", "k");
Deno.env.set("AI_GATEWAY_URL", "http://localhost:8125/v1");
Deno.env.delete("GEMINI_API_KEY");

// ---- capture console output so we can prove the bot token never reaches a log ----
const logged: string[] = [];
for (const k of ["log", "error", "warn"] as const) { const o = console[k]; console[k] = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); o(...a); }; }

// ---- mock AI gateway ----
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const reply = (c: string) => J({ choices: [{ message: { content: c } }] });
const G = { voiceText: "Remind me to call mum tomorrow at nine.", voiceFail: false, visionSawImage: 0 };
const hashEmbed = (t: string) => { const v = new Array(768).fill(0); for (const w of t.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 768] += 1; } const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); };
Deno.serve({ port: 8125, onListen() {} }, async (req) => {
  const url = new URL(req.url); const body = await req.json();
  if (url.pathname === "/v1/embeddings") return J({ data: [{ embedding: hashEmbed(String(body.input)) }] });
  const sys: string = body.messages[0].content; const last = body.messages[body.messages.length - 1].content;
  const userText = typeof last === "string" ? last : last.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
  if (sys.startsWith("You are a high-accuracy speech-to-text")) return G.voiceFail ? J({}, 500) : reply(G.voiceText);
  if (sys.startsWith("You describe images")) { G.visionSawImage++; return reply("VISIBLE TEXT: none\nDESCRIPTION: A pencil sketch of a girl scribbling under a colorful ceiling."); }
  if (sys.startsWith("You are a memory processing AI")) {
    const wantsReminder = /call mum|remind/i.test(userText);
    return reply(JSON.stringify({
      structured_event: { title: "Note", summary: userText.slice(0, 80), event_date: null, location: null, participants: [], topics: [], salience_score: 0.6, emotional_tone: "neutral", is_private: false },
      intent: wantsReminder ? { detected: true, intent_text: "Call mum", trigger_type: "date", trigger_value: "tomorrow 9am", trigger_date: new Date(Date.now() + 86_400_000).toISOString(), priority: 0.8 } : { detected: false },
      entities: [], relationships: [],
    }));
  }
  if (sys.startsWith("You prepare search queries")) return reply(JSON.stringify({ search_text: userText, date_from: null, date_to: null }));
  if (sys.startsWith("You are Vinx")) {
    const blocks = [...userText.matchAll(/\[(\d+)\] \([^\n]*\)\n([\s\S]*?)(?=\n\n\[\d+\] \(|\n\nOTHER RECENT|\n\nOPEN INTENTS|$)/g)];
    const hit = blocks.find((b) => /scribbl/i.test(b[2]));
    return reply(hit ? `That's the pencil sketch of a girl scribbling [${hit[1]}].` : "I don't have any memories that match.");
  }
  return J({}, 404);
});

// ---- mock Telegram + in-process routing of supabase function calls ----
interface TgCall { method: string; p: any }
const tgCalls: TgCall[] = [];
const files = new Map<string, { bytes: Uint8Array; size?: number }>();
const T = { failSend: false, sendStatus: 200 as number, fetchThrows: false };
let msgSeq = 100;
const realFetch = globalThis.fetch;
const fnCalls: string[] = [];
const handlers: Record<string, (r: Request) => Promise<Response>> = {};
(globalThis as any).__handlers = handlers;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.telegram.org/bot")) {
    if (T.fetchThrows) throw new Error(`fetch failed for ${url}`); // like a real network error: the message contains the URL
    const method = url.split("/").pop()!;
    const p = init?.body ? JSON.parse(init.body) : {};
    tgCalls.push({ method, p });
    if (method === "getMe") return J({ ok: true, result: { username: "memo_test_bot" } });
    if (method === "getWebhookInfo") return J({ ok: true, result: { url: "http://supabase.test/functions/v1/telegram-webhook", pending_update_count: 0 } });
    if (method === "getFile") { const f = files.get(p.file_id); return f ? J({ ok: true, result: { file_path: `files/${p.file_id}`, file_size: f.size ?? f.bytes.length } }) : J({ ok: false, error_code: 400, description: "wrong file_id" }, 400); }
    if (method === "sendMessage" && T.sendStatus !== 200) return J({ ok: false, error_code: T.sendStatus, description: "Forbidden: bot was blocked by the user" }, T.sendStatus);
    return J({ ok: true, result: { message_id: ++msgSeq } });
  }
  if (url.startsWith("https://api.telegram.org/file/bot")) { const id = url.split("/").pop()!; const f = files.get(id); return f ? new Response(f.bytes) : new Response("nope", { status: 404 }); }
  if (url.startsWith("http://supabase.test/functions/v1/")) {
    const name = url.split("/").pop()!; fnCalls.push(name);
    return handlers[name](new Request(url, init));
  }
  return realFetch(input, init);
}) as typeof fetch;

const pending: Promise<unknown>[] = [];
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };

const load = async (name: string) => { await import(`./fn/${name}/index.ts`); return (globalThis as any).__lastHandler as (r: Request) => Promise<Response>; };
handlers["process-memory"] = await load("process-memory");
handlers["query-memories"] = await load("query-memories");
const webhook = await load("telegram-webhook");
const channelLink = await load("channel-link");
const sendReminders = await load("send-reminders");
const dailyBrief = await load("daily-brief");

let uid = 1000;
const post = (h: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  h(new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const hook = async (update: any, secret = "whsec") => {
  const r = await post(webhook, { update_id: ++uid, ...update }, { "x-telegram-bot-api-secret-token": secret });
  await settle(); return r;
};
const msg = (from: number, extra: Record<string, unknown>, chat: any = { id: from, type: "private" }) => ({
  message: { message_id: ++msgSeq, from: { id: from, first_name: "Ada", username: "ada", is_bot: false }, chat, date: 0, ...extra },
});
const sent = (m = "sendMessage") => tgCalls.filter((c) => c.method === m);
const lastText = () => sent().at(-1)?.p.text as string | undefined;
const reset = () => { tgCalls.length = 0; fnCalls.length = 0; };
const memories = (user = "UA") => DB.t.raw_memories.filter((m) => m.user_id === user);
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);

// ================= webhook security =================
check("GET is harmless", (await webhook(new Request("http://x/"))).status === 200);
check("missing secret -> 403", (await post(webhook, { update_id: 1, ...msg(111, { text: "hi" }) })).status === 403);
check("wrong secret -> 403", (await hook(msg(111, { text: "hi" }), "nope")).status === 403);
check("nothing was sent or saved for rejected calls", tgCalls.length === 0 && DB.t.raw_memories.length === 0);

// ================= unlinked person =================
reset();
await hook(msg(111, { text: "remember the milk" }));
check("unlinked: told how to connect", /Settings/.test(lastText() ?? ""));
check("unlinked: nothing saved", DB.t.raw_memories.length === 0);

// ================= linking =================
const start = async (user: string) => (await post(channelLink, { action: "telegram_start" }, { Authorization: `Bearer user-${user}` })).json();
check("channel-link requires sign-in", (await post(channelLink, { action: "telegram_start" })).status === 401);
const l1 = await start("A");
const code1 = new URL(l1.url).searchParams.get("start")!;
check("deep link points at the bot", l1.url.startsWith("https://t.me/memo_test_bot?start=") && code1.length === 10, l1.url);
check("code stored hashed, never in plain text", !JSON.stringify(DB.t.channel_link_codes).includes(code1) && DB.t.channel_link_codes.length === 1);
const l2 = await start("A"); const code2 = new URL(l2.url).searchParams.get("start")!;
check("a new code replaces the old one", DB.t.channel_link_codes.length === 1 && code1 !== code2);

reset();
await hook(msg(111, { text: `/start ${code1}` }));
check("replaced (old) code is rejected", /expired/i.test(lastText() ?? "") && DB.t.channel_links.length === 0);
await hook(msg(111, { text: "/start garbage" }));
check("unknown code is rejected", /expired/i.test(lastText() ?? "") && DB.t.channel_links.length === 0);
DB.t.channel_link_codes[0].expires_at = new Date(Date.now() - 1000).toISOString();
await hook(msg(111, { text: `/start ${code2}` }));
check("expired code is rejected", /expired/i.test(lastText() ?? "") && DB.t.channel_links.length === 0);
const l3 = await start("A"); const code3 = new URL(l3.url).searchParams.get("start")!;
await hook(msg(111, { text: `/start ${code3}`, from: undefined }, { id: 111, type: "private" }).message ? msg(111, { text: `/start ${code3}` }) : msg(111, {}));
check("valid code links the account", DB.t.channel_links.length === 1 && DB.t.channel_links[0].user_id === "UA" && DB.t.channel_links[0].external_id === "111" && DB.t.channel_links[0].display_name === "@ada");
check("welcome message sent", /Connected/.test(lastText() ?? ""));
await hook(msg(222, { text: `/start ${code3}` }));
check("codes are single-use (a second Telegram account cannot reuse it)", DB.t.channel_links.length === 1 && /already used|expired/i.test(lastText() ?? ""));

// ================= saving text =================
reset();
await hook(msg(111, { text: "Remember to call mum tomorrow at 9" }));
let m = memories().at(-1);
check("text saved for the right user", !!m && m.source === "manual" && m.platform === "telegram" && m.capture_type === "manual" && m.raw_content.includes("call mum"));
check("acknowledged with an Undo button", lastText() === undefined ? false : sent().some((c) => c.p.text.startsWith("Saved") && c.p.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `u:${m!.id}`));
check("memory was processed in the background", fnCalls.includes("process-memory") && m!.status === "processed", `${fnCalls} ${m?.status}`);
check("reminder detected and confirmed to the person", sent().some((c) => /remind you: Call mum/.test(c.p.text)));
check("reminder stored", DB.t.pending_intents.some((i) => i.raw_memory_id === m!.id));

reset();
const dupUpdate = { update_id: 777777, ...msg(111, { text: "dup test note" }) };
await post(webhook, dupUpdate, { "x-telegram-bot-api-secret-token": "whsec" }); await settle();
await post(webhook, dupUpdate, { "x-telegram-bot-api-secret-token": "whsec" }); await settle();
check("a redelivered update is processed once", memories().filter((x) => x.raw_content === "dup test note").length === 1);

reset();
await hook(msg(111, { text: "Pay the invoice by Friday", forward_origin: { type: "user", sender_user: { first_name: "Tunde", last_name: "Bello" } } }));
m = memories().at(-1)!;
check("forwarded messages keep who sent them", m.raw_content.startsWith("Forwarded from Tunde Bello:\n") && m.metadata.forwarded_from === "Tunde Bello");

// ================= redaction =================
reset();
await hook(msg(111, { text: "my card is 4111 1111 1111 1111 for the hotel" }));
m = memories().at(-1)!;
check("card numbers are masked before saving", m.raw_content === "my card is [card number removed] for the hotel" && /left a card number out/.test(sent().at(-1)!.p.text));
const before = memories().length;
await hook(msg(111, { text: "Your verification code is 482913" }));
check("one-time codes are not saved at all", memories().length === before && /one-time code/.test(lastText() ?? ""));

// ================= photos =================
reset();
files.set("photo-big", { bytes: png });
await hook(msg(111, { photo: [{ file_id: "photo-small", file_size: 10 }, { file_id: "photo-big", file_size: png.length }], caption: "reference for the logo" }));
m = memories().at(-1)!;
check("photo saved as a screenshot with its caption", m.source === "image" && m.capture_type === "screenshot" && m.raw_content === "reference for the logo" && /^UA\/.+\.jpg$/.test(m.media_url), JSON.stringify(m));
check("image stored privately under the user's folder", DB.files.has(m.media_url));
check("image was read by the vision model", G.visionSawImage === 1 && m.status === "processed");
const shot = m;
reset();
files.set("photo-huge", { bytes: png, size: 11 * 1024 * 1024 });
const n0 = memories().length;
await hook(msg(111, { photo: [{ file_id: "photo-huge", file_size: 11 * 1024 * 1024 }] }));
check("oversize image refused politely", memories().length === n0 && /10 MB/.test(lastText() ?? ""));
files.set("doc-img", { bytes: png });
await hook(msg(111, { document: { file_id: "doc-img", mime_type: "image/png", file_size: png.length } }));
check("image sent as a file is saved too", memories().at(-1)!.source === "image" && memories().at(-1)!.media_url.endsWith(".png"));
reset();
await hook(msg(111, { document: { file_id: "x", mime_type: "application/pdf" } }));
check("unsupported files get an honest answer", /text, photos, screenshots and voice/.test(lastText() ?? ""));

// ================= voice =================
reset();
files.set("v1", { bytes: new Uint8Array(2000) });
await hook(msg(111, { voice: { file_id: "v1", duration: 5, mime_type: "audio/ogg", file_size: 2000 } }));
m = memories().at(-1)!;
check("voice note transcribed and saved", m.source === "voice" && m.capture_type === "voice" && m.raw_content === G.voiceText && m.metadata.transcribed === true);
check("person sees the transcript to check it", sent().some((c) => c.p.text.includes(G.voiceText)));
reset();
G.voiceText = ""; const nv = memories().length;
await hook(msg(111, { voice: { file_id: "v1", duration: 3, file_size: 2000 } }));
check("silent voice note is not saved", memories().length === nv && /couldn't hear/.test(lastText() ?? ""));
G.voiceText = "x"; G.voiceFail = true; reset();
await hook(msg(111, { voice: { file_id: "v1", duration: 3, file_size: 2000 } }));
check("transcription outage: told to retry, nothing half-saved", memories().length === nv && /couldn't transcribe/.test(lastText() ?? ""));
G.voiceFail = false; reset();
await hook(msg(111, { voice: { file_id: "v1", duration: 3600, file_size: 2000 } }));
check("very long voice note refused", memories().length === nv && /10 minutes/.test(lastText() ?? ""));

// ================= undo =================
reset();
const target = shot;
await hook({ callback_query: { id: "cb1", from: { id: 111 }, data: `u:${target.id}`, message: { message_id: 55, chat: { id: 111 } } } });
check("undo removes the memory, its image and derived rows", !DB.t.raw_memories.some((x) => x.id === target.id) && removed.includes(target.media_url) && !DB.t.structured_events.some((e) => e.raw_memory_id === target.id));
check("undo edits the message", sent("editMessageText").some((c) => c.p.text.startsWith("Removed")));

// someone else's account cannot undo it
await hook(msg(222, { text: "hello" })); // unlinked second account
DB.t.channel_links.push({ id: "L2", user_id: "UB", channel: "telegram", external_id: "222", display_name: "@bea", paused: false });
const bobMemory = DB.t.raw_memories.find((x) => x.user_id === "UA" && x.raw_content.includes("call mum"))!;
await hook({ callback_query: { id: "cb2", from: { id: 222 }, data: `u:${bobMemory.id}`, message: { message_id: 56, chat: { id: 222 } } } });
check("another user cannot undo someone else's memory", DB.t.raw_memories.some((x) => x.id === bobMemory.id));
bobMemory.created_at = new Date(Date.now() - 20 * 60_000).toISOString();
await hook({ callback_query: { id: "cb3", from: { id: 111 }, data: `u:${bobMemory.id}`, message: { message_id: 57, chat: { id: 111 } } } });
check("undo expires after 15 minutes", DB.t.raw_memories.some((x) => x.id === bobMemory.id) && sent("answerCallbackQuery").at(-1)!.p.text.startsWith("Too late"));

// ================= pause / resume / groups =================
reset();
await hook(msg(111, { text: "/pause" }));
check("/pause pauses", DB.t.channel_links.find((l) => l.external_id === "111")!.paused === true);
const np = memories().length;
await hook(msg(111, { text: "this should not be saved" }));
check("paused: nothing saved, and the person is told", memories().length === np && /paused/i.test(lastText() ?? ""));
await hook(msg(111, { text: "/resume" }));
await hook(msg(111, { text: "this should be saved" }));
check("/resume saves again", memories().length === np + 1);
reset();
await hook(msg(111, { text: "group chatter" }, { id: -500, type: "group" }));
check("group chats are ignored entirely", tgCalls.length === 0 && !memories().some((x) => x.raw_content === "group chatter"));
await hook({ message: { message_id: 1, from: { id: 999, is_bot: true }, chat: { id: 999, type: "private" }, text: "beep" } });
check("bots are ignored", tgCalls.length === 0);

// ================= rate limit =================
reset();
const savedRows = DB.t.raw_memories;
for (let i = 0; i < 60; i++) savedRows.push({ id: `rl${i}`, user_id: "UA", platform: "telegram", raw_content: "x", status: "processed", created_at: new Date().toISOString(), source: "manual" });
const nr = DB.t.raw_memories.length;
await hook(msg(111, { text: "one too many" }));
check("hourly limit protects cost and abuse", DB.t.raw_memories.length === nr && /a lot at once/.test(lastText() ?? ""));
DB.t.raw_memories = DB.t.raw_memories.filter((x) => !String(x.id).startsWith("rl"));

// ================= asking =================
reset();
// a processed screenshot to find
const sid = "ask-shot"; DB.files.set("UA/ask.png", new Blob([png]));
DB.t.raw_memories.push({ id: sid, user_id: "UA", source: "image", raw_content: "[Screenshot]", media_url: "UA/ask.png", status: "pending", platform: "telegram", capture_type: "screenshot", metadata: {}, created_at: new Date().toISOString() });
await handlers["process-memory"](new Request("http://x/", { method: "POST", headers: { Authorization: "Bearer service", "content-type": "application/json" }, body: JSON.stringify({ memoryId: sid }) }));
await hook(msg(111, { text: "/ask the sketch of a girl scribbling" }));
check("/ask answers from memories, without citation marks", /pencil sketch/.test(lastText() ?? "") && !/\[\d\]/.test(lastText() ?? ""), lastText());
check("/ask sends the original screenshot back", sent("sendPhoto").length >= 1 && /^https:\/\/signed\.example\/UA\/.+\.png/.test(String(sent("sendPhoto")[0].p.photo)), JSON.stringify(sent("sendPhoto").map((c) => c.p.photo)) + " text=" + lastText());
reset();
const nq = memories().length;
await hook(msg(111, { text: "Where did I put the sketch of the girl scribbling?" }));
check("an obvious question is answered, not saved", memories().length === nq && sent().some((c) => /pencil sketch/.test(c.p.text)));
const askMsg = sent().find((c) => c.p.reply_markup)!;
check("a guessed question offers 'save as a note instead'", askMsg.p.reply_markup.inline_keyboard[0][0].callback_data === "n");
const original = { message_id: 9, text: "Where did I put the sketch of the girl scribbling?" };
await hook({ callback_query: { id: "cb4", from: { id: 111 }, data: "n", message: { message_id: 60, chat: { id: 111 }, text: "answer", reply_to_message: original } } });
check("…and that button saves the original text", memories().length === nq + 1 && memories().at(-1)!.raw_content === original.text);
reset();
await hook(msg(111, { text: "call mum?" }));
check("short non-question text is still saved", memories().at(-1)!.raw_content === "call mum?");
const svc = await post(handlers["query-memories"], { query: "x" }, { Authorization: "Bearer service" });
check("service calls to query-memories must name a user", svc.status === 400);

// ================= commands =================
reset();
await hook(msg(111, { text: "/help" })); check("/help lists commands", /\/today/.test(lastText() ?? ""));
await hook(msg(111, { text: "/today" })); check("/today answers even on a quiet day", /clear day|Nothing/.test(lastText() ?? ""));
(DB as any).brief = { due: [{ id: "i", intent_text: "Send the invoice", trigger_type: "date", trigger_value: null, trigger_date: new Date().toISOString(), status: "pending" }], upcoming_count: 0, waiting_count: 0, captured_7d: 3, resurfaced: null };
await hook(msg(111, { text: "/today" })); check("/today lists what is due", /Send the invoice/.test(lastText() ?? ""));
await hook(msg(111, { text: "/nonsense" })); check("unknown command handled", /don't know that command/.test(lastText() ?? ""));
await hook(msg(111, { sticker: { file_id: "s" } })); check("stickers get an honest answer", /text, photos/.test(lastText() ?? ""));

// ================= reminders on Telegram =================
Deno.env.delete("VAPID_PUBLIC_KEY"); Deno.env.delete("VAPID_PRIVATE_KEY");
reset();
const due = (id: string, user: string) => DB.t.pending_intents.push({ id, user_id: user, intent_text: `Task ${id}`, trigger_type: "date", trigger_value: null, trigger_date: new Date(Date.now() - 60_000).toISOString(), status: "pending" });
due("rem1", "UA");
let r = await post(sendReminders, {}, { "x-worker-secret": "w" });
let body = await r.json();
const rm = sent().find((c) => String(c.p.text).includes("Task rem1"))!;
check("due reminder is delivered on Telegram with Done/Snooze buttons", !!rm && body.delivered === 1 && rm.p.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data).join() === "d:rem1,s:rem1:60,s:rem1:1440", JSON.stringify(body));
check("callback data fits Telegram's 64-byte limit", rm.p.reply_markup.inline_keyboard[0].every((b: any) => new TextEncoder().encode(b.callback_data).length <= 64));
await hook({ callback_query: { id: "cb5", from: { id: 111 }, data: "s:rem1:60", message: { message_id: 70, chat: { id: 111 } } } });
const ri = DB.t.pending_intents.find((i) => i.id === "rem1")!;
check("snooze reschedules about an hour out and re-arms it", ri.status === "pending" && ri.reminded_at === null && Math.abs(Date.parse(ri.trigger_date) - (Date.now() + 3600_000)) < 60_000);
await hook({ callback_query: { id: "cb6", from: { id: 111 }, data: "d:rem1", message: { message_id: 70, chat: { id: 111 } } } });
check("Done resolves it", DB.t.pending_intents.find((i) => i.id === "rem1")!.status === "resolved");
due("rem2", "UB"); // belongs to the other user
await hook({ callback_query: { id: "cb7", from: { id: 111 }, data: "d:rem2", message: { message_id: 71, chat: { id: 111 } } } });
check("cannot resolve someone else's reminder", DB.t.pending_intents.find((i) => i.id === "rem2")!.status === "pending");
reset();
DB.t.pending_intents.find((i) => i.id === "rem2")!.status = "resolved";
due("rem3", "UA"); DB.t.channel_links.find((l) => l.external_id === "111")!.paused = true;
body = await (await post(sendReminders, {}, { "x-worker-secret": "w" })).json();
check("paused chat gets no reminders", sent().length === 0 && body.noDevice === 1);
DB.t.channel_links.find((l) => l.external_id === "111")!.paused = false;
DB.t.pending_intents.find((i) => i.id === "rem3")!.status = "pending";
T.sendStatus = 403;
await post(sendReminders, {}, { "x-worker-secret": "w" });
check("blocking the bot unlinks the chat (no retry loop)", !DB.t.channel_links.some((l) => l.external_id === "111"));
T.sendStatus = 200;
DB.t.channel_links.push({ id: "L1", user_id: "UA", channel: "telegram", external_id: "111", display_name: "@ada", paused: false });

// ================= daily brief on Telegram =================
reset();
body = await (await post(dailyBrief, {}, { "x-worker-secret": "w" })).json();
check("daily brief reaches Telegram-only users", body.sent >= 1 && sent().some((c) => /Send the invoice/.test(c.p.text)), JSON.stringify(body));

// ================= health + token safety =================
const h = await (await post(channelLink, { action: "telegram_health" }, { Authorization: "Bearer user-A" })).json();
check("health reports bot and webhook", h.configured && h.bot_username === "memo_test_bot" && h.webhook_set === true, JSON.stringify(h));
check("health never reveals the token or secret", !JSON.stringify(h).includes(TOKEN) && !JSON.stringify(h).includes("whsec"));
T.fetchThrows = true; reset();
await hook(msg(111, { text: "network is down" }));
T.fetchThrows = false;
check("the bot token never appears in any log, even when Telegram is unreachable", !logged.some((l) => l.includes(TOKEN) || l.includes("TESTTOKEN")), logged.filter((l) => l.includes("TESTTOKEN")).join("|").slice(0, 200));
Deno.env.delete("TELEGRAM_BOT_TOKEN");
check("without a token the webhook refuses everything", (await hook(msg(111, { text: "x" }))).status === 403);

console.log(fails ? `\n${fails} FAILED` : "\nall telegram tests passed");
Deno.exit(fails ? 1 : 0);
