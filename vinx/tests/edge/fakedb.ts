// In-memory stand-in for the supabase-js surface the edge functions use, plus fakes for the two RPCs.
type Row = Record<string, any>;
export const DB: { t: Record<string, Row[]>; files: Map<string, Blob>; embedModel: string } = {
  t: { raw_memories: [], structured_events: [], memory_vectors: [], pending_intents: [], entities: [], entity_relationships: [], channel_links: [], inbound_addresses: [], calendar_feeds: [], auth_users: [{ id: "UA", email: "Ada@Example.com" }, { id: "UB", email: "bo@example.com" }], channel_link_codes: [], channel_events: [], device_tokens: [], profiles: [{ id: "UA", timezone: "Africa/Lagos" }, { id: "UB", timezone: "UTC" }] },
  files: new Map(), embedModel: "",
};
export const rpcLog: string[] = [];
const UNIQUE: Record<string, string[][]> = { channel_events: [["channel", "event_id"]], channel_link_codes: [["code_hash"]], channel_links: [["channel", "external_id"], ["user_id", "channel"]], inbound_addresses: [["user_id"], ["alias"]], calendar_feeds: [["user_id"], ["token"]] };
export const removed: string[] = [];
const uid = () => crypto.randomUUID();
const STOP = new Set("the a an of to in on at and or is are was were it its that this with for from as by be her his their my me i you she he they them look looking black white".split(" "));
const words = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).map((w) => w.replace(/(ing|ed|s)$/, "")).filter((w) => !STOP.has(w));

class Q implements PromiseLike<any> {
  private f: ((r: Row) => boolean)[] = []; private op = "select"; private payload: any; private opts: any; private cols = "*";
  private single_ = false; private maybe_ = false; private lim = Infinity; private ord: [string, boolean] | null = null; private wantRows = false;
  constructor(private table: string) {}
  select(c = "*") { if (this.op === "select") this.cols = c; else this.wantRows = true; return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: any, o?: any) { this.op = "upsert"; this.payload = p; this.opts = o; return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: any) { const [col, path] = c.split("->>"); this.f.push((r) => (path ? r[col]?.[path] === v : r[c] === v)); return this; }
  neq(c: string, v: any) { this.f.push((r) => r[c] !== v); return this; }
  gte(c: string, v: any) { this.f.push((r) => r[c] >= v); return this; }
  lt(c: string, v: any) { this.f.push((r) => r[c] < v); return this; }
  is(c: string, v: any) { this.f.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  in(c: string, vs: any[]) { this.f.push((r) => vs.includes(r[c])); return this; }
  ilike(c: string, p: string) { const want = p.replace(/\\([%_])/g, "$1").toLowerCase(); this.f.push((r) => String(r[c] ?? "").toLowerCase() === want); return this; }
  order(c: string, o?: any) { this.ord = [c, o?.ascending !== false]; return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.single_ = true; return this; }
  maybeSingle() { this.maybe_ = true; return this; }
  private run(): { data: any; error: any } {
    const tbl = DB.t[this.table] ?? (DB.t[this.table] = []);
    const match = () => tbl.filter((r) => this.f.every((fn) => fn(r)));
    if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
      const uniques = UNIQUE[this.table] ?? [];
      for (const r of rows) for (const cols of uniques) {
        if (tbl.some((x) => cols.every((c) => x[c] === r[c]))) return { data: null, error: { code: "23505", message: `duplicate key on ${this.table}(${cols.join(",")})` } };
      }
      tbl.push(...rows);
      return this.wantRows ? { data: this.single_ ? rows[0] : rows, error: null } : { data: null, error: null };
    }
    if (this.op === "upsert") {
      const key = this.opts?.onConflict; const r = { id: uid(), created_at: new Date().toISOString(), ...this.payload };
      const i = key ? tbl.findIndex((x) => x[key] === r[key]) : -1;
      if (i >= 0) tbl[i] = { ...tbl[i], ...this.payload }; else tbl.push(r);
      return { data: null, error: null };
    }
    if (this.op === "update") { const hit = match(); hit.forEach((r) => Object.assign(r, this.payload)); return { data: this.wantRows ? hit : null, error: null }; }
    if (this.op === "delete") {
      const gone = match(); for (const r of gone) tbl.splice(tbl.indexOf(r), 1);
      // mirror the real FK: deleting an event cascades to its search rows
      if (this.table === "raw_memories") {
        const ids = new Set(gone.map((g) => g.id));
        for (const t of ["structured_events", "pending_intents", "memory_vectors"]) DB.t[t] = (DB.t[t] ?? []).filter((x) => !ids.has(x.raw_memory_id));
      }
      if (this.table === "structured_events") { const ids = new Set(gone.map((g) => g.id)); DB.t.memory_vectors = DB.t.memory_vectors.filter((v) => !ids.has(v.structured_event_id)); }
      return { data: null, error: null };
    }
    let rows = match();
    if (this.ord) { const [c, asc] = this.ord; rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
    rows = rows.slice(0, this.lim);
    if (this.table === "raw_memories" && /structured_events\(/.test(this.cols)) {
      rows = rows.map((r) => ({ ...r, structured_events: DB.t.structured_events.filter((e) => e.raw_memory_id === r.id) }));
    }
    if (this.single_) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "single() expected 1 row, got " + rows.length } };
    if (this.maybe_) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
  then<T1, T2>(ok?: (v: any) => T1, bad?: (e: any) => T2) { return Promise.resolve(this.run()).then(ok, bad); }
}

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
function parseVec(v: any): number[] | null { return typeof v === "string" ? JSON.parse(v) : v ?? null; }

export class FakeClient {
  from(t: string) { return new Q(t); }
  functions = {
    invoke: async (name: string, o: { body: unknown }) => {
      const h = (globalThis as any).__handlers[name] as (r: Request) => Promise<Response>;
      const r = await h(new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer service" }, body: JSON.stringify(o.body) }));
      return r.ok ? { data: await r.json(), error: null } : { data: null, error: { message: "status " + r.status } };
    },
  };
  storage = {
    from: (_b: string) => ({
      download: async (p: string) => (DB.files.has(p) ? { data: DB.files.get(p)!, error: null } : { data: null, error: { message: "Object not found" } }),
      createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://signed.example/${p}?t=1` }, error: null }),
      upload: async (p: string, body: any, o?: any) => {
        if (DB.files.has(p) && o?.upsert === false) return { data: null, error: { message: "exists" } };
        DB.files.set(p, new Blob([body], { type: o?.contentType })); return { data: { path: p }, error: null };
      },
      remove: async (paths: string[]) => { for (const p of paths ?? []) { DB.files.delete(p); removed.push(p); } return { data: [], error: null }; },
    }),
    getBucket: async (_id: string) => ({ data: { id: "memory-media" }, error: null }),
  };
  async rpc(name: string, a: any) {
    rpcLog.push(name);
    if (name === "claim_ingestion_batch") return { data: [], error: null };
    if (name === "claim_stuck_memories") {
      const now = Date.now();
      const rows = DB.t.raw_memories.filter((m) => (m.process_attempts ?? 0) < 4 && (
        (m.status === "pending" && now - Date.parse(m.created_at) > 60_000 && (!m.last_attempt_at || now - Date.parse(m.last_attempt_at) > 120_000)) ||
        (m.status === "failed" && now - Date.parse(m.last_attempt_at ?? m.created_at) > 180_000))).slice(0, a._limit);
      rows.forEach((m) => { m.process_attempts = (m.process_attempts ?? 0) + 1; m.last_attempt_at = new Date().toISOString(); });
      return { data: rows.map((r) => ({ id: r.id })), error: null };
    }
    if (name === "build_brief") return { data: (DB as any).brief ?? { due: [], upcoming_count: 0, waiting_count: 0, captured_7d: 0, resurfaced: null }, error: null };
    if (name === "validate_device_token") {
      const t = DB.t.device_tokens.find((d) => d.token_hash === a._token_hash && !d.revoked_at);
      if (t) t.last_used_at = new Date().toISOString();
      return { data: t?.user_id ?? null, error: null };
    }
    if (name === "account_email") return { data: DB.t.auth_users.find((r) => r.id === a._user_id)?.email?.toLowerCase() ?? null, error: null };
    if (name === "resolve_inbound_address") {
      const x = DB.t.inbound_addresses.find((r) => r.alias === String(a._alias).toLowerCase());
      const u = x && DB.t.auth_users.find((r) => r.id === x.user_id);
      return { data: x && u ? [{ user_id: x.user_id, account_email: u.email.toLowerCase(), extra_senders: x.extra_senders ?? [] }] : [], error: null };
    }
    if (name === "claim_due_intents") {
      const rows = DB.t.pending_intents.filter((i) => i.status === "pending" && i.trigger_date && Date.parse(i.trigger_date) <= Date.now()).slice(0, a._limit);
      rows.forEach((i) => { i.status = "reminded"; i.reminded_at = new Date().toISOString(); });
      return { data: rows.map((i) => ({ ...i, timezone: DB.t.profiles.find((p) => p.id === i.user_id)?.timezone ?? "UTC" })), error: null };
    }
    if (name === "claim_due_briefs") {
      const ids = [...new Set(DB.t.channel_links.filter((l) => !l.paused).map((l) => l.user_id))];
      return { data: ids.map((id) => ({ user_id: id, timezone: DB.t.profiles.find((p) => p.id === id)?.timezone ?? "UTC", display_name: null })), error: null };
    }
    if (name === "memory_search_stats") {
      const m = DB.t.raw_memories.filter((r) => r.user_id === a._user_id), v = DB.t.memory_vectors.filter((r) => r.user_id === a._user_id);
      const models: Record<string, number> = {}; v.filter((x) => x.embedding).forEach((x) => { const k = x.embedding_model ?? "unknown"; models[k] = (models[k] ?? 0) + 1; });
      return { data: { total: m.length, processed: m.filter((r) => r.status === "processed").length, failed: m.filter((r) => r.status === "failed").length,
        waiting: m.filter((r) => ["pending", "processing"].includes(r.status)).length, screenshots: m.filter((r) => r.media_url).length,
        indexed: v.length, with_embedding: v.filter((x) => x.embedding).length, embedding_models: models }, error: null };
    }
    if (name === "match_memories") {
      const qe = a._query_embedding ? parseVec(a._query_embedding)! : null; const qw = new Set(words(a._query_text ?? ""));
      const rows = DB.t.memory_vectors.filter((r) => r.user_id === a._user_id).map((r) => {
        const kw = words(r.content_text).filter((w) => qw.has(w)).length;
        const sem = qe && r.embedding && r.embedding_model === a._embedding_model ? cos(qe, parseVec(r.embedding)!) : null;
        return { r, kw, sem };
      });
      const ranked = rows.map(({ r, kw, sem }) => ({ r, score: (kw > 0 ? 1 / (60 + 1) : 0) * Math.min(kw, 3) + (sem !== null && sem > 0.2 ? 1 / (60 + 1) : 0) }))
        .filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, a._match_count);
      return { data: ranked.map(({ r, score }) => {
        const ev = DB.t.structured_events.find((e) => e.id === r.structured_event_id); const rm = DB.t.raw_memories.find((m) => m.id === r.raw_memory_id);
        return { structured_event_id: r.structured_event_id, raw_memory_id: r.raw_memory_id, title: ev?.title, summary: ev?.summary, content_text: r.content_text,
          event_date: ev?.event_date ?? null, captured_at: rm?.captured_at ?? null, source: rm?.source, media_url: rm?.media_url ?? null, score };
      }), error: null };
    }
    return { data: null, error: { message: "unknown rpc " + name } };
  }
}
