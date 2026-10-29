import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, authenticate } from "../_shared/auth.ts";
import { CHAT_MODEL, EMBED_MODEL, lovableKey } from "../_shared/ai.ts";
import { embedWithDiagnostics } from "../_shared/embeddings.ts";

// A health check for recall: tells the person (and us) exactly why search is or isn't working,
// instead of guessing. Read-only.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await authenticate(req);
    if (!caller || caller.kind !== "user") return json({ error: "Unauthorized" }, 401);
    const supabase = adminClient();

    const [{ data: stats }, probe, bucket] = await Promise.all([
      supabase.rpc("memory_search_stats", { _user_id: caller.userId }),
      embedWithDiagnostics("Vinx health probe", "RETRIEVAL_QUERY"),
      supabase.storage.getBucket("memory-media"),
    ]);

    const modelsInUse: Record<string, number> = stats?.embedding_models ?? {};
    const currentCount = probe.ok ? modelsInUse[probe.model] ?? 0 : 0;
    const processed: number = stats?.processed ?? 0;

    return json({
      stats,
      ai_key_present: !!lovableKey(),
      embedding: probe.ok
        ? { ok: true, provider: probe.provider, model: probe.model }
        : { ok: false, error: probe.error.slice(0, 240) },
      // Memories that are processed but not searchable by meaning with the current model
      needs_reindex: probe.ok ? Math.max(processed - currentCount, 0) : null,
      screenshot_storage: { ok: !bucket.error && !!bucket.data, error: bucket.error?.message ?? null },
      models: { chat: CHAT_MODEL, embedding: EMBED_MODEL },
    });
  } catch (e) {
    console.error("search-status error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
