import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, authenticate } from "../_shared/auth.ts";
import { botUsername, telegramConfigured, tg } from "../_shared/telegram.ts";
import { inboundDomain } from "../_shared/email.ts";

const CODE_TTL_MS = 10 * 60 * 1000;
const ALPHABET = "abcdefghjklmnpqrstuvwxyz23456789"; // 32 symbols, no look-alikes (0/o, 1/i)

function newCode(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join(""); // 256 % 32 == 0, so no modulo bias
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Called by the Settings page. Starts a Telegram link (returns a one-tap deep link) or reports health.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const caller = await authenticate(req);
    if (!caller || caller.kind !== "user") return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const supabase = adminClient();

    if (action === "telegram_health") {
      if (!telegramConfigured()) return json({ configured: false });
      let [username, info] = await Promise.all([botUsername(), tg<any>("getWebhookInfo")]);
      const target = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;
      let url: string = info.result?.url ?? "";
      // Self-heal: point the bot at our webhook (with the shared secret) if it isn't already.
      if (url !== target) {
        const set = await tg("setWebhook", {
          url: target,
          secret_token: Deno.env.get("TELEGRAM_WEBHOOK_SECRET"),
          allowed_updates: ["message", "edited_message", "callback_query"],
        });
        if (set.ok) { info = await tg<any>("getWebhookInfo"); url = info.result?.url ?? ""; }
      }
      return json({
        configured: true,
        bot_username: username,
        webhook_set: url === target,
        pending_update_count: info.result?.pending_update_count ?? null,
        last_error: info.result?.last_error_message ?? null,
      });
    }

    if (action === "telegram_start") {
      if (!telegramConfigured()) return json({ error: "Telegram isn't set up on this server yet." }, 503);
      const username = await botUsername();
      if (!username) return json({ error: "Couldn't reach Telegram. Check the bot token." }, 502);

      // at most a handful of fresh codes per hour per person
      const { data: recent } = await supabase.from("channel_link_codes").select("code_hash")
        .eq("user_id", caller.userId).eq("channel", "telegram").gte("created_at", new Date(Date.now() - 3600_000).toISOString()).limit(11);
      if ((recent?.length ?? 0) > 10) return json({ error: "Too many attempts. Try again in a little while." }, 429);

      await supabase.from("channel_link_codes").delete().eq("user_id", caller.userId).eq("channel", "telegram").is("used_at", null);
      const code = newCode();
      const { error } = await supabase.from("channel_link_codes").insert({
        code_hash: await sha256Hex(code), user_id: caller.userId, channel: "telegram",
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      });
      if (error) throw error;
      return json({ url: `https://t.me/${username}?start=${code}`, username, expires_in: CODE_TTL_MS / 1000 });
    }

    // ---- calendar: a private subscription link for reminders ----
    if (action === "calendar_get" || action === "calendar_regenerate") {
      const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
      const view = (token: string) => {
        const https = `${base}/functions/v1/calendar-feed?t=${token}`;
        return { https, webcal: https.replace(/^https?:/, "webcal:") };
      };
      if (action === "calendar_regenerate") {
        const { error } = await supabase.from("calendar_feeds").upsert({ user_id: caller.userId, token: newCode(32) }, { onConflict: "user_id" });
        if (error) throw error;
      } else {
        const { data: have } = await supabase.from("calendar_feeds").select("token").eq("user_id", caller.userId).maybeSingle();
        if (!have) {
          const { error } = await supabase.from("calendar_feeds").insert({ user_id: caller.userId, token: newCode(32) });
          if (error && (error as any).code !== "23505") throw error;
        }
      }
      const { data: row } = await supabase.from("calendar_feeds").select("token").eq("user_id", caller.userId).maybeSingle();
      return row?.token ? json(view(row.token)) : json({ error: "Could not create the link" }, 500);
    }

    // ---- email: a private address that turns forwarded mail into memories ----
    if (action.startsWith("email_")) {
      const domain = inboundDomain();
      if (!domain) return json({ configured: false });
      const view = (a: { alias: string; extra_senders: string[] }) => ({ configured: true, address: `${a.alias}@${domain}`, extra_senders: a.extra_senders ?? [] });
      const load = async () => (await supabase.from("inbound_addresses").select("alias, extra_senders").eq("user_id", caller.userId).maybeSingle()).data as { alias: string; extra_senders: string[] } | null;

      if (action === "email_get") {
        let a = await load();
        if (!a) {
          const { error } = await supabase.from("inbound_addresses").insert({ user_id: caller.userId, alias: newCode(14), extra_senders: [] });
          if (error && (error as any).code !== "23505") throw error;
          a = await load();
        }
        return a ? json(view(a)) : json({ error: "Could not create the address" }, 500);
      }
      if (action === "email_regenerate") {
        const { error } = await supabase.from("inbound_addresses").upsert({ user_id: caller.userId, alias: newCode(14) }, { onConflict: "user_id" });
        if (error) throw error;
        const a = await load();
        return a ? json(view(a)) : json({ error: "Could not create the address" }, 500);
      }
      if (action === "email_add_sender" || action === "email_remove_sender") {
        const email = String(body?.email ?? "").trim().toLowerCase();
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 200) return json({ error: "That doesn't look like an email address." }, 400);
        let a = await load();
        if (!a) return json({ error: "Create your address first." }, 400);
        let list = a.extra_senders ?? [];
        if (action === "email_add_sender") {
          if (list.length >= 5 && !list.includes(email)) return json({ error: "You can approve up to 5 extra addresses." }, 400);
          if (!list.includes(email)) list = [...list, email];
        } else list = list.filter((e) => e !== email);
        const { error } = await supabase.from("inbound_addresses").update({ extra_senders: list }).eq("user_id", caller.userId);
        if (error) throw error;
        return json(view({ alias: a.alias, extra_senders: list }));
      }
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("channel-link error", e instanceof Error ? e.message : e);
    return json({ error: "Something went wrong" }, 500);
  }
});
