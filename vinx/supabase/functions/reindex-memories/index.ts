import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, authenticate } from "../_shared/auth.ts";
import { embedWithDiagnostics, toPgVector } from "../_shared/embeddings.ts";
import { buildSearchText } from "../_shared/text.ts";

const PER_CALL = 20;

// Builds / refreshes the search index for the caller's existing memories: anything with no
// embedding, or an embedding from a different model than the one currently in use.
// Call repeatedly until `remaining` is 0.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await authenticate(req);
    if (!caller || caller.kind !== "user") return json({ error: "Unauthorized" }, 401);
    const userId = caller.userId;
    const supabase = adminClient();

    // Which model are we embedding with right now? (also proves embeddings work at all)
    const probe = await embedWithDiagnostics("Vinx index probe", "RETRIEVAL_DOCUMENT");
    if (!probe.ok) {
      return json({ error: `Embeddings are unavailable: ${probe.error}`, indexed: 0, remaining: null }, 503);
    }
    const currentModel = probe.model;

    const [{ data: events, error: evErr }, { data: vectors, error: vecErr }] = await Promise.all([
      supabase
        .from("structured_events")
        .select("id, raw_memory_id, title, summary, participants, topics, location")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("memory_vectors").select("structured_event_id, embedding_model, embedding").eq("user_id", userId).limit(5000),
    ]);
    if (evErr) throw evErr;
    if (vecErr) throw vecErr;

    const done = new Set(
      (vectors ?? [])
        .filter((v: any) => v.embedding && v.embedding_model === currentModel)
        .map((v: any) => v.structured_event_id),
    );
    const todo = (events ?? []).filter((e: any) => !done.has(e.id));
    const batch = todo.slice(0, PER_CALL);

    let indexed = 0;
    for (const e of batch) {
      let raw: any = null;
      if (e.raw_memory_id) {
        const { data } = await supabase
          .from("raw_memories")
          .select("raw_content, metadata, platform, app_package, capture_type")
          .eq("id", e.raw_memory_id)
          .maybeSingle();
        raw = data;
      }
      const note = raw?.raw_content && raw.raw_content !== "[Screenshot]" ? raw.raw_content : "";
      const searchText = buildSearchText([
        e.title,
        e.summary,
        raw?.metadata?.image_description,
        raw?.metadata?.extracted_text,
        (e.participants || []).join(", "),
        (e.topics || []).join(", "),
        e.location,
        note,
      ]);

      const embedded = await embedWithDiagnostics(searchText, "RETRIEVAL_DOCUMENT");
      if (!embedded.ok) continue; // leave it for the next run; don't pretend it's indexed

      const { error } = await supabase.from("memory_vectors").upsert(
        {
          user_id: userId,
          structured_event_id: e.id,
          raw_memory_id: e.raw_memory_id,
          content_text: searchText,
          embedding: toPgVector(embedded.vector),
          embedding_model: embedded.model,
          platform: raw?.platform ?? null,
          app_package: raw?.app_package ?? null,
          capture_type: raw?.capture_type ?? null,
        },
        { onConflict: "structured_event_id" },
      );
      if (!error) indexed++;
    }

    return json({ indexed, remaining: Math.max(todo.length - indexed, 0), model: currentModel });
  } catch (e) {
    console.error("reindex error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
