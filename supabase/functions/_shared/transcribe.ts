import { chatCompletion, CHAT_MODEL } from "./ai.ts";

/** Map a mime type to the audio formats the model accepts. */
export function normalizeAudioFormat(mimeType: string | undefined): string {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("flac")) return "flac";
  return "webm";
}

export type Transcription =
  | { ok: true; text: string; format: string; model: string }
  | { ok: false; status: number; error: string };

const SYSTEM_PROMPT =
  "You are a high-accuracy speech-to-text transcriber. Transcribe the user's audio verbatim in the same language they spoke. " +
  "Preserve names, numbers, dates, times, and proper nouns exactly. Add natural punctuation and capitalization. " +
  "Do NOT translate, summarize, paraphrase, add commentary, or wrap the result in quotes/markdown. " +
  "If the audio is silent or unintelligible, return an empty string.";

export async function transcribeAudio(base64Audio: string, mimeType?: string, context?: string): Promise<Transcription> {
  const format = normalizeAudioFormat(mimeType);
  const userText = context
    ? `Transcribe the audio. Context (may help disambiguate names/terms): ${context}`
    : "Transcribe the audio.";
  const response = await chatCompletion(CHAT_MODEL, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: [{ type: "text", text: userText }, { type: "input_audio", input_audio: { data: base64Audio, format } }] },
  ], { temperature: 0, timeoutMs: 90_000 });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    if (response.status === 429) return { ok: false, status: 429, error: "Rate limit exceeded. Please try again in a moment." };
    if (response.status === 402) return { ok: false, status: 402, error: "AI credits exhausted. Please add credits to continue." };
    return { ok: false, status: 500, error: `AI transcription failed: ${response.status}` };
  }
  const data = await response.json();
  let text: string = data.choices?.[0]?.message?.content?.trim() || "";
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  return { ok: true, text, format, model: CHAT_MODEL };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
