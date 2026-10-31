// Link reading: find the first web link in a capture, fetch it safely, pull title/description/readable text.
// Pure helpers are exported for tests; fetchLink does the network I/O. Failures never block processing.

export type LinkInfo = {
  url: string;
  final_url?: string;
  site?: string;
  title?: string;
  description?: string;
  image?: string;
  text?: string;
  error?: string;
};

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/** First http(s) link in text, with trailing punctuation trimmed. */
export function findFirstUrl(text: string): string | null {
  for (const m of (text || "").matchAll(URL_RE)) {
    let u = m[0].replace(/[),.;:!?\]}>]+$/, "");
    // keep a balanced closing paren (wikipedia style)
    if (m[0].length > u.length && m[0][u.length] === ")" && u.includes("(")) u += ")";
    try {
      const p = new URL(u);
      if (isPublicHost(p.hostname)) return p.toString();
    } catch { /* skip */ }
  }
  return null;
}

/** Block localhost, private and link-local addresses so captures can't probe internal networks. */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (!h.includes(".") && !h.includes(":")) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (h.includes(":")) {
    if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return false;
  }
  return true;
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function meta(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const c = tag?.match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
  return c ? decode(c).trim() || undefined : undefined;
}

/** Title, description, image and readable body text from a page's HTML. */
export function parseHtml(html: string, baseUrl: string, maxText = 6000): Omit<LinkInfo, "url"> {
  const title = meta(html, "og:title") || meta(html, "twitter:title") ||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]).replace(/\s+/g, " ").trim() : undefined);
  const description = meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description");
  const site = meta(html, "og:site_name");
  let image = meta(html, "og:image") || meta(html, "twitter:image");
  if (image) { try { image = new URL(image, baseUrl).toString(); } catch { image = undefined; } }

  let body = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html;
  body = body
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 1).join("\n").slice(0, maxText);
  return { title: title || undefined, description, site, image, text: text || undefined };
}

/** Fetch a page safely (timeout, size cap, public hosts only, manual redirects re-checked). */
export async function fetchLink(url: string, timeoutMs = 10_000): Promise<LinkInfo> {
  let current = url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop < 5; hop++) {
      const host = new URL(current).hostname;
      if (!isPublicHost(host)) return { url, error: "blocked host" };
      const res = await fetch(current, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VinxBot/1.0; +https://myvinx.tech)", Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current).toString();
        await res.body?.cancel();
        continue;
      }
      if (!res.ok) { await res.body?.cancel(); return { url, final_url: current, error: `HTTP ${res.status}` }; }
      const type = res.headers.get("content-type") || "";
      if (!/html|xml/i.test(type)) { await res.body?.cancel(); return { url, final_url: current, error: `not a web page (${type.split(";")[0] || "unknown"})` }; }
      // read at most ~1.5MB
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      while (size < 1_500_000) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
      await reader.cancel().catch(() => {});
      const buf = new Uint8Array(size); let o = 0; for (const c of chunks) { buf.set(c.subarray(0, size - o), o); o += c.length; if (o >= size) break; }
      const html = new TextDecoder().decode(buf);
      return { url, final_url: current, ...parseHtml(html, current) };
    }
    return { url, error: "too many redirects" };
  } catch (e) {
    return { url, final_url: current, error: (e as Error).name === "AbortError" ? "timed out" : String((e as Error).message || e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}
