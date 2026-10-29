import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import {
  answerCallbackQuery, downloadFile, editMessageText, sendMessage, sendPhoto, sendTyping,
  telegramConfigured, webhookSecretOk, type Keyboard,
} from "../_shared/telegram.ts";
import { describeRemoved, screenText } from "../_shared/redact.ts";
import { bytesToBase64, transcribeAudio } from "../_shared/transcribe.ts";
import { composeBrief, localDate, type Brief } from "../_shared/brief.ts";

// ---------------------------------------------------------------------------------------------
// Telegram -> Vinx. Anything a linked person sends to the bot is saved as a memory, exactly like
// the web app does it (same table, same processing), then acknowledged with an Undo button.
// Questions ("/ask ..." or an obvious question) are answered from their memories, with the original
// screenshot sent back. The function always answers 200 so Telegram never retry-storms us.
// ---------------------------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // same as the storage bucket
const MAX_VOICE_BYTES = 20 * 1024 * 1024; // Telegram's own download limit for bots
const MAX_VOICE_SECONDS = 10 * 60;
const MAX_TEXT_CHARS = 20_000;
const HOURLY_LIMIT = 60; // captures per person per hour (keeps costs and abuse bounded)
const UNDO_WINDOW_MS = 15 * 60 * 1000;

const env = (k: string) => Deno.env.get(k) || "";

/** Run work after we have answered Telegram, without losing it when the worker would otherwise stop. */
function background(p: Promise<unknown>) {
  const safe = p.catch((e) => console.error("background task failed:", e instanceof Error ? e.message : e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(safe);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Ctx {
  chatId: number;
  fromId: string;
  replyTo?: number;
  userId: string;
  timezone: string;
}

const HELP = [
  "I'm V, your second brain.",
  "",
  "Send me anything you want to remember: a note, a screenshot, a voice note, or forward a message from any chat. I'll save it quietly.",
  "",
  "To get something back, ask me (/ask the girl sketch I saved last week) or just type a question.",
  "",
  "/today  what's on your plate",
  "/pause  stop saving for now",
  "/resume  start saving again",
  "/disconnect  unlink this chat",
].join("\n");

function parseCommand(text: string): { cmd: string; arg: string } | null {
  const m = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] ?? "").trim() } : null;
}

const QUESTION_START = /^(what|where|when|who|whom|whose|which|how|why|did|do|does|can|could|is|are|was|were|have|has|had)\b/i;
/** A message that is clearly a question about the past, not a thought to remember. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  return t.length >= 8 && t.length <= 300 && t.endsWith("?") && QUESTION_START.test(t) && !/^(remind|remember)\b/i.test(t);
}

function forwardLabel(m: any): string | null {
  const o = m.forward_origin;
  if (o) {
    if (o.type === "user") return [o.sender_user?.first_name, o.sender_user?.last_name].filter(Boolean).join(" ") || null;
    if (o.type === "hidden_user") return o.sender_user_name ?? null;
    if (o.type === "chat") return o.sender_chat?.title ?? null;
    if (o.type === "channel") return o.chat?.title ?? null;
  }
  if (m.forward_from) return [m.forward_from.first_name, m.forward_from.last_name].filter(Boolean).join(" ") || null;
  return m.forward_sender_name ?? m.forward_from_chat?.title ?? null;
}

function whenText(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return new Date(iso).toISOString();
  }
}

// ---------------------------------------------------------------------------------------------

serve(async (req) => {
  if (req.method !== "POST") return new Response("Vinx Telegram webhook", { status: 200 });
  if (!telegramConfigured() || !webhookSecretOk(req)) return json({ error: "Forbidden" }, 403);

  let update: any;
  try { update = await req.json(); } catch { return json({ ok: true }); }

  const supabase = adminClient();

  // Telegram redelivers an update if we were slow: process each update_id once
  if (update?.update_id !== undefined) {
    const { error } = await supabase.from("channel_events").insert({ channel: "telegram", event_id: String(update.update_id) });
    if (error && (error as any).code === "23505") return json({ ok: true, duplicate: true });
    if (Math.random() < 0.02) {
      await supabase.from("channel_events").delete().lt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString());
    }
  }

  let chatId: number | undefined;
  try {
    if (update.callback_query) {
      chatId = update.callback_query.message?.chat?.id;
      await handleCallback(supabase, update.callback_query);
    } else if (update.message) {
      const m = update.message;
      chatId = m.chat?.id;
      if (m.chat?.type !== "private" || !m.from || m.from.is_bot) return json({ ok: true }); // private chats only
      await handleMessage(supabase, m);
    }
  } catch (e) {
    console.error("telegram update failed:", e instanceof Error ? e.message : e);
    if (chatId && update.message) {
      await sendMessage(chatId, "Sorry, I couldn't save that one. Please send it again.", { replyTo: update.message.message_id });
    }
  }
  return json({ ok: true });
});

// ---------------------------------------------------------------------------------------------

async function handleMessage(supabase: any, m: any) {
  const fromId = String(m.from.id);
  const chatId: number = m.chat.id;
  const text: string = typeof m.text === "string" ? m.text : "";
  const command = text ? parseCommand(text) : null;

  if (command?.cmd === "start") return handleStart(supabase, m, command.arg);

  const { data: link } = await supabase
    .from("channel_links").select("user_id, paused").eq("channel", "telegram").eq("external_id", fromId).maybeSingle();

  if (!link) {
    return void (await sendMessage(chatId,
      "Hi, I'm V. I don't know you yet.\n\nOpen Vinx, go to Settings and tap Connect Telegram. It takes one tap."));
  }

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", link.user_id).maybeSingle();
  const ctx: Ctx = { chatId, fromId, replyTo: m.message_id, userId: link.user_id, timezone: profile?.timezone || "UTC" };

  if (command) return handleCommand(supabase, ctx, command, link.paused);

  if (link.paused) {
    return void (await sendMessage(chatId, "I'm paused, so I didn't save that. Send /resume when you want me back.", { replyTo: m.message_id }));
  }

  // Several photos sent together arrive as separate messages: acknowledge the album once
  let quiet = false;
  if (m.media_group_id) {
    const { error } = await supabase.from("channel_events").insert({ channel: "telegram-album", event_id: String(m.media_group_id) });
    quiet = !!error;
  }

  const kind = m.photo?.length ? "photo"
    : m.voice || m.audio ? "voice"
    : m.document?.mime_type?.startsWith("image/") ? "image-file"
    : text ? "text" : "other";

  if (kind === "other") {
    return void (await sendMessage(chatId, "I can save text, photos, screenshots and voice notes for now. Other file types are coming.", { replyTo: m.message_id }));
  }

  if (kind === "text" && looksLikeQuestion(text)) return ask(ctx, text, true);

  // Cheap guard first: how much has this person saved in the last hour?
  const { data: recent } = await supabase
    .from("raw_memories").select("id").eq("user_id", ctx.userId).eq("platform", "telegram")
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString()).limit(HOURLY_LIMIT + 1);
  if ((recent?.length ?? 0) >= HOURLY_LIMIT) {
    return void (await sendMessage(chatId, "That's a lot at once. I'll be ready for more in a little while.", { replyTo: m.message_id }));
  }

  const fwd = forwardLabel(m);
  const meta: Record<string, unknown> = { channel: "telegram", telegram_message_id: m.message_id };
  if (fwd) meta.forwarded_from = fwd;

  if (kind === "text") {
    return saveText(supabase, ctx, text, meta, fwd, quiet);
  }

  if (kind === "voice") {
    const v = m.voice ?? m.audio;
    if ((v.duration ?? 0) > MAX_VOICE_SECONDS) {
      return void (await sendMessage(chatId, "That voice note is over 10 minutes. Could you send it in shorter pieces?", { replyTo: m.message_id }));
    }
    if (!env("LOVABLE_API_KEY")) {
      return void (await sendMessage(chatId, "Voice notes aren't switched on yet on this server.", { replyTo: m.message_id }));
    }
    const file = await downloadFile(v.file_id, MAX_VOICE_BYTES);
    if (!file.ok) {
      return void (await sendMessage(chatId, file.reason === "too_big" ? "That voice note is too large for me to download." : "I couldn't download that voice note. Please try again.", { replyTo: m.message_id }));
    }
    const t = await transcribeAudio(bytesToBase64(file.bytes), v.mime_type || "audio/ogg");
    if (!t.ok) return void (await sendMessage(chatId, "I couldn't transcribe that just now. Please try again in a moment.", { replyTo: m.message_id }));
    if (!t.text) return void (await sendMessage(chatId, "I couldn't hear anything in that voice note.", { replyTo: m.message_id }));
    meta.transcribed = true;
    meta.duration_seconds = v.duration ?? null;
    return saveText(supabase, ctx, t.text, meta, fwd, quiet, { source: "voice", captureType: "voice", showTranscript: true });
  }

  // photo or image sent as a file
  const best = kind === "photo" ? m.photo[m.photo.length - 1] : m.document;
  if ((best.file_size ?? 0) > MAX_IMAGE_BYTES) {
    return void (await sendMessage(chatId, "That image is over 10 MB. Could you send a smaller one?", { replyTo: m.message_id }));
  }
  const file = await downloadFile(best.file_id, MAX_IMAGE_BYTES);
  if (!file.ok) {
    return void (await sendMessage(chatId, file.reason === "too_big" ? "That image is over 10 MB. Could you send a smaller one?" : "I couldn't download that image. Please try again.", { replyTo: m.message_id }));
  }
  const mime = kind === "photo" ? "image/jpeg" : String(best.mime_type || "image/png");
  const ext = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
  const mediaPath = `${ctx.userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("memory-media").upload(mediaPath, file.bytes, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  // the caption is the only text we can screen; the picture itself is read later by the AI
  const caption = typeof m.caption === "string" ? m.caption : "";
  const screened = screenText(caption);
  const content = [fwd ? `Forwarded from ${fwd}` : "", screened.text.trim()].filter(Boolean).join(":\n") || "[Screenshot]";
  await insertAndAck(supabase, ctx, {
    content, source: "image", captureType: "screenshot", mediaPath, meta, quiet,
    note: screened.removed.length ? `I left ${describeRemoved(screened.removed)} out of the caption.` : "",
  });
}

async function saveText(
  supabase: any, ctx: Ctx, raw: string, meta: Record<string, unknown>, fwd: string | null, quiet: boolean,
  opts: { source?: "manual" | "voice"; captureType?: string; showTranscript?: boolean } = {},
) {
  const screened = screenText(raw.slice(0, MAX_TEXT_CHARS));
  if (screened.skip) {
    return void (await sendMessage(ctx.chatId, `I didn't save that. It looks like ${describeRemoved(screened.removed)}, and I keep those out of your memory.`, { replyTo: ctx.replyTo }));
  }
  const body = screened.text.trim();
  if (!body) return;
  const content = fwd ? `Forwarded from ${fwd}:\n${body}` : body;
  await insertAndAck(supabase, ctx, {
    content, source: opts.source ?? "manual", captureType: opts.captureType ?? "manual", meta, quiet,
    transcript: opts.showTranscript ? body : undefined,
    note: screened.removed.length ? `I left ${describeRemoved(screened.removed)} out.` : "",
  });
}

async function insertAndAck(
  supabase: any, ctx: Ctx,
  p: { content: string; source: string; captureType: string; mediaPath?: string; meta: Record<string, unknown>; quiet: boolean; transcript?: string; note?: string },
) {
  const { data: row, error } = await supabase.from("raw_memories").insert([{
    user_id: ctx.userId,
    raw_content: p.content,
    source: p.source,
    media_url: p.mediaPath ?? null,
    status: "pending",
    platform: "telegram",
    capture_type: p.captureType,
    metadata: p.meta,
  }]).select().single();
  if (error || !row) {
    if (p.mediaPath) await supabase.storage.from("memory-media").remove([p.mediaPath]);
    throw error ?? new Error("insert failed");
  }

  if (!p.quiet) {
    const head = p.transcript ? `Saved ✓\n“${p.transcript.length > 160 ? p.transcript.slice(0, 157) + "…" : p.transcript}”` : p.mediaPath ? "Saved ✓ Reading it now." : "Saved ✓";
    await sendMessage(ctx.chatId, p.note ? `${head}\n${p.note}` : head, {
      replyTo: ctx.replyTo, keyboard: [[{ text: "Undo", callback_data: `u:${row.id}` }]],
    });
  }
  background(processAndFollowUp(supabase, ctx, row.id));
}

/** Read/understand the memory, then tell the person if it contained a reminder. */
async function processAndFollowUp(supabase: any, ctx: Ctx, memoryId: string) {
  const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/process-memory`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ memoryId }),
  });
  if (!res.ok) { console.error("process-memory failed:", res.status); return; } // the cron sweeper retries it
  const { data: intents } = await supabase
    .from("pending_intents").select("intent_text, trigger_date").eq("raw_memory_id", memoryId).limit(3);
  for (const i of intents ?? []) {
    const when = whenText(i.trigger_date, ctx.timezone);
    await sendMessage(ctx.chatId, `⏰ I'll remind you: ${i.intent_text}${when ? `\n${when}` : ""}`);
  }
}

// ---------------------------------------------------------------------------------------------

async function handleStart(supabase: any, m: any, arg: string) {
  const chatId: number = m.chat.id;
  const fromId = String(m.from.id);
  const code = arg.trim().toLowerCase();

  if (!code) {
    const { data: link } = await supabase.from("channel_links").select("user_id").eq("channel", "telegram").eq("external_id", fromId).maybeSingle();
    return void (await sendMessage(chatId, link
      ? "You're connected. Send me anything you want to remember, or /help to see what I can do."
      : "Hi, I'm V, your second brain.\n\nTo connect: open Vinx, go to Settings and tap Connect Telegram."));
  }

  const hash = await sha256Hex(code);
  const { data: row } = await supabase.from("channel_link_codes").select("*").eq("code_hash", hash).maybeSingle();
  const valid = row && row.channel === "telegram" && !row.used_at && Date.parse(row.expires_at) > Date.now();
  if (!valid) {
    return void (await sendMessage(chatId, "That link has expired. Open Vinx, go to Settings and tap Connect Telegram again."));
  }
  // single use: whoever flips used_at first wins
  const { data: claimed } = await supabase.from("channel_link_codes")
    .update({ used_at: new Date().toISOString() }).eq("code_hash", hash).is("used_at", null).select();
  if (!claimed?.length) {
    return void (await sendMessage(chatId, "That link was already used. Open Vinx and tap Connect Telegram again."));
  }

  // this Telegram account moves to the new Vinx account; each side has at most one link
  await supabase.from("channel_links").delete().eq("channel", "telegram").eq("external_id", fromId);
  await supabase.from("channel_links").delete().eq("channel", "telegram").eq("user_id", row.user_id);
  const display = m.from.username ? `@${m.from.username}` : m.from.first_name || "Telegram";
  const { error } = await supabase.from("channel_links").insert({
    user_id: row.user_id, channel: "telegram", external_id: fromId, display_name: display,
  });
  if (error) throw error;

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", row.user_id).maybeSingle();
  const name = (profile?.display_name || "").split(" ")[0];
  await sendMessage(chatId,
    `Connected${name ? `, ${name}` : ""} ✓\n\nSend me anything you want to remember: a note, a screenshot, a voice note, or forward a message. To find something later, just ask. /help shows the rest.`);
}

async function handleCommand(supabase: any, ctx: Ctx, c: { cmd: string; arg: string }, paused: boolean) {
  switch (c.cmd) {
    case "help":
      return void (await sendMessage(ctx.chatId, HELP));
    case "pause":
      await supabase.from("channel_links").update({ paused: true }).eq("channel", "telegram").eq("external_id", ctx.fromId);
      return void (await sendMessage(ctx.chatId, "Paused. I won't save anything until you send /resume."));
    case "resume":
      await supabase.from("channel_links").update({ paused: false }).eq("channel", "telegram").eq("external_id", ctx.fromId);
      return void (await sendMessage(ctx.chatId, "I'm back. Send me anything."));
    case "disconnect":
    case "stop":
      await supabase.from("channel_links").delete().eq("channel", "telegram").eq("external_id", ctx.fromId);
      return void (await sendMessage(ctx.chatId, "Disconnected. Your saved memories are still in Vinx. Reconnect any time from Settings."));
    case "ask":
    case "find":
      if (!c.arg) return void (await sendMessage(ctx.chatId, "What should I look for? For example: /ask the screenshot about the pricing page"));
      return ask(ctx, c.arg, false);
    case "today": {
      const { data: brief } = await supabase.rpc("build_brief", { _user_id: ctx.userId, _tz: ctx.timezone, _seed: localDate(ctx.timezone) });
      const msg = brief ? composeBrief(brief as Brief, ctx.timezone) : null;
      return void (await sendMessage(ctx.chatId, msg ? `${msg.title}\n${msg.body}` : "Nothing due today and nothing coming up. A clear day."));
    }
    default:
      void paused;
      return void (await sendMessage(ctx.chatId, "I don't know that command. /help shows what I can do."));
  }
}

// ---------------------------------------------------------------------------------------------

const cleanAnswer = (s: string) =>
  s.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").replace(/\*\*|__|`/g, "").trim();

async function ask(ctx: Ctx, question: string, guessed: boolean) {
  await sendTyping(ctx.chatId);
  const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/query-memories`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ query: question, user_id: ctx.userId }),
  }).catch(() => null);
  if (!res || !res.ok) {
    return void (await sendMessage(ctx.chatId, "I couldn't search just now. Please try again in a moment.", { replyTo: ctx.replyTo }));
  }
  const data = await res.json().catch(() => ({}));
  const answer = cleanAnswer(String(data.response ?? "")) || "I couldn't find anything for that.";
  // when we only guessed it was a question, leave an easy way out
  const keyboard: Keyboard | undefined = guessed ? [[{ text: "Save this as a note instead", callback_data: "n" }]] : undefined;
  await sendMessage(ctx.chatId, answer, { replyTo: ctx.replyTo, keyboard });

  const withImage = (data.sources ?? []).filter((s: any) => s.image_url).slice(0, 2);
  for (const s of withImage) await sendPhoto(ctx.chatId, s.image_url, s.title ?? undefined);
}

// ---------------------------------------------------------------------------------------------

async function handleCallback(supabase: any, cq: any) {
  const data = String(cq.data ?? "");
  const fromId = String(cq.from?.id ?? "");
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const { data: link } = await supabase.from("channel_links").select("user_id").eq("channel", "telegram").eq("external_id", fromId).maybeSingle();
  if (!link || !chatId) return void (await answerCallbackQuery(cq.id, "Please reconnect Telegram in Vinx."));

  const [kind, id, extra] = data.split(":");

  if (kind === "u") { // Undo a save
    const { data: mem } = await supabase.from("raw_memories").select("id, user_id, media_url, created_at").eq("id", id).maybeSingle();
    if (!mem || mem.user_id !== link.user_id) return void (await answerCallbackQuery(cq.id, "Already removed."));
    if (Date.now() - Date.parse(mem.created_at) > UNDO_WINDOW_MS) {
      return void (await answerCallbackQuery(cq.id, "Too late to undo here. You can delete it in Vinx."));
    }
    await supabase.from("raw_memories").delete().eq("id", id); // cascades to events, reminders, search rows
    if (mem.media_url) await supabase.storage.from("memory-media").remove([mem.media_url]);
    await answerCallbackQuery(cq.id, "Removed");
    return void (await editMessageText(chatId, messageId, "Removed ✓"));
  }

  if (kind === "d" || kind === "s") { // reminder: done / snooze
    const { data: intent } = await supabase.from("pending_intents").select("id, user_id, intent_text").eq("id", id).maybeSingle();
    if (!intent || intent.user_id !== link.user_id) return void (await answerCallbackQuery(cq.id, "I can't find that reminder."));
    if (kind === "d") {
      await supabase.from("pending_intents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
      await answerCallbackQuery(cq.id, "Done");
      return void (await editMessageText(chatId, messageId, `✓ Done: ${intent.intent_text}`));
    }
    const minutes = Math.min(Math.max(parseInt(extra ?? "60", 10) || 60, 5), 7 * 1440);
    const at = new Date(Date.now() + minutes * 60_000);
    await supabase.from("pending_intents").update({ status: "pending", reminded_at: null, trigger_date: at.toISOString() }).eq("id", id);
    await answerCallbackQuery(cq.id, "Snoozed");
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", link.user_id).maybeSingle();
    return void (await editMessageText(chatId, messageId, `Snoozed until ${whenText(at.toISOString(), profile?.timezone || "UTC")}: ${intent.intent_text}`));
  }

  if (kind === "n") { // "that wasn't a question, save it"
    const original = cq.message?.reply_to_message;
    const text = typeof original?.text === "string" ? original.text : "";
    if (!text) return void (await answerCallbackQuery(cq.id, "I can't see the original message."));
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", link.user_id).maybeSingle();
    const ctx: Ctx = { chatId, fromId, userId: link.user_id, timezone: profile?.timezone || "UTC" };
    await answerCallbackQuery(cq.id, "Saving");
    await editMessageText(chatId, messageId, cq.message?.text ?? "…"); // drop the button
    return saveText(supabase, ctx, text, { channel: "telegram", telegram_message_id: original.message_id }, null, false);
  }

  await answerCallbackQuery(cq.id);
}
