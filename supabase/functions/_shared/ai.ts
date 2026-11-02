// One place for AI endpoints and model names.
// Lovable now marks the Gemini 2.5 chat models as "deprecated": they keep working for existing
// apps, but when you want to move on, set these as Edge Function secrets instead of editing code:
//   AI_CHAT_MODEL, AI_FAST_MODEL, AI_EMBED_MODEL   (e.g. google/gemini-3.8-flash)
// Plain-text chat first tries the owner's own NVIDIA NIM account (NVIDIA_API_KEY) so gateway
// credits are spent mainly on vision and audio. Vision/audio calls, and any NVIDIA failure,
// fall back to the gateway.
import { isFastModel, messagesUseMedia } from "./aiRouting.ts";

export const AI_GATEWAY_URL = Deno.env.get("AI_GATEWAY_URL") || "https://ai.gateway.lovable.dev/v1";
export const CHAT_MODEL = Deno.env.get("AI_CHAT_MODEL") || "google/gemini-2.5-flash";
export const FAST_MODEL = Deno.env.get("AI_FAST_MODEL") || "google/gemini-2.5-flash-lite";
export const EMBED_MODEL = Deno.env.get("AI_EMBED_MODEL") || "google/gemini-embedding-2";

// NVIDIA NIM (build.nvidia.com) is OpenAI-compatible. Override the models with secrets if wanted:
//   NVIDIA_CHAT_MODEL, NVIDIA_FAST_MODEL   (e.g. nvidia/llama-3.3-nemotron-super-49b-v1)
export const NVIDIA_BASE = Deno.env.get("NVIDIA_API_BASE") || "https://integrate.api.nvidia.com/v1";
export const NVIDIA_CHAT_MODEL = Deno.env.get("NVIDIA_CHAT_MODEL") || "meta/llama-3.3-70b-instruct";
export const NVIDIA_FAST_MODEL = Deno.env.get("NVIDIA_FAST_MODEL") || "meta/llama-3.1-8b-instruct";

export function lovableKey(): string | undefined {
  return Deno.env.get("LOVABLE_API_KEY") || undefined;
}

export function nvidiaKey(): string | undefined {
  return Deno.env.get("NVIDIA_API_KEY") || undefined;
}

/** Chat completion on the Gemini gateway with a hard timeout so a stuck call can't hang the function. */
function gatewayChat(
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

/** Chat completion with a hard timeout so a stuck model call can't hang the function. */
export async function chatCompletion(
  model: string,
  messages: unknown[],
  opts: { temperature?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const key = nvidiaKey();
  if (key && !messagesUseMedia(messages)) {
    const nvidiaModel = isFastModel(model) ? NVIDIA_FAST_MODEL : NVIDIA_CHAT_MODEL;
    try {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: nvidiaModel, messages, temperature: opts.temperature }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      if (res.ok) return res;
      // Free the socket, then let the gateway answer instead.
      await res.text().catch(() => {});
      console.error(`nvidia ${nvidiaModel} answered ${res.status}; falling back to gateway ${model}`);
    } catch (e) {
      console.error("nvidia request failed; falling back to gateway", e);
    }
  }
  return gatewayChat(model, messages, opts);
}
