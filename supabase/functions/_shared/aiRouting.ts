// Pure routing helpers for the AI brain: no Deno APIs here, so the browser test suite
// can import this file as well as the edge functions.

export type ChatRoute = "nvidia" | "gateway";

/** True when a message carries an image or audio part: NVIDIA text models can't take those. */
export function messagesUseMedia(messages: unknown[]): boolean {
  try {
    const s = JSON.stringify(messages);
    return s.includes('"image_url"') || s.includes('"input_audio"');
  } catch {
    return true;
  }
}

/** Gemini gateway model names that mark a cheap/fast tier (note: plain "flash" is the main chat tier). */
export function isFastModel(model: string): boolean {
  return /lite|mini|nano|small|fast/i.test(model);
}

/**
 * Where a chat call should go. NVIDIA NIM (the owner's own NVIDIA credits) serves plain-text
 * chat; vision and audio always go to the gateway, and a missing NVIDIA key means gateway.
 */
export function pickChatRoute(messages: unknown[], hasNvidiaKey: boolean): ChatRoute {
  if (!hasNvidiaKey) return "gateway";
  if (messagesUseMedia(messages)) return "gateway";
  return "nvidia";
}
