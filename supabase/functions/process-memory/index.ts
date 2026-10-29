import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, authenticate } from "../_shared/auth.ts";
import { screenText } from "../_shared/redact.ts";
import { transcribeAudio } from "../_shared/transcribe.ts";
import { chatCompletion, CHAT_MODEL, lovableKey } from "../_shared/ai.ts";
import { embed, toPgVector } from "../_shared/embeddings.ts";
import { buildSearchText, parseImageUnderstanding } from "../_shared/text.ts";

/** "Saturday, October 3, 2026 at 2:15 PM" in the user's timezone (falls back to UTC). */
function formatNow(date: Date, tz: string) {
  try {
    return date.toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" });
  } catch {
    return date.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "full", timeStyle: "short" }) + " UTC";
  }
}

/** Models sometimes emit junk dates; a bad date must never lose the whole memory. */
function safeDate(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Step 1 (screenshots/photos only): read the image into plain text. Plain text can't fail JSON
// parsing, and the description is written for the way people actually search ("that drawing of
// a girl under a colorful ceiling"), not for tidy metadata.
const VISION_PROMPT = `You describe images for a personal memory archive. The owner will later try to find this image by describing it from memory, often vaguely (for example "the drawing of a girl looking at a colorful ceiling" or "that pricing screenshot").

Reply in EXACTLY this format and nothing else:
VISIBLE TEXT: <every piece of legible text transcribed verbatim in reading order, or "none">
DESCRIPTION: <3 to 5 plain sentences>

In DESCRIPTION cover: what kind of image it is (photo, drawing, sketch, painting, illustration, meme, screenshot of an app/website/chat, document); the main subjects and their distinguishing details (people or characters, appearance, clothing, expression, eye and hair color, pose); the setting and notable objects; the colors and art style (black and white, colorful, pastel, cartoon, realistic, and so on); the mood; and if it is a screenshot, the app or website and what is happening in it. Use everyday words people would use to describe it, including common synonyms (for example "drawing" and "sketch", "colorful" and "multicolored").`;

// Step 2: structure the memory. For images it works from the step-1 text.
const SYSTEM_PROMPT = `You are a memory processing AI with 6 specialized agents. Analyze the user's memory and extract structured information.

AGENT 1 - INGESTION: Clean and normalize the raw content. If an IMAGE DESCRIPTION and/or IMAGE TEXT are provided, they describe an attached image: the title and summary must describe what the image shows, not just say "screenshot".
AGENT 2 - INTENT & SALIENCE: Detect future intentions ("remind me", "I should", "next week", "don't forget", etc.) and score importance 0-1.
AGENT 3 - MEMORY STRUCTURING: Extract a title, summary, date if mentioned, location, participants (people names), and topics.
AGENT 4 - TEMPORAL REASONING: If there's a future intent, identify the trigger type (date, location, context, person) and when to remind. trigger_date is WHEN THE USER SHOULD BE NOTIFIED, not when the event happens: for a timed appointment or call use 1 hour before it; if only a day is known (no time), use 9:00 AM that day in the user's timezone; never use midnight. Only set trigger_date for date triggers; leave it null for person/location/context triggers. Resolve relative dates ("tomorrow", "next Friday", "in two weeks") using the CURRENT DATE given in the user message, in the user's timezone. Output dates as ISO 8601 WITH a timezone offset.
AGENT 5 - ENTITY EXTRACTION: List all entities (people, places, organizations, topics) with their types. Use the fullest name available for each entity and be consistent.
AGENT 6 - PRIVACY: Score content sensitivity 0-1. Mark is_private true for passwords, card numbers, one-time codes, medical or other highly sensitive details. NEVER copy secrets such as passwords, full card numbers or OTP codes into the title or summary.

The title should be specific and searchable, written the way the user would later describe it (e.g. "Stripe pricing: 0.5% on standard volume" or "Pencil sketch of a girl scribbling under a colorful ceiling", not "Pricing note" or "Screenshot").

Respond ONLY with valid JSON in this exact format:
{
  "structured_event": {
    "title": "Brief, specific title",
    "summary": "2-3 sentence summary",
    "event_date": "ISO date if mentioned or null",
    "location": "location if mentioned or null",
    "participants": ["list", "of", "people"],
    "topics": ["topic1", "topic2"],
    "salience_score": 0.7,
    "emotional_tone": "neutral/positive/negative/excited/concerned",
    "is_private": false
  },
  "intent": {
    "detected": true/false,
    "intent_text": "what the user intends to do",
    "trigger_type": "date/location/context/person",
    "trigger_value": "specific trigger value",
    "trigger_date": "ISO date if applicable or null",
    "priority": 0.8
  },
  "entities": [
    {"name": "Entity Name", "entity_type": "person/place/topic/organization", "attributes": {}}
  ],
  "relationships": [
    {"entity_a": "Name A", "entity_b": "Name B", "relationship_type": "works_with/friends_with/located_at/related_to"}
  ]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = adminClient();
  let memoryId: string | undefined;

  try {
    const caller = await authenticate(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);
    if (!lovableKey()) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    memoryId = body?.memoryId;
    // force = re-read a memory that was already processed (e.g. a screenshot made before images
    // were described properly). Its old derived rows are replaced so nothing is duplicated.
    const force = body?.force === true;
    if (!memoryId) return json({ error: "Memory ID is required" }, 400);

    const { data: memory, error: fetchError } = await supabase
      .from("raw_memories")
      .select("*")
      .eq("id", memoryId)
      .single();

    if (fetchError || !memory) {
      memoryId = undefined; // nothing to mark as failed
      return json({ error: "Memory not found" }, 404);
    }

    // A user may only process their own memories
    if (caller.kind === "user" && caller.userId !== memory.user_id) {
      memoryId = undefined;
      return json({ error: "Forbidden" }, 403);
    }

    if (force) {
      await supabase.from("pending_intents").delete().eq("raw_memory_id", memoryId);
      await supabase.from("structured_events").delete().eq("raw_memory_id", memoryId); // cascades to search rows
    } else if (memory.status === "processed") {
      // Idempotency: don't double-process (double clicks, queue retries)
      return json({ success: true, skipped: true });
    }

    await supabase.from("raw_memories").update({ status: "processing" }).eq("id", memoryId);

    // ---- Step 0: a voice note saved by a quick-capture channel is transcribed here, not at save time ----
    const audioPath = (memory.metadata as any)?.audio_path as string | undefined;
    if (audioPath) {
      const { data: audio, error: aErr } = await supabase.storage.from("memory-media").download(audioPath);
      if (aErr || !audio) throw new Error(`Could not load the voice note from storage (${aErr?.message ?? "no file"})`);
      const t = await transcribeAudio(bytesToBase64(new Uint8Array(await audio.arrayBuffer())), (memory.metadata as any)?.audio_mime || audio.type);
      if (!t.ok) throw new Error(`Transcription failed (${t.status})`);
      if (!t.text) throw new Error("No speech was detected in the voice note");
      const screened = screenText(t.text);
      if (screened.skip) { // never keep one-time codes or keys, not even as audio
        await supabase.from("raw_memories").delete().eq("id", memoryId);
        await supabase.storage.from("memory-media").remove([audioPath]);
        memoryId = undefined;
        return json({ success: true, skipped: "sensitive" });
      }
      const { audio_path: _a, audio_mime: _m, ...rest } = (memory.metadata as any) ?? {};
      memory.metadata = { ...rest, transcribed: true };
      memory.raw_content = screened.text;
      await supabase.from("raw_memories").update({ raw_content: memory.raw_content, metadata: memory.metadata }).eq("id", memoryId);
      await supabase.storage.from("memory-media").remove([audioPath]); // the words are kept, the recording is not
    }

    // ---- Step 1: understand the image (if any) ------------------------------------------
    let imageText = "";
    let imageDescription = "";

    if (memory.media_url) {
      const { data: file, error: dlError } = await supabase.storage.from("memory-media").download(memory.media_url);
      if (dlError || !file) {
        // A screenshot memory without its image is useless: fail loudly so it can be retried
        throw new Error(`Could not load the image from storage (${dlError?.message ?? "no file"})`);
      }
      const mime = file.type || "image/png";
      const b64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));

      const visionRes = await chatCompletion(CHAT_MODEL, [
        { role: "system", content: VISION_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: memory.raw_content && memory.raw_content !== "[Screenshot]"
                ? `The owner's own note about this image: ${memory.raw_content}`
                : "Describe this image.",
            },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ], { temperature: 0.2, timeoutMs: 75_000 });

      if (!visionRes.ok) {
        console.error("vision call failed:", visionRes.status, (await visionRes.text()).slice(0, 300));
        throw new Error(`Image analysis failed (${visionRes.status})`);
      }
      const visionData = await visionRes.json();
      const understood = parseImageUnderstanding(visionData.choices?.[0]?.message?.content ?? "");
      imageText = understood.text;
      imageDescription = understood.description;
      if (!imageText && !imageDescription) throw new Error("Image analysis returned nothing");

      await supabase
        .from("raw_memories")
        .update({
          metadata: { ...(memory.metadata || {}), extracted_text: imageText, image_description: imageDescription },
        })
        .eq("id", memoryId);
    }

    // ---- Step 2: structure it -----------------------------------------------------------
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", memory.user_id)
      .maybeSingle();
    const tz = profile?.timezone || "UTC";
    const observed = new Date((memory.metadata as any)?.client_timestamp || memory.captured_at || Date.now());
    const observedAt = Number.isNaN(observed.getTime()) ? new Date() : observed;
    const nowText = `${formatNow(observedAt, tz)} (timezone: ${tz})`;

    const userNote = memory.raw_content === "[Screenshot]" ? "" : memory.raw_content;
    const memoryText = [
      `Source: ${memory.source}`,
      userNote ? `Content: ${userNote}` : memory.media_url ? "Content: (image only, no caption)" : `Content: ${memory.raw_content}`,
      imageDescription ? `IMAGE DESCRIPTION: ${imageDescription}` : "",
      imageText ? `IMAGE TEXT: ${imageText}` : "",
      `Metadata: ${JSON.stringify({ ...(memory.metadata || {}), extracted_text: undefined, image_description: undefined })}`,
    ].filter(Boolean).join("\n");

    const aiResponse = await chatCompletion(CHAT_MODEL, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `CURRENT DATE: ${nowText}\n\nProcess this memory:\n\n${memoryText}` },
    ], { temperature: 0.2, timeoutMs: 60_000 });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI processing failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const responseContent: string = aiData.choices?.[0]?.message?.content ?? "";

    let parsed: any;
    try {
      let jsonStr = responseContent;
      const m = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) jsonStr = m[1].trim();
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fall back to what we know. For an image that is its description, so it stays findable.
      const base = imageDescription || userNote || memory.raw_content;
      parsed = {
        structured_event: {
          title: base.slice(0, 60) + (base.length > 60 ? "..." : ""),
          summary: base.slice(0, 300),
          salience_score: 0.5,
          emotional_tone: "neutral",
          is_private: false,
          participants: [],
          topics: [],
        },
        intent: { detected: false },
        entities: [],
        relationships: [],
      };
    }

    const ev = parsed.structured_event ?? {};

    // Structured event (we need its id for the search index)
    const { data: eventRow, error: eventError } = await supabase
      .from("structured_events")
      .insert([{
        user_id: memory.user_id,
        raw_memory_id: memoryId,
        title: ev.title || "Untitled Memory",
        summary: ev.summary,
        event_date: safeDate(ev.event_date),
        location: ev.location,
        participants: ev.participants || [],
        topics: ev.topics || [],
        salience_score: ev.salience_score ?? 0.5,
        emotional_tone: ev.emotional_tone,
        is_private: ev.is_private || false,
      }])
      .select("id")
      .single();

    if (eventError || !eventRow) {
      console.error("Error inserting structured event:", eventError);
      throw new Error("Failed to save structured event");
    }

    // Search index: combined searchable text + embedding (the image description is included verbatim)
    const searchText = buildSearchText([
      ev.title,
      ev.summary,
      imageDescription,
      imageText,
      (ev.participants || []).join(", "),
      (ev.topics || []).join(", "),
      ev.location,
      userNote,
    ]);

    const embedded = await embed(searchText, "RETRIEVAL_DOCUMENT");
    const { error: vecError } = await supabase.from("memory_vectors").upsert(
      {
        user_id: memory.user_id,
        structured_event_id: eventRow.id,
        raw_memory_id: memoryId,
        content_text: searchText,
        embedding: embedded ? toPgVector(embedded.vector) : null,
        embedding_model: embedded ? embedded.model : null,
        platform: memory.platform,
        app_package: memory.app_package,
        capture_type: memory.capture_type,
      },
      { onConflict: "structured_event_id" },
    );
    if (vecError) console.error("Error indexing memory:", vecError);

    // Intent
    if (parsed.intent?.detected && parsed.intent.intent_text) {
      const { error: intentError } = await supabase.from("pending_intents").insert([{
        user_id: memory.user_id,
        raw_memory_id: memoryId,
        structured_event_id: eventRow.id,
        intent_text: parsed.intent.intent_text,
        trigger_type: parsed.intent.trigger_type || "context",
        trigger_value: parsed.intent.trigger_value,
        trigger_date: safeDate(parsed.intent.trigger_date),
        priority: parsed.intent.priority || 0.5,
        status: "pending",
      }]);
      if (intentError) console.error("Error inserting intent:", intentError);
    }

    // Entities
    for (const entity of parsed.entities || []) {
      const name = String(entity?.name ?? "").trim();
      const type = String(entity?.entity_type ?? "").trim();
      if (!name || !type) continue;

      const { data: existing } = await supabase
        .from("entities")
        .select("id, mention_count")
        .eq("user_id", memory.user_id)
        .ilike("name", name.replace(/[%_]/g, "\\$&"))
        .eq("entity_type", type)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("entities")
          .update({ mention_count: (existing.mention_count || 1) + 1, last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("entities").insert([{
          user_id: memory.user_id,
          name,
          entity_type: type,
          attributes: entity.attributes || {},
        }]);
      }
    }

    // Relationships
    for (const rel of parsed.relationships || []) {
      const a = String(rel?.entity_a ?? "").trim();
      const b = String(rel?.entity_b ?? "").trim();
      if (!a || !b || a.toLowerCase() === b.toLowerCase()) continue;

      const find = (n: string) =>
        supabase
          .from("entities")
          .select("id")
          .eq("user_id", memory.user_id)
          .ilike("name", n.replace(/[%_]/g, "\\$&"))
          .limit(1)
          .maybeSingle();
      const [{ data: entityA }, { data: entityB }] = await Promise.all([find(a), find(b)]);
      if (!entityA || !entityB) continue;

      const relType = rel.relationship_type || "related_to";
      const { data: existingRel } = await supabase
        .from("entity_relationships")
        .select("id, strength")
        .eq("user_id", memory.user_id)
        .eq("entity_a_id", entityA.id)
        .eq("entity_b_id", entityB.id)
        .eq("relationship_type", relType)
        .maybeSingle();

      if (existingRel) {
        await supabase
          .from("entity_relationships")
          .update({ strength: Math.min((existingRel.strength || 1) + 0.5, 10), last_seen_at: new Date().toISOString() })
          .eq("id", existingRel.id);
      } else {
        await supabase.from("entity_relationships").insert([{
          user_id: memory.user_id,
          entity_a_id: entityA.id,
          entity_b_id: entityB.id,
          relationship_type: relType,
          strength: 1,
        }]);
      }
    }

    await supabase.from("raw_memories").update({ status: "processed" }).eq("id", memoryId);
    return json({ success: true, indexed: !!embedded, embedding_model: embedded?.model ?? null });
  } catch (error) {
    console.error("Error processing memory:", error);
    if (memoryId) {
      await supabase.from("raw_memories").update({ status: "failed" }).eq("id", memoryId);
    }
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
