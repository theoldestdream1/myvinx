import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/auth.ts";
import { buildCalendar } from "../_shared/ics.ts";

// GET /functions/v1/calendar-feed?t=<token>  ->  text/calendar of the person's reminders.
// Calendar apps cannot send headers, so the secret link is the credential. A wrong or rotated token is a
// plain 404 (no hint whether it ever existed).
const DAY = 86_400_000;
const plain = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return plain(405, "Use GET");
  const token = (new URL(req.url).searchParams.get("t") || "").trim().toLowerCase();
  if (!/^[a-z0-9]{24,48}$/.test(token)) return plain(404, "Not found");
  try {
    const supabase = adminClient();
    const { data: feed } = await supabase.from("calendar_feeds").select("user_id").eq("token", token).maybeSingle();
    if (!feed?.user_id) return plain(404, "Not found");
    // upcoming and overdue reminders, plus what fired in the last two weeks so the calendar keeps its history
    const { data: rows, error } = await supabase.from("pending_intents")
      .select("id, intent_text, trigger_date, status, reminded_at")
      .eq("user_id", feed.user_id).in("status", ["pending", "reminded"]).limit(500);
    if (error) throw error;
    const cutoff = Date.now() - 14 * DAY;
    const items = (rows ?? []).filter((r: any) => r.trigger_date && (r.status === "pending" || Date.parse(r.trigger_date) >= cutoff))
      .map((r: any) => ({ id: r.id, text: r.intent_text, when: r.trigger_date }));
    return new Response(req.method === "HEAD" ? null : buildCalendar(items), {
      headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300", "content-disposition": 'inline; filename="vinx.ics"' },
    });
  } catch (e) {
    console.error("calendar-feed error:", e instanceof Error ? e.message : e);
    return plain(500, "Try again later");
  }
});
