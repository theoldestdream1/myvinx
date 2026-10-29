import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";
import { verifyActionToken } from "../_shared/actionToken.ts";

// Called by the service worker when the user taps Done / Snooze on a notification.
// Auth = the signed, expiring, single-intent token that was embedded in the push payload.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { token, action, minutes } = await req.json();
    const intentId = typeof token === "string" ? await verifyActionToken(token) : null;
    if (!intentId) return json({ error: "Invalid or expired link" }, 401);

    const supabase = adminClient();

    if (action === "done") {
      const { error } = await supabase
        .from("pending_intents")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", intentId);
      if (error) throw error;
      return json({ ok: true, action });
    }

    if (action === "snooze") {
      const mins = Math.min(Math.max(Number(minutes) || 60, 5), 24 * 60);
      const { error } = await supabase
        .from("pending_intents")
        .update({
          status: "pending",
          reminded_at: null,
          trigger_date: new Date(Date.now() + mins * 60_000).toISOString(),
        })
        .eq("id", intentId);
      if (error) throw error;
      return json({ ok: true, action, minutes: mins });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("intent-action error", e);
    return json({ error: "Could not update reminder" }, 500);
  }
});
