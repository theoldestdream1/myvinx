// Email helpers: reading inbound mail (Postmark-style JSON) and sending outbound mail (Resend).

export const inboundDomain = () => (Deno.env.get("INBOUND_EMAIL_DOMAIN") || "").toLowerCase();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Good-enough HTML to text for newsletters and forwards. Never executes or fetches anything. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Ada <Ada@Example.com>" -> "ada@example.com" */
export function bareAddress(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

/** The alias part of an address on our inbound domain, or null (wrong domain, plus-tags are dropped). */
export function aliasFromRecipient(addr: string, domain: string): string | null {
  const a = bareAddress(addr);
  const at = a.lastIndexOf("@");
  if (at < 1 || !domain || a.slice(at + 1) !== domain.toLowerCase()) return null;
  const local = a.slice(0, at).split("+")[0];
  return /^[a-z0-9]{10,32}$/.test(local) ? local : null;
}

/**
 * Did the sending server prove who it is? Mail arriving at a provider carries SPF/DKIM verdicts in its
 * headers. Without this, anyone could type the owner's address in the From line. Accepts a pass from
 * either SPF or DKIM, and refuses anything with no verdict.
 */
export function senderAuthenticated(headers: Array<{ Name: string; Value: string }> = []): boolean {
  const find = (n: string) => headers.filter((h) => h.Name?.toLowerCase() === n).map((h) => String(h.Value));
  const spf = find("received-spf").some((v) => /^\s*pass\b/i.test(v));
  const results = find("authentication-results").join(" ").toLowerCase();
  const dkim = /dkim=pass/.test(results);
  const spfAr = /spf=pass/.test(results);
  const spfFail = find("received-spf").some((v) => /^\s*(fail|softfail|none|temperror|permerror)\b/i.test(v)) && !dkim;
  return !spfFail && (spf || dkim || spfAr);
}

export const emailConfigured = () => !!Deno.env.get("RESEND_API_KEY") && !!Deno.env.get("EMAIL_FROM");

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) return { ok: false, error: "email not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `status ${res.status}` };
  } catch {
    return { ok: false, error: "network error" };
  }
}
