import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, hasWorkerSecret } from "../_shared/auth.ts";

// Edge functions time out around 150s and each memory costs a few seconds of AI,
// so keep batches small and run a few in parallel. Cron runs this every minute.
const BATCH_LIMIT = 15;
const CONCURRENCY = 5;
const STUCK_LIMIT = 5;
const MAX_ATTEMPTS = 5;

type MemorySource =
  | "whatsapp" | "sms" | "email" | "calendar" | "notes"
  | "voice" | "image" | "browser" | "notification" | "manual";

/** Map device capture types / packages onto the memory_source enum. */
function toSource(row: { capture_type?: string | null; app_package?: string | null; source_app?: string | null }): MemorySource {
  const hint = `${row.app_package ?? ""} ${row.source_app ?? ""}`.toLowerCase();
  if (hint.includes("whatsapp")) return "whatsapp";
  if (hint.includes("messaging") || hint.includes("sms")) return "sms";
  if (hint.includes("gmail") || hint.includes("mail")) return "email";
  if (hint.includes("calendar")) return "calendar";
  if (hint.includes("chrome") || hint.includes("browser") || hint.includes("firefox")) return "browser";
  switch (row.capture_type) {
    case "notification": return "notification";
    case "voice": return "voice";
    case "screen_ocr": return "image";
    case "accessibility": return "browser";
    default: return "manual";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Only the cron job (which knows WORKER_SECRET) may trigger this
  if (!hasWorkerSecret(req)) return json({ error: "Unauthorized" }, 401);

  const supabase = adminClient();

  try {
    // ---- 1. Device ingestion queue ---------------------------------------------------
    const { data: claimed, error: claimErr } = await supabase.rpc("claim_ingestion_batch", {
      _limit: BATCH_LIMIT,
    });
    if (claimErr) throw claimErr;

    let processed = 0;
    let failed = 0;

    const handle = async (row: any) => {
      try {
        // On retry, reuse the memory created by the previous attempt (avoids duplicates)
        const { data: prior } = await supabase
          .from("raw_memories")
          .select("id")
          .eq("user_id", row.user_id)
          .eq("metadata->>queue_id", row.id)
          .limit(1)
          .maybeSingle();
        if (prior) {
          await supabase.from("raw_memories").update({ status: "pending" }).eq("id", prior.id).neq("status", "processed");
        }

        const { data: mem, error: memErr } = prior ? { data: prior, error: null } : await supabase
          .from("raw_memories")
          .insert({
            user_id: row.user_id,
            source: toSource(row),
            raw_content: row.raw_content,
            platform: row.platform,
            app_package: row.app_package,
            capture_type: row.capture_type,
            metadata: {
              ...(row.metadata || {}),
              source_app: row.source_app,
              client_timestamp: row.client_timestamp,
              ingested_via: "device_queue",
              queue_id: row.id,
            },
            status: "pending",
          })
          .select("id")
          .single();
        if (memErr || !mem) throw memErr ?? new Error("raw_memories insert failed");

        // invoke() RETURNS errors rather than throwing, so check it explicitly
        const { error: fnErr } = await supabase.functions.invoke("process-memory", {
          body: { memoryId: mem.id },
        });
        if (fnErr) throw fnErr;

        await supabase.from("ingestion_queue").update({ status: "done", last_error: null }).eq("id", row.id);
        processed++;
      } catch (e) {
        const message = e instanceof Error ? e.message : JSON.stringify(e);
        console.error("queue row failed", row.id, message);
        // attempts was already incremented when the row was claimed
        const exhausted = (row.attempts ?? 1) >= MAX_ATTEMPTS;
        await supabase
          .from("ingestion_queue")
          .update({ status: exhausted ? "failed" : "queued", last_error: message.slice(0, 500) })
          .eq("id", row.id);
        failed++;
      }
    };

    const rows = claimed ?? [];
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(handle));
    }

    // ---- 2. Safety net: memories saved from the app that never finished processing ------
    // (the tab/share window closed mid-request, or the AI hiccuped). Retries are capped in SQL.
    let swept = 0;
    let sweptFailed = 0;
    const { data: stuck, error: stuckErr } = await supabase.rpc("claim_stuck_memories", { _limit: STUCK_LIMIT });
    if (stuckErr) {
      console.error("claim_stuck_memories failed", stuckErr);
    } else {
      const ids: string[] = (stuck ?? []).map((r: { id: string }) => r.id);
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        await Promise.all(
          ids.slice(i, i + CONCURRENCY).map(async (memoryId) => {
            const { error } = await supabase.functions.invoke("process-memory", { body: { memoryId } });
            if (error) sweptFailed++;
            else swept++;
          }),
        );
      }
    }

    return json({ processed, failed, swept, sweptFailed });
  } catch (e) {
    console.error("worker error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
