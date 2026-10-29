import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, authenticate, hasWorkerSecret } from "../_shared/auth.ts";
import { pushConfigured, sendToAll, type PushSub } from "../_shared/push.ts";
import { composeBrief, localDate, type Brief } from "../_shared/brief.ts";
import { isGone, sendMessage, telegramConfigured } from "../_shared/telegram.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = adminClient();

  try {
    // ---- Cron mode: push each user's brief when their morning arrives --------
    if (hasWorkerSecret(req)) {
      const tgOn = telegramConfigured();
      if (!pushConfigured() && !tgOn) return json({ error: "Neither VAPID keys nor a Telegram bot are configured" }, 503);

      const { data: users, error } = await supabase.rpc("claim_due_briefs", { _limit: 50 });
      if (error) throw error;
      if (!users?.length) return json({ briefs: 0 });

      let sent = 0;
      let skipped = 0;
      for (const u of users as { user_id: string; timezone: string }[]) {
        try {
          const { data: brief, error: bErr } = await supabase.rpc("build_brief", {
            _user_id: u.user_id, _tz: u.timezone, _seed: localDate(u.timezone),
          });
          if (bErr) throw bErr;

          const message = composeBrief(brief as Brief, u.timezone);
          if (!message) { skipped++; continue; } // nothing useful to say today: stay quiet

          let delivered = false;
          if (tgOn) {
            const { data: link } = await supabase.from("channel_links").select("id, external_id")
              .eq("user_id", u.user_id).eq("channel", "telegram").eq("paused", false).maybeSingle();
            if (link) {
              const r = await sendMessage(link.external_id, `${message.title}\n${message.body}`);
              delivered = r.ok;
              if (isGone(r)) await supabase.from("channel_links").delete().eq("id", link.id);
            }
          }

          const { data: subs } = pushConfigured()
            ? await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", u.user_id)
            : { data: [] as any[] };
          if (subs?.length) {
            const res = await sendToAll(subs as PushSub[], {
              type: "brief", ...message, tag: "vinx-brief", url: "/dashboard",
            }, async (ids) => { await supabase.from("push_subscriptions").delete().in("id", ids); }, 12 * 3600);
            if (res.sent > 0) delivered = true;
          }
          if (delivered) sent++; else skipped++;
        } catch (e) {
          console.error("brief failed for user", u.user_id, e); // one bad user must not stop the rest
        }
      }
      return json({ briefs: users.length, sent, skipped });
    }

    // ---- User mode: the dashboard card asks for today's brief -----------------
    const caller = await authenticate(req);
    if (!caller || caller.kind !== "user") return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase
      .from("profiles").select("timezone, display_name").eq("id", caller.userId).maybeSingle();
    const tz = profile?.timezone || "UTC";

    const { data: brief, error } = await supabase.rpc("build_brief", {
      _user_id: caller.userId, _tz: tz, _seed: localDate(tz),
    });
    if (error) throw error;

    return json({ brief, timezone: tz, display_name: profile?.display_name ?? null });
  } catch (e) {
    console.error("daily-brief error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
