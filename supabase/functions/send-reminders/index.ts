import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, authenticate, isWorker } from "../_shared/auth.ts";
import { pushConfigured, sendToAll, type PushSub } from "../_shared/push.ts";
import { signActionToken } from "../_shared/actionToken.ts";
import { formatTime } from "../_shared/brief.ts";
import { isGone, sendMessage, telegramConfigured } from "../_shared/telegram.ts";
import { emailConfigured, sendEmail } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = adminClient();
  const dropGone = async (ids: string[]) => {
    await supabase.from("push_subscriptions").delete().in("id", ids);
  };

  try {
    // ---- Test mode: a signed-in user pings their own devices ------------------
    if (!(await isWorker(req))) {
      const caller = await authenticate(req);
      if (!caller || caller.kind !== "user") return json({ error: "Unauthorized" }, 401);
      if (!pushConfigured()) return json({ error: "Push is not configured on the server (VAPID keys missing)" }, 503);

      const { data: subs } = await supabase
        .from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", caller.userId);
      if (!subs?.length) return json({ error: "No devices registered. Enable notifications first." }, 404);

      const result = await sendToAll(subs as PushSub[], {
        type: "test",
        title: "Vinx notifications are on",
        body: "Reminders and your daily brief will show up here.",
        tag: "vinx-test",
        url: "/settings",
      }, dropGone, 300);
      return json({ devices: subs.length, ...result });
    }

    // ---- Cron mode: fire everything that's due --------------------------------
    const tgOn = telegramConfigured();
    if (!pushConfigured() && !tgOn && !emailConfigured()) return json({ error: "No delivery channel is configured (VAPID keys, a Telegram bot or email)" }, 503);

    const { data: due, error } = await supabase.rpc("claim_due_intents", { _limit: 100 });
    if (error) throw error;
    if (!due?.length) return json({ reminders: 0 });

    const userIds = [...new Set(due.map((d: any) => d.user_id))];
    const { data: allSubs } = await supabase
      .from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);

    const { data: tgLinks } = tgOn
      ? await supabase.from("channel_links").select("id, user_id, external_id").eq("channel", "telegram").eq("paused", false).in("user_id", userIds)
      : { data: [] as any[] };
    const tgByUser = new Map<string, { id: string; external_id: string }>();
    for (const l of tgLinks ?? []) tgByUser.set(l.user_id, l);

    const byUser = new Map<string, PushSub[]>();
    for (const s of allSubs ?? []) {
      const list = byUser.get(s.user_id) ?? [];
      list.push(s as PushSub);
      byUser.set(s.user_id, list);
    }

    let delivered = 0;
    let noDevice = 0;
    await Promise.all(due.map(async (d: any) => {
      const subs = byUser.get(d.user_id);
      const link = tgByUser.get(d.user_id);
      const when = d.trigger_date ? formatTime(d.trigger_date, d.timezone) : "";

      let viaTelegram = false;
      if (link) {
        const r = await sendMessage(link.external_id, `⏰ ${d.intent_text}${when ? `\nDue ${when}` : ""}`, {
          keyboard: [[
            { text: "Done", callback_data: `d:${d.id}` },
            { text: "1 hour", callback_data: `s:${d.id}:60` },
            { text: "Tomorrow", callback_data: `s:${d.id}:1440` },
          ]],
        });
        viaTelegram = r.ok;
        if (isGone(r)) await supabase.from("channel_links").delete().eq("id", link.id); // they blocked the bot
      }

      // Last resort: if neither Telegram nor a push device can take it, email the account address
      const emailFallback = async () => {
        if (!emailConfigured()) return false;
        const { data: addr } = await supabase.rpc("account_email", { _user_id: d.user_id });
        if (!addr) return false;
        const r = await sendEmail(String(addr), `Reminder: ${String(d.intent_text).slice(0, 80)}`, `${d.intent_text}${when ? `\nDue ${when}` : ""}\n\nOpen Vinx to mark it done or snooze it.`);
        return r.ok;
      };

      if (!subs?.length || !pushConfigured()) {
        if (viaTelegram || await emailFallback()) delivered++; else noDevice++; // undelivered still shows as due in the app
        return;
      }

      const token = await signActionToken(d.id);
      const res = await sendToAll(subs, {
        type: "reminder",
        title: String(d.intent_text).slice(0, 100),
        body: d.trigger_value ? `${d.trigger_value}${when ? ` · ${when}` : ""}` : (when ? `Due ${when}` : "Reminder"),
        tag: `intent-${d.id}`,
        url: "/intents",
        intentId: d.id,
        token,
        actionUrl: `${SUPABASE_URL}/functions/v1/intent-action`,
        apikey: SUPABASE_ANON_KEY,
      }, dropGone, 6 * 3600);
      if (res.sent > 0 || viaTelegram || await emailFallback()) delivered++;
    }));

    return json({ reminders: due.length, delivered, noDevice });
  } catch (e) {
    console.error("send-reminders error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
