let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (extra ? " :: " + extra : "")); if (!ok) fails++; };

// ---- mock gateway + mock gemini ----
let mode = "";
const seen: { path: string; auth: string | null; key: string | null; body: any }[] = [];
const vec = (n: number, seed = 1) => Array.from({ length: n }, (_, i) => Math.sin(i * seed) * 5 + 2); // deliberately NOT normalized
Deno.serve({ port: 8123, onListen() {} }, async (req) => {
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => null) : null;
  seen.push({ path: url.pathname, auth: req.headers.get("authorization"), key: req.headers.get("x-goog-api-key"), body });
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (url.pathname === "/v1/embeddings") {
    switch (mode) {
      case "openai3072": return J({ data: [{ index: 0, embedding: vec(3072) }] });
      case "exact768": return J({ data: [{ embedding: vec(768) }] });
      case "rejectDims": return body?.dimensions ? J({ error: { message: "dimensions is not supported for this model" } }, 400) : J({ data: [{ embedding: vec(1536) }] });
      case "short": return J({ data: [{ embedding: vec(256) }] });
      case "altShape": return J({ embeddings: [{ values: vec(1024) }] });
      case "nonjson": return new Response("<html>oops</html>", { status: 200 });
      case "boom": return J({ error: "upstream" }, 500);
      case "noCredits": return J({ error: "payment required" }, 402);
    }
  }
  if (url.pathname.endsWith(":embedContent")) return J({ embedding: { values: vec(768, 2) } });
  return J({}, 404);
});

Deno.env.set("AI_GATEWAY_URL", "http://localhost:8123/v1");
Deno.env.set("GEMINI_API_BASE", "http://localhost:8123/v1beta");
const { embedWithDiagnostics, toPgVector, EMBEDDING_DIMS } = await import("./fn/_shared/embeddings.ts");
const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const reset = (m: string) => { mode = m; seen.length = 0; };

Deno.env.set("LOVABLE_API_KEY", "test-key");
Deno.env.delete("GEMINI_API_KEY");

// 1
reset("openai3072");
let r = await embedWithDiagnostics("hello world", "RETRIEVAL_DOCUMENT");
check("3072-dim reply is cut to 768", r.ok && r.vector.length === EMBEDDING_DIMS);
check("…and re-normalized to unit length", r.ok && Math.abs(norm(r.vector) - 1) < 1e-9, r.ok ? String(norm(r.vector)) : "");
check("tagged as lovable model @768", r.ok && r.model === "lovable:google/gemini-embedding-2@768" && r.provider === "lovable", r.ok ? r.model : "");
check("sends bearer key, model, input and dimensions", seen[0].auth === "Bearer test-key" && seen[0].body.model === "google/gemini-embedding-2" && seen[0].body.input === "hello world" && seen[0].body.dimensions === 768);
// 2
reset("exact768"); r = await embedWithDiagnostics("x", "RETRIEVAL_QUERY");
check("exact 768 accepted + normalized", r.ok && r.vector.length === 768 && Math.abs(norm(r.vector) - 1) < 1e-9);
// 3
reset("rejectDims"); r = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("gateway rejects `dimensions` -> retried without it and succeeded", r.ok && r.vector.length === 768 && seen.length === 2 && !("dimensions" in seen[1].body), `requests=${seen.length}`);
// 4
reset("altShape"); r = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("alternate response shape (embeddings[0].values) understood", r.ok && r.vector.length === 768);
// 5
reset("short"); r = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("too-short vector rejected with a clear reason", !r.ok && /length 256/.test(r.error), !r.ok ? r.error : "");
// 6
reset("nonjson"); r = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("non-JSON reply handled, no throw", !r.ok && /non-JSON/.test(r.error), !r.ok ? r.error : "");
// 7
reset("noCredits"); r = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("402 surfaced in the error text", !r.ok && /402/.test(r.error), !r.ok ? r.error : "");
// 8: gateway down, gemini key present -> fallback
Deno.env.set("GEMINI_API_KEY", "g-key");
reset("boom"); r = await embedWithDiagnostics("x", "RETRIEVAL_QUERY");
check("gateway 500 + GEMINI_API_KEY -> falls back to Gemini", r.ok && r.provider === "gemini" && r.model === "gemini:gemini-embedding-001@768");
check("gemini call carries key + task type + 768 dims", seen.some((s) => s.key === "g-key" && s.body?.taskType === "RETRIEVAL_QUERY" && s.body?.outputDimensionality === 768));
// 9: models are tagged differently so they are never compared
reset("exact768"); const a = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT"); reset("boom"); const b = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("gateway vs gemini vectors get DIFFERENT model tags", a.ok && b.ok && a.model !== b.model);
// 10: nothing works
Deno.env.delete("GEMINI_API_KEY"); reset("boom"); r = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("gateway down, no gemini key -> clean failure with reason", !r.ok && /gateway 500/.test(r.error), !r.ok ? r.error : "");
Deno.env.delete("LOVABLE_API_KEY"); reset("openai3072"); r = await embedWithDiagnostics("x", "RETRIEVAL_DOCUMENT");
check("no keys at all -> says which key is missing, makes no network call", !r.ok && /LOVABLE_API_KEY is not set/.test(r.error) && seen.length === 0, !r.ok ? r.error : "");
Deno.env.set("LOVABLE_API_KEY", "test-key");
r = await embedWithDiagnostics("   ", "RETRIEVAL_DOCUMENT");
check("blank text rejected without a request", !r.ok && /empty/.test(r.error));
check("toPgVector format", toPgVector([0.5, -1, 2]) === "[0.5,-1,2]");

console.log(fails ? `\n${fails} FAILED` : "\nALL EMBEDDING CHECKS PASSED");
Deno.exit(fails ? 1 : 0);
