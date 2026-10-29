// Minimal, correct iCalendar (RFC 5545) writer for reminders.

export interface IcsReminder { id: string; text: string; when: string; created?: string }

/** Escape text values: backslash, semicolon, comma and newlines. */
export const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines must be folded at 75 octets (not characters), continuation lines start with one space. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "", curBytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) { out.push(cur); cur = ""; curBytes = 0; limit = 74; }
    cur += ch; curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildCalendar(reminders: IcsReminder[], now = new Date(), name = "Vinx reminders"): string {
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vinx//Reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const r of reminders) {
    const start = new Date(r.when);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 15 * 60_000);
    const title = r.text.replace(/\s+/g, " ").trim().slice(0, 200) || "Reminder";
    L.push("BEGIN:VEVENT", `UID:intent-${r.id}@vinx`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape("Reminder from your Vinx. " + r.text.slice(0, 1000))}`, "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
