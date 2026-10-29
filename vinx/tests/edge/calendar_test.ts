// Calendar feed: the iCalendar writer (escaping, folding, UTC times, alarms) and the secret-link endpoint.
import { DB } from "./fakedb.ts";
let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (extra && !ok ? "  :: " + extra : "")); if (!ok) fails++; };
Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
const logged: string[] = [];
for (const k of ["log", "error", "warn"] as const) { const o = console[k]; console[k] = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); o(...a); }; }

const { buildCalendar, icsEscape, fold } = await import("./fn/_shared/ics.ts");
const load = async (name: string) => { await import(`./fn/${name}/index.ts`); return (globalThis as any).__lastHandler as (r: Request) => Promise<Response>; };

// ---------- the writer ----------
const NOW = new Date("2026-10-26T08:00:00Z");
const ics = buildCalendar([{ id: "i1", text: "Call mum; bring cake, and flowers\nback at 5", when: "2026-10-27T09:00:00+01:00" }], NOW);
const unfold = (s: string) => s.replace(/\r\n /g, "");
check("CRLF line endings and a closing newline", ics.includes("\r\n") && !/[^\r]\n/.test(ics) && ics.endsWith("END:VCALENDAR\r\n"));
check("calendar header", ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:"));
check("start is UTC (09:00 +01:00 -> 08:00Z) and the event lasts 15 minutes", ics.includes("DTSTART:20261027T080000Z") && ics.includes("DTEND:20261027T081500Z"), ics);
check("DTSTAMP uses the supplied clock", ics.includes("DTSTAMP:20261026T080000Z"));
check("stable UID so edits update instead of duplicating", ics.includes("UID:intent-i1@vinx"));
check("; , and newlines are escaped in text", unfold(ics).includes("SUMMARY:Call mum\; bring cake\\, and flowers back at 5"), unfold(ics));
check("fires an alert at the start time", /BEGIN:VALARM\r\nACTION:DISPLAY[\s\S]*TRIGGER:PT0M\r\nEND:VALARM/.test(unfold(ics)));
check("doesn't block the person's day (TRANSP:TRANSPARENT)", ics.includes("TRANSP:TRANSPARENT"));
check("an unparseable date is skipped, not fatal", !buildCalendar([{ id: "x", text: "t", when: "garbage" }], NOW).includes("BEGIN:VEVENT"));
check("empty calendar is still valid", buildCalendar([], NOW).includes("BEGIN:VCALENDAR") && !buildCalendar([], NOW).includes("VEVENT"));
check("escape handles backslashes", icsEscape("a\\b") === "a\\\\b");
const long = buildCalendar([{ id: "l", text: "é".repeat(120), when: "2026-10-27T09:00:00Z" }], NOW);
const enc = new TextEncoder();
check("every line is at most 75 bytes, even with multi-byte letters", long.split("\r\n").every((l) => enc.encode(l).length <= 75), long.split("\r\n").map((l) => enc.encode(l).length).join());
const ascii = buildCalendar([{ id: "a", text: "word ".repeat(80), when: "2026-10-27T09:00:00Z" }], NOW);
check("ascii lines also fold within 75 bytes", ascii.split("\r\n").every((l) => enc.encode(l).length <= 75));
check("folded text unfolds back to the original", unfold(long).includes("SUMMARY:" + "é".repeat(120)));
check("a fold never splits a character", !long.includes("�"));
check("fold leaves short lines alone", fold("SHORT") === "SHORT");

// ---------- the endpoint ----------
const feed = await load("calendar-feed");
const link = await load("channel-link");
const asUser = (action: string, who = "user-A") => link(new Request("http://x/cl", { method: "POST", headers: { Authorization: `Bearer ${who}`, "content-type": "application/json" }, body: JSON.stringify({ action }) }));
let r = await asUser("calendar_get"); let b = await r.json();
const TOKEN = new URL(b.https).searchParams.get("t")!;
check("a private link is created, with a webcal:// twin for one-tap subscribe", r.status === 200 && b.https.startsWith("http://supabase.test/functions/v1/calendar-feed?t=") && b.webcal.startsWith("webcal://supabase.test/") && /^[a-z0-9]{32}$/.test(TOKEN), JSON.stringify(b));
check("asking again returns the same link", (await (await asUser("calendar_get")).json()).https === b.https);
const other = new URL((await (await asUser("calendar_get", "user-B")).json()).https).searchParams.get("t");
check("each person has their own link", other !== TOKEN);
check("signing in is required to see the link", (await asUser("calendar_get", "nobody")).status === 401);

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
DB.t.pending_intents.push(
  { id: "p1", user_id: "UA", intent_text: "Call mum", trigger_date: inDays(1), status: "pending" },
  { id: "p2", user_id: "UA", intent_text: "Overdue but still open", trigger_date: inDays(-3), status: "pending" },
  { id: "p3", user_id: "UA", intent_text: "Fired yesterday", trigger_date: inDays(-1), status: "reminded" },
  { id: "p4", user_id: "UA", intent_text: "Fired long ago", trigger_date: inDays(-40), status: "reminded" },
  { id: "p5", user_id: "UA", intent_text: "Done already", trigger_date: inDays(1), status: "resolved" },
  { id: "p6", user_id: "UA", intent_text: "No date yet", trigger_date: null, status: "pending" },
  { id: "p7", user_id: "UB", intent_text: "Bo's secret", trigger_date: inDays(1), status: "pending" },
);
const get = (t: string | null, method = "GET") => feed(new Request("http://x/calendar-feed" + (t === null ? "" : `?t=${t}`), { method }));
r = await get(TOKEN); const body = await r.text();
check("200 text/calendar", r.status === 200 && (r.headers.get("content-type") || "").startsWith("text/calendar"));
check("open, overdue and recently fired reminders are included", ["Call mum", "Overdue but still open", "Fired yesterday"].every((t) => body.includes(t)));
check("old, resolved and undated ones are left out", !["Fired long ago", "Done already", "No date yet"].some((t) => body.includes(t)));
check("another person's reminders never leak", !body.includes("Bo's secret"));
check("HEAD works for calendar apps that probe first", (await get(TOKEN, "HEAD")).status === 200);
check("wrong token -> 404", (await get("a".repeat(32))).status === 404);
check("missing token -> 404", (await get(null)).status === 404);
check("malformed token (injection-style) -> 404", (await get("x'%20or%20'1'='1")).status === 404);
check("POST not allowed", (await get(TOKEN, "POST")).status === 405);

b = await (await asUser("calendar_regenerate")).json();
const T2 = new URL(b.https).searchParams.get("t")!;
check("rotating gives a new link", T2 !== TOKEN);
check("the old link stops working", (await get(TOKEN)).status === 404);
check("the new link works", (await get(T2)).status === 200);
check("tokens never appear in logs", !logged.some((l) => l.includes(T2) || l.includes(TOKEN)));

console.log(fails ? `\n${fails} FAILED` : "\nall calendar tests passed");
Deno.exit(fails ? 1 : 0);
