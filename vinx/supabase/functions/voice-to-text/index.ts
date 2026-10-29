import { corsHeaders, json } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { lovableKey } from "../_shared/ai.ts";
import { transcribeAudio } from "../_shared/transcribe.ts";



// ~60s of 64kbps Opus is well under 1 MB; cap generously to stop abuse.
const MAX_BASE64_CHARS = 10_000_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Only signed-in users may spend transcription credits
    const caller = await authenticate(req);
    if (!caller) return json({ error: "Unauthorized", text: "" }, 401);

    if (!lovableKey()) throw new Error("LOVABLE_API_KEY is not configured");

    const { audio, mimeType, context } = await req.json();
    if (!audio) throw new Error("No audio data provided");
    if (typeof audio !== "string" || audio.length > MAX_BASE64_CHARS) {
      return json({ error: "Audio is too large", text: "" }, 413);
    }

    const result = await transcribeAudio(audio, mimeType, context);
    if (!result.ok) {
      if (result.status === 429 || result.status === 402) return json({ error: result.error, text: "" }, result.status);
      throw new Error(result.error);
    }

    return json({ text: result.text, model: result.model, format: result.format });
  } catch (error) {
    console.error("Voice-to-text error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error", text: "" }, 500);
  }
});
