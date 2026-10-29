// Embeddings for semantic search (768 dimensions, to match memory_vectors.embedding).
//
// Provider order:
//   1. Lovable AI Gateway  (uses LOVABLE_API_KEY, which already exists: no extra setup)
//   2. Gemini API directly (only if GEMINI_API_KEY is set)
// If both fail, embed() returns null and search quietly falls back to keyword matching.
//
// Every vector is tagged with the model that made it; vectors from different models are not
// comparable, so the SQL only ever compares a query against vectors with the same tag.
import { AI_GATEWAY_URL, EMBED_MODEL, lovableKey } from "./ai.ts";

export const EMBEDDING_DIMS = 768;
const GEMINI_BASE = Deno.env.get("GEMINI_API_BASE") || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_DIRECT_MODEL = "gemini-embedding-001";

export interface Embedded {
  vector: number[];
  /** Stored in memory_vectors.embedding_model, e.g. "lovable:google/gemini-embedding-2@768" */
  model: string;
  provider: "lovable" | "gemini";
}
export type EmbedOutcome = ({ ok: true } & Embedded) | { ok: false; error: string };

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Fit any vector to 768 dims. Gemini embeddings are Matryoshka-trained, so truncating then
 *  re-normalizing is the supported way to shrink them. Shorter than 768 is unusable. */
function fit(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length < EMBEDDING_DIMS) return null;
  const nums = (values as unknown[]).map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return normalize(nums.slice(0, EMBEDDING_DIMS));
}

/** Accepts OpenAI-style, and a couple of other common response shapes. */
function extractVector(body: any): unknown {
  return (
    body?.data?.[0]?.embedding ??
    body?.embeddings?.[0]?.values ??
    body?.embeddings?.[0]?.vector ??
    body?.embeddings?.[0] ??
    body?.embedding?.values ??
    body?.embedding
  );
}

async function viaGateway(text: string): Promise<EmbedOutcome> {
  const key = lovableKey();
  if (!key) return { ok: false, error: "LOVABLE_API_KEY is not set" };

  const call = (withDimensions: boolean) =>
    fetch(`${AI_GATEWAY_URL}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text,
        ...(withDimensions ? { dimensions: EMBEDDING_DIMS } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });

  try {
    let res = await call(true);
    let raw = await res.text();
    // Some gateways reject the optional `dimensions` field: retry once without it
    if (!res.ok && (res.status === 400 || res.status === 422) && /dimension/i.test(raw)) {
      res = await call(false);
      raw = await res.text();
    }
    if (!res.ok) return { ok: false, error: `gateway ${res.status}: ${raw.slice(0, 160)}` };

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, error: "gateway returned non-JSON" };
    }
    const raw768 = extractVector(body);
    const vector = fit(raw768);
    if (!vector) {
      const len = Array.isArray(raw768) ? raw768.length : "none";
      return { ok: false, error: `gateway returned an unusable vector (length ${len}, need ≥ ${EMBEDDING_DIMS})` };
    }
    return { ok: true, vector, provider: "lovable", model: `lovable:${EMBED_MODEL}@${EMBEDDING_DIMS}` };
  } catch (e) {
    return { ok: false, error: `gateway error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function viaGemini(text: string, taskType: string): Promise<EmbedOutcome> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { ok: false, error: "GEMINI_API_KEY is not set" };
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${GEMINI_DIRECT_MODEL}:embedContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMS,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, error: `gemini ${res.status}: ${(await res.text()).slice(0, 160)}` };
    const vector = fit(extractVector(await res.json()));
    if (!vector) return { ok: false, error: "gemini returned an unusable vector" };
    return { ok: true, vector, provider: "gemini", model: `gemini:${GEMINI_DIRECT_MODEL}@${EMBEDDING_DIMS}` };
  } catch (e) {
    return { ok: false, error: `gemini error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Full outcome incl. the reason for failure (used by the search-status diagnostics). */
export async function embedWithDiagnostics(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT",
): Promise<EmbedOutcome> {
  const clipped = text.slice(0, 8000);
  if (!clipped.trim()) return { ok: false, error: "empty text" };

  const first = await viaGateway(clipped);
  if (first.ok) return first;

  const second = await viaGemini(clipped, taskType);
  if (second.ok) return second;

  // Report the most informative error: the one from a provider that is actually configured
  const configuredGemini = !!Deno.env.get("GEMINI_API_KEY");
  return { ok: false, error: configuredGemini ? `${first.error}; ${second.error}` : first.error };
}

export async function embed(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<Embedded | null> {
  const out = await embedWithDiagnostics(text, taskType);
  if (out.ok) return out;
  console.error("embedding unavailable:", out.error);
  return null;
}

/** pgvector accepts the '[0.1,0.2,...]' text form through PostgREST. */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
