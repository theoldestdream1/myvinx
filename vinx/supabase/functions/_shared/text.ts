// Small pure helpers (no I/O) so they can be unit-tested.

/** The vision step answers in a fixed two-part format; tolerate models that drift from it. */
export function parseImageUnderstanding(raw: string): { text: string; description: string } {
  const cleaned = (raw || "").replace(/^```[a-z]*\s*|```$/gim, "").trim();
  const m = cleaned.match(/VISIBLE TEXT:\s*([\s\S]*?)\s*DESCRIPTION:\s*([\s\S]*)$/i);
  if (m) {
    const text = m[1].trim();
    return {
      text: /^(none|n\/a|no (visible )?text\.?)$/i.test(text) ? "" : text,
      description: m[2].trim(),
    };
  }
  // Model ignored the format: treat everything as the description (still searchable)
  const only = cleaned.match(/DESCRIPTION:\s*([\s\S]*)$/i);
  return { text: "", description: (only ? only[1] : cleaned).trim() };
}

/** Which numbered memories did the answer cite? Handles [1], [2][3], and [1, 3]. */
export function extractCitations(answer: string, max: number): number[] {
  const found = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g)) {
    for (const n of m[1].split(/[,;]/)) {
      const v = parseInt(n.trim(), 10);
      if (v >= 1 && v <= max) found.add(v);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Searchable text for one memory: most descriptive fields first, empty ones dropped. */
export function buildSearchText(parts: Array<string | null | undefined>, limit = 8000): string {
  return parts
    .filter((s): s is string => !!s && String(s).trim().length > 0)
    .map((s) => s.trim())
    .join("\n")
    .slice(0, limit);
}
