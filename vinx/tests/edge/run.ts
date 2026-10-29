import { DB, rpcLog } from "./fakedb.ts";
let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (extra ? "  :: " + extra : "")); if (!ok) fails++; };

// ---------------- mock AI gateway ----------------
const G = { vision: "ok" as "ok" | "fail" | "noformat", structure: "ok" as "ok" | "garbage", embedDown: false };
const calls: { kind: string; hasImage: boolean; user: string; mime?: string }[] = [];
const hashEmbed = (t: string) => { const v = new Array(768).fill(0); for (const w of t.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 768] += 1; } const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const reply = (content: string) => J({ choices: [{ message: { content } }] });

Deno.serve({ port: 8124, onListen() {} }, async (req) => {
  const url = new URL(req.url); const body = await req.json();
  if (url.pathname === "/v1/embeddings") return G.embedDown ? J({ error: "down" }, 503) : J({ data: [{ embedding: hashEmbed(String(body.input)) }] });
  const sys: string = body.messages[0].content; const last = body.messages[body.messages.length - 1].content;
  const userText = typeof last === "string" ? last : last.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
  const img = Array.isArray(last) ? last.find((p: any) => p.type === "image_url") : null;
  if (sys.startsWith("You describe images")) {
    calls.push({ kind: "vision", hasImage: !!img, user: userText, mime: img?.image_url?.url?.slice(5, img.image_url.url.indexOf(";")) });
    if (G.vision === "fail") return J({ error: "upstream" }, 500);
    if (G.vision === "noformat") return reply("A black and white sketch of a girl scribbling, staring up at a rainbow ceiling.");
    return reply("VISIBLE TEXT: none\nDESCRIPTION: A black-and-white pencil sketch of a girl scribbling on paper while looking up at a ceiling painted in bright, multicolored patterns. Her eyes are the same color as the ceiling.");
  }
  if (sys.startsWith("You are a memory processing AI")) {
    calls.push({ kind: "structure", hasImage: !!img, user: userText });
    if (G.structure === "garbage") return reply("Sorry, I cannot produce JSON right now.");
    const isImg = userText.includes("IMAGE DESCRIPTION:");
    return reply(JSON.stringify({ structured_event: { title: isImg ? "Pencil sketch of a girl scribbling under a colorful ceiling" : "Call the dentist", summary: isImg ? "Black-and-white drawing of a girl looking up at a multicolored ceiling." : "Call the dentist tomorrow.", event_date: null, location: null, participants: [], topics: isImg ? ["drawing"] : ["health"], salience_score: 0.7, emotional_tone: "neutral", is_private: false }, intent: { detected: false }, entities: [], relationships: [] }));
  }
  if (sys.startsWith("You prepare search queries")) { calls.push({ kind: "rewrite", hasImage: false, user: userText }); return reply(JSON.stringify({ search_text: "drawing sketch girl scribbling colorful multicolored ceiling eyes", date_from: null, date_to: null })); }
  if (sys.startsWith("You are Vinx")) {
    calls.push({ kind: "answer", hasImage: false, user: userText });
    const blocks = [...userText.matchAll(/\[(\d+)\] \([^\n]*\)\n([\s\S]*?)(?=\n\n\[\d+\] \(|\n\nOTHER RECENT|\n\nOPEN INTENTS|$)/g)];
    const hit = blocks.find((b) => /scribbl/i.test(b[2]));
    return reply(hit ? `That's the black-and-white pencil sketch of a girl scribbling [${hit[1]}].` : "I don't have any memories that match that description.");
  }
  return J({}, 404);
});

Deno.env.set("AI_GATEWAY_URL", "http://localhost:8124/v1");
Deno.env.set("LOVABLE_API_KEY", "k");
Deno.env.delete("GEMINI_API_KEY");

const load = async (name: string) => { await import(`./fn/${name}/index.ts`); return (globalThis as any).__lastHandler as (r: Request) => Promise<Response>; };
const processMemory = await load("process-memory");
const queryMemories = await load("query-memories");
const reindex = await load("reindex-memories");
const status = await load("search-status");
const worker = await load("process-ingestion-queue");
(globalThis as any).__handlers = { "process-memory": processMemory };

const post = (h: (r: Request) => Promise<Response>, auth: string | null, body: unknown) =>
  h(new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) }));
const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: "image/png" });
let n = 0;
const addShot = (user: string, status = "pending", content = "[Screenshot]") => {
  const id = `m${++n}`; const path = `${user}/shot${n}.png`; DB.files.set(path, png());
  DB.t.raw_memories.push({ id, user_id: user, source: "image", raw_content: content, media_url: path, status, platform: "web", captured_at: new Date().toISOString(), created_at: new Date(Date.now() + n).toISOString(), metadata: {} });
  return id;
};
const mem = (id: string) => DB.t.raw_memories.find((m) => m.id === id)!;
const ev = (id: string) => DB.t.structured_events.find((e) => e.raw_memory_id === id);
const vec = (id: string) => DB.t.memory_vectors.find((v) => v.raw_memory_id === id);
const ask = async (q: string, who = "Bearer user-A") => { const r = await post(queryMemories, who, { query: q }); return { status: r.status, body: await r.json() }; };
const Q1 = "black and white scribbling girl looking at a colorful ceiling, her eyes match the ceiling's color";

console.log("\n=== S1: screenshot -> processed (vision step + structuring step, embeddings working) ===");
const s1 = addShot("UA");
let r = await post(processMemory, "Bearer user-A", { memoryId: s1 });
check("process-memory returns 200", r.status === 200, String(r.status));
check("memory marked processed", mem(s1).status === "processed");
const k = calls.filter((c) => c.kind === "vision" || c.kind === "structure");
check("exactly 2 AI calls: vision then structuring", k.length === 2 && k[0].kind === "vision" && k[1].kind === "structure");
check("vision call received the actual image (png data URL)", k[0].hasImage && k[0].mime === "image/png", k[0].mime);
check("structuring call got the DESCRIPTION as text, not the image", !k[1].hasImage && k[1].user.includes("IMAGE DESCRIPTION: A black-and-white pencil sketch"));
check("[Screenshot] placeholder not passed off as the owner's note", !k[1].user.includes("Content: [Screenshot]") && k[1].user.includes("image only, no caption"));
check("image description saved in metadata", /pencil sketch of a girl scribbling/.test(mem(s1).metadata.image_description ?? ""));
check("event title describes the picture", /scribbling under a colorful ceiling/.test(ev(s1)?.title ?? ""));
check("search text contains the full visual description", /multicolored patterns/.test(vec(s1)?.content_text ?? ""));
check("embedding stored with its model tag", !!vec(s1)?.embedding && vec(s1)?.embedding_model === "lovable:google/gemini-embedding-2@768", String(vec(s1)?.embedding_model));

console.log("\n=== S2: YOUR QUERY, embeddings working ===");
let a = await ask(Q1);
check("answer found it and cites the memory", a.status === 200 && /pencil sketch/.test(a.body.response) && /\[\d\]/.test(a.body.response), a.body.response);
check("source card returned with a signed screenshot URL", a.body.sources.length === 1 && a.body.sources[0].image_url?.startsWith("https://signed.example/UA/"));
check("sources labelled as cited", a.body.sources_kind === "cited");
check("search reports semantic ON + model + stats", a.body.search.semantic === true && a.body.search.stats?.screenshots === 1 && a.body.search.stats?.processed === 1, JSON.stringify(a.body.search.stats));

console.log("\n=== S3: SAME QUERY, embeddings DOWN (the likely cause of your failure) ===");
G.embedDown = true;
const s3 = addShot("UA"); await post(processMemory, "Bearer user-A", { memoryId: s3 });
check("screenshot still processed when embeddings are down", mem(s3).status === "processed");
check("…and indexed for keyword search with no embedding", !!vec(s3) && vec(s3).embedding === null && vec(s3).embedding_model === null);
a = await ask(Q1);
check("query STILL finds it (keyword OR-match + recent pool)", a.status === 200 && /pencil sketch/.test(a.body.response), a.body.response);
check("response says semantic is off and why", a.body.search.semantic === false && /gateway 503/.test(a.body.search.embedding_error ?? ""), a.body.search.embedding_error);
check("cited source returned", a.body.sources_kind === "cited" && a.body.sources.length >= 1);

console.log("\n=== S4: memory that never got processed (status failed, no event, no vector) ===");
G.embedDown = true;
const s4 = addShot("UB", "failed");      // belongs to user B only, with no other memories
calls.length = 0;
a = await ask("that drawing with the girl and the ceiling", "Bearer user-B");
const ans = calls.find((c) => c.kind === "answer")!;
check("model was shown the unprocessed memory via the recent pool", /this memory is failed/.test(ans?.user ?? ""));
check("used_recent_pool reported", a.body.search.used_recent_pool === true);
check("stats surface the failed memory", a.body.search.stats.failed === 1, JSON.stringify(a.body.search.stats));
check("honest 'no match' answer, no invented citations", /don't have/.test(a.body.response) && a.body.sources_kind === "closest");

console.log("\n=== S5: vision call fails -> memory FAILS visibly (not silently saved empty) ===");
G.embedDown = false; G.vision = "fail";
const s5 = addShot("UA");
r = await post(processMemory, "Bearer user-A", { memoryId: s5 });
check("returns 500", r.status === 500);
check("memory marked failed (retry button will appear)", mem(s5).status === "failed");
check("no structured event or vector created", !ev(s5) && !vec(s5));

console.log("\n=== S6: vision ignores the format; S7: structuring returns garbage ===");
G.vision = "noformat";
const s6 = addShot("UA"); r = await post(processMemory, "Bearer user-A", { memoryId: s6 });
check("S6 processed using the free-text description", r.status === 200 && /rainbow ceiling/.test(vec(s6)?.content_text ?? ""));
G.vision = "ok"; G.structure = "garbage";
const s7 = addShot("UA"); r = await post(processMemory, "Bearer user-A", { memoryId: s7 });
check("S7 processed despite unparseable JSON", r.status === 200 && mem(s7).status === "processed");
check("S7 fallback title/summary built from the image description", /black-and-white pencil sketch/.test(ev(s7)?.title ?? "") && /pencil sketch/.test(ev(s7)?.summary ?? ""), ev(s7)?.title);
check("S7 still searchable by the description", /multicolored patterns/.test(vec(s7)?.content_text ?? ""));
G.structure = "ok";

console.log("\n=== S8: auth + idempotency ===");
const s8 = addShot("UA");
check("no token -> 401", (await post(processMemory, null, { memoryId: s8 })).status === 401);
check("other user's token -> 403, memory untouched", (await post(processMemory, "Bearer user-B", { memoryId: s8 })).status === 403 && mem(s8).status === "pending");
check("service role allowed", (await post(processMemory, "Bearer service", { memoryId: s8 })).status === 200);
calls.length = 0;
const again = await (await post(processMemory, "Bearer user-A", { memoryId: s8 })).json();
check("re-processing a processed memory is a no-op (no AI calls)", again.skipped === true && calls.length === 0);
check("missing id -> 400", (await post(processMemory, "Bearer user-A", {})).status === 400);

console.log("\n=== S9: text-only memory still works (no vision call) ===");
const t1 = `m${++n}`; DB.t.raw_memories.push({ id: t1, user_id: "UA", source: "manual", raw_content: "call the dentist tomorrow", media_url: null, status: "pending", platform: "web", captured_at: new Date().toISOString(), created_at: new Date().toISOString(), metadata: {} });
calls.length = 0; r = await post(processMemory, "Bearer user-A", { memoryId: t1 });
check("processed with exactly 1 AI call", r.status === 200 && calls.length === 1 && calls[0].kind === "structure", JSON.stringify(calls.map((c) => c.kind)));

console.log("\n=== S10: reindex repairs rows made while embeddings were down ===");
G.embedDown = true;
r = await post(reindex, "Bearer user-A", {});
const rb = await r.json();
check("reindex reports WHY it can't run when embeddings are down (503)", r.status === 503 && /Embeddings are unavailable/.test(rb.error), rb.error);
G.embedDown = false;
const before = DB.t.memory_vectors.filter((v) => v.user_id === "UA" && !v.embedding).length;
r = await post(reindex, "Bearer user-A", {}); const rb2 = await r.json();
const after = DB.t.memory_vectors.filter((v) => v.user_id === "UA" && !v.embedding).length;
check("reindex embeds the previously-unembedded rows", r.status === 200 && before > 0 && after === 0 && rb2.indexed >= before, `before=${before} after=${after} resp=${JSON.stringify(rb2)}`);
// a row embedded with an OLD model must be re-embedded with the current one
vec(s1).embedding_model = "gemini:old-model@768";
r = await post(reindex, "Bearer user-A", {}); await r.json();
check("rows from a different embedding model get re-embedded", vec(s1).embedding_model === "lovable:google/gemini-embedding-2@768");
r = await post(reindex, "Bearer user-A", {}); const rb3 = await r.json();
check("second run has nothing left to do", rb3.indexed === 0 && rb3.remaining === 0, JSON.stringify(rb3));

console.log("\n=== S11: search-status diagnostics ===");
let st = await (await post(status, "Bearer user-A", {})).json();
check("healthy: embeddings ok, bucket ok, nothing to reindex", st.embedding.ok === true && st.screenshot_storage.ok && st.needs_reindex === 0, JSON.stringify({ e: st.embedding, n: st.needs_reindex }));
check("reports failed memory count (S5)", st.stats.failed === 1, JSON.stringify(st.stats));
G.embedDown = true;
st = await (await post(status, "Bearer user-A", {})).json();
check("embeddings down: says so, with the reason", st.embedding.ok === false && /gateway 503/.test(st.embedding.error), st.embedding.error);
check("status requires a signed-in user", (await post(status, null, {})).status === 401);

console.log("\n=== S12: cron sweeper rescues memories stranded by a closed share window ===");
G.embedDown = false; G.vision = "ok";
const old = (ms: number) => new Date(Date.now() - ms).toISOString();
const stranded = addShot("UA"); mem(stranded).created_at = old(2 * 60_000);     // saved 2 min ago, never processed
const fresh = addShot("UA"); mem(fresh).created_at = old(5_000);                  // just saved: must be left alone
const hw = (secret?: string) => worker(new Request("http://x/", { method: "POST", headers: secret ? { "x-worker-secret": secret } : {}, body: "{}" }));
check("worker without the secret -> 401", (await hw()).status === 401 && (await hw("wrong")).status === 401);
let w = await (await hw("w")).json();
check("stranded screenshot is picked up and fully processed", mem(stranded).status === "processed" && !!ev(stranded) && !!vec(stranded)?.embedding, JSON.stringify(w));
check("brand-new memory is NOT touched (client is still processing it)", mem(fresh).status === "pending");
check("worker reports what it swept", w.swept >= 1, JSON.stringify(w));

console.log("\n=== S13: failures are retried after a cool-down, and not forever ===");
G.vision = "fail";
const flaky = addShot("UA"); mem(flaky).created_at = old(10 * 60_000);
w = await (await hw("w")).json();
check("failing memory counted, left as failed", mem(flaky).status === "failed" && w.sweptFailed >= 1, JSON.stringify(w));
const attemptsAfter1 = mem(flaky).process_attempts;
w = await (await hw("w")).json();
check("immediate re-run does NOT hammer it again (cool-down)", mem(flaky).process_attempts === attemptsAfter1, `attempts=${mem(flaky).process_attempts}`);
mem(flaky).last_attempt_at = old(5 * 60_000); G.vision = "ok";
w = await (await hw("w")).json();
check("after the cool-down it retries and succeeds once the AI recovers", mem(flaky).status === "processed", mem(flaky).status);
const dead = addShot("UA", "failed"); mem(dead).created_at = old(60 * 60_000); mem(dead).process_attempts = 4; mem(dead).last_attempt_at = old(60 * 60_000);
await hw("w");
check("out-of-attempts memory is left alone (no endless AI spend)", mem(dead).status === "failed" && mem(dead).process_attempts === 4);

console.log("\n=== S14: force re-read of an OLD screenshot that was processed with a thin description ===");
G.embedDown = false; G.vision = "ok"; G.structure = "ok";
const oldShot = addShot("UA", "processed");
DB.t.structured_events.push({ id: "old-ev", user_id: "UA", raw_memory_id: oldShot, title: "Screenshot", summary: "A screenshot." });
DB.t.memory_vectors.push({ id: "old-vec", user_id: "UA", structured_event_id: "old-ev", raw_memory_id: oldShot, content_text: "Screenshot\n[Screenshot]", embedding: null, embedding_model: null });
DB.t.pending_intents.push({ id: "old-int", user_id: "UA", raw_memory_id: oldShot, intent_text: "stale" });
calls.length = 0;
let rr = await (await post(processMemory, "Bearer user-A", { memoryId: oldShot })).json();
check("without force, a processed memory is left alone", rr.skipped === true && calls.length === 0);
rr = await (await post(processMemory, "Bearer user-A", { memoryId: oldShot, force: true })).json();
const evs = DB.t.structured_events.filter((e) => e.raw_memory_id === oldShot);
check("force: re-read happened (vision + structuring)", rr.success === true && calls.some((c) => c.kind === "vision") && calls.some((c) => c.kind === "structure"));
check("force: exactly ONE event afterwards (old one replaced, no duplicate)", evs.length === 1 && /scribbling/.test(evs[0].title), JSON.stringify(evs.map((e) => e.title)));
check("force: old stale intent removed", !DB.t.pending_intents.some((i) => i.id === "old-int"));
check("force: image description now stored", /multicolored/.test(mem(oldShot).metadata.image_description ?? ""));
check("force: ONE search row, now with the real description + embedding", DB.t.memory_vectors.filter((v) => v.raw_memory_id === oldShot).length === 1 && /multicolored/.test(vec(oldShot)?.content_text ?? "") && !!vec(oldShot)?.embedding);
check("force by another user is still forbidden", (await post(processMemory, "Bearer user-B", { memoryId: oldShot, force: true })).status === 403 && evs.length === 1);

console.log(fails ? `\n${fails} FAILED` : "\nALL INTEGRATION CHECKS PASSED");
Deno.exit(fails ? 1 : 0);
