export interface Brief {
  due: { id: string; intent_text: string; trigger_date: string; status: string }[];
  upcoming_count: number;
  waiting_count: number;
  captured_7d: number;
  resurfaced: { event_id: string; title: string; summary: string | null; saved_at: string } | null;
}

/** YYYY-MM-DD for "today" in the user's timezone (UTC if the zone is invalid). */
export function localDate(tz: string, now = new Date()): string {
  try {
    return now.toLocaleDateString("en-CA", { timeZone: tz });
  } catch {
    return now.toLocaleDateString("en-CA", { timeZone: "UTC" });
  }
}

export function formatTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  } catch {
    return new Date(iso).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  }
}

function agoText(iso: string): string {
  const days = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks < 9 ? `${weeks} weeks ago` : `${Math.round(days / 30)} months ago`;
}

/** Notification text for a brief, or null when there is nothing worth interrupting for. */
export function composeBrief(brief: Brief, tz: string): { title: string; body: string } | null {
  const n = brief.due.length;
  if (n === 0 && !brief.resurfaced && brief.upcoming_count === 0) return null;

  const lines: string[] = [];
  for (const d of brief.due.slice(0, 3)) {
    const overdue = new Date(d.trigger_date).getTime() < Date.now() - 6 * 3600_000;
    lines.push(`• ${d.intent_text}${overdue ? " (overdue)" : ` · ${formatTime(d.trigger_date, tz)}`}`);
  }
  if (n > 3) lines.push(`+${n - 3} more`);
  if (n === 0 && brief.upcoming_count > 0) {
    lines.push(`${brief.upcoming_count} coming up in the next 3 days`);
  }
  if (brief.resurfaced) {
    lines.push(`From ${agoText(brief.resurfaced.saved_at)}: ${brief.resurfaced.title}`);
  }

  return {
    title: n > 0 ? `${n} thing${n === 1 ? "" : "s"} for today` : "Your Vinx brief",
    body: lines.join("\n"),
  };
}
