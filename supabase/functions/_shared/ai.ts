// One place for AI endpoints and model names.
// Lovable now marks the Gemini 2.5 chat models as "deprecated": they keep working for existing
// apps, but when you want to move on, set these as Edge Function secrets instead of editing code:
//   AI_CHAT_MODEL, AI_FAST_MODEL, AI_EMBED_MODEL   (e.g. google/gemini-3.8-flash)
export const AI_GATEWAY_URL = Deno.env.get("AI_GATEWAY_URL") || "https://ai.gateway.lovable.dev/v1";
export const CHAT_MODEL = Deno.env.get("AI_CHAT_MODEL") || "google/gemini-2.5-flash";
export const FAST_MODEL = Deno.env.get("AI_FAST_MODEL") || "google/gemini-2.5-flash-lite";
export const EMBED_MODEL = Deno.env.get("AI_EMBED_MODEL") || "google/gemini-embedding-2";

export function lovableKey(): string | undefined {
  return Deno.env.get("LOVABLE_API_KEY") || undefined;
}

/** Chat completion with a hard timeout so a stuck model call can't hang the function. */
export function chatCompletion(
  model: string,
  messages: unknown[],
  opts: { temperature?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const key = lovableKey();
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return fetch(`${AI_GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: opts.temperature }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
}
