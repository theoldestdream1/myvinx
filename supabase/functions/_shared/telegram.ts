// Thin wrapper over the Telegram Bot API. The bot token is read from the environment at call time and
// is never logged or included in an error: Telegram's file URLs contain it.

const API = "https://api.telegram.org";

export const telegramToken = () => Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
export const telegramConfigured = () => !!telegramToken() && !!Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Telegram sends the secret we registered with setWebhook in this header on every update. */
export function webhookSecretOk(req: Request): boolean {
  const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  return !!expected && safeEqual(got, expected);
}

export interface TgResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Call any Bot API method. Never throws: failures come back as { ok: false }. */
export async function tg<T = any>(method: string, payload: Record<string, unknown> = {}): Promise<TgResult<T>> {
  const token = telegramToken();
  if (!token) return { ok: false, description: "bot token not configured" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json().catch(() => ({}))) as TgResult<T>;
      if (res.status === 429 && attempt === 0) {
        await sleep(Math.min((data.parameters?.retry_after ?? 1) * 1000, 3000));
        continue;
      }
      return { ...data, ok: !!data.ok, error_code: data.error_code ?? (res.ok ? undefined : res.status) };
    } catch {
      // deliberately generic: the underlying error message can contain the request URL (and so the token)
      return { ok: false, description: `network error calling ${method}` };
    }
  }
  return { ok: false, description: "rate limited" };
}

export const TG_MAX_TEXT = 4096;
const clip = (s: string) => (s.length > TG_MAX_TEXT ? s.slice(0, TG_MAX_TEXT - 1) + "…" : s);

export interface InlineButton { text: string; callback_data: string }
export type Keyboard = InlineButton[][];

export const sendMessage = (chatId: number | string, text: string, opts: { replyTo?: number; keyboard?: Keyboard } = {}) =>
  tg("sendMessage", {
    chat_id: chatId,
    text: clip(text),
    disable_web_page_preview: true,
    ...(opts.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {}),
    ...(opts.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
  });

export const editMessageText = (chatId: number | string, messageId: number, text: string, keyboard?: Keyboard) =>
  tg("editMessageText", {
    chat_id: chatId, message_id: messageId, text: clip(text), disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });

export const answerCallbackQuery = (id: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text: text.slice(0, 190) } : {}) });

export const sendPhoto = (chatId: number | string, url: string, caption?: string, replyTo?: number) =>
  tg("sendPhoto", {
    chat_id: chatId, photo: url, ...(caption ? { caption: caption.slice(0, 1000) } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });

export const sendTyping = (chatId: number | string) => tg("sendChatAction", { chat_id: chatId, action: "typing" });

let botName: string | null = null;
/** The bot's @username (needed to build the one-tap deep link). Cached for the life of the worker. */
export async function botUsername(): Promise<string | null> {
  if (botName) return botName;
  const r = await tg<{ username?: string }>("getMe");
  botName = r.ok ? r.result?.username ?? null : null;
  return botName;
}
export const _resetBotNameForTests = () => { botName = null; };

export type Download = { ok: true; bytes: Uint8Array; path: string } | { ok: false; reason: "too_big" | "failed" };

/** Download a file a person sent. Refuses anything over maxBytes before fetching it. */
export async function downloadFile(fileId: string, maxBytes: number): Promise<Download> {
  const info = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!info.ok || !info.result?.file_path) {
    return { ok: false, reason: /too big/i.test(info.description ?? "") ? "too_big" : "failed" };
  }
  if ((info.result.file_size ?? 0) > maxBytes) return { ok: false, reason: "too_big" };
  try {
    const res = await fetch(`${API}/file/bot${telegramToken()}/${info.result.file_path}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ok: false, reason: "failed" };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > maxBytes) return { ok: false, reason: "too_big" };
    return { ok: true, bytes, path: info.result.file_path };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** True when Telegram says the person blocked the bot / deleted the chat: stop messaging them. */
export const isGone = (r: TgResult) => !r.ok && (r.error_code === 403 || /chat not found|user is deactivated/i.test(r.description ?? ""));
