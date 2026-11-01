import { videoTarget, tiktokMetadata, youtubeMetadata, structuredVideo, parseCaptions, usefulVideoText, type MediaEvidence } from './media.ts';

export type LinkInfo = MediaEvidence & {
  url: string; final_url?: string; site?: string; title?: string; description?: string;
  image?: string; text?: string; error?: string; checked_at?: string; reader_version?: number;
};
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
export function findFirstUrl(text: string): string | null {
  for (const m of (text || '').matchAll(URL_RE)) {
    let u = m[0].replace(/[),.;:!?\]}>]+$/, '');
    if (m[0].length > u.length && m[0][u.length] === ')' && u.includes('(')) u += ')';
    try { const p = new URL(u); if (isPublicHost(p.hostname) && !p.username && !p.password) return p.toString(); } catch { /* skip */ }
  }
  return null;
}
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || h === 'localhost' || /\.(localhost|local|internal|test|invalid)$/.test(h)) return false;
  if (!h.includes('.') && !h.includes(':')) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    if ([a,b,c,d].some(n => n > 255) || a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  // Only global unicast IPv6; excludes mapped IPv4, loopback and transition ranges.
  if (h.includes(':') && (!/^[23][0-9a-f]{3}:/.test(h) || /^(2001:(db8|0):|2002:)/.test(h))) return false;
  return true;
}
function decode(s: string): string {
  const point = (n: number) => n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  return s.replace(/&#(\d+);/g, (_, n) => point(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => point(parseInt(n,16)))
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
}
function meta(html: string, key: string): string | undefined {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (tag[0].match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() !== key) continue;
    const content = tag[0].match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
    if (content) return decode(content).trim() || undefined;
  }
}
export function parseHtml(html: string, baseUrl: string, maxText = 6000): Omit<LinkInfo,'url'> {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = meta(html,'og:title') || meta(html,'twitter:title') || (titleTag ? decode(titleTag).replace(/\s+/g,' ').trim() : undefined);
  const description = meta(html,'og:description') || meta(html,'twitter:description') || meta(html,'description');
  let image = meta(html,'og:image') || meta(html,'twitter:image');
  if (image) { try { const u = new URL(image,baseUrl); image = /^https?:$/.test(u.protocol) && isPublicHost(u.hostname) ? u.toString() : undefined; } catch { image = undefined; } }
  let body = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html;
  body = body.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template)\b[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<\/(p|div|h[1-6]|li|br|tr|section|article)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ');
  const text = decode(body).split('\n').map(l => l.replace(/\s+/g,' ').trim()).filter(l => l.length > 1).join('\n').slice(0,maxText);
  return { title, description, image, site: meta(html,'og:site_name'), text: text || undefined };
}

async function safeUrl(raw: string, signal: AbortSignal): Promise<URL> {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port)) || !isPublicHost(u.hostname)) throw new Error('blocked host');
  // Edge runtime preflight also rejects public-looking names resolving to private IPs.
  const runtime = (globalThis as unknown as { Deno?: { resolveDns?: (name: string, type: 'A' | 'AAAA') => Promise<string[]> } }).Deno;
  if (runtime?.resolveDns && !/^[\d.]+$|:/.test(u.hostname)) {
    const lookup = Promise.allSettled([runtime.resolveDns(u.hostname,'A'),runtime.resolveDns(u.hostname,'AAAA')]).then(results => results.flatMap(r => r.status === 'fulfilled' ? r.value : []));
    const addresses = await new Promise<string[]>((resolve,reject) => {
      const abort = () => reject(new Error('timed out'));
      if (signal.aborted) return abort();
      signal.addEventListener('abort',abort,{ once:true });
      lookup.then(resolve,reject).finally(() => signal.removeEventListener('abort',abort));
    });
    if (!addresses.length || addresses.some(a => !isPublicHost(a))) throw new Error('blocked host');
  }
  return u;
}
async function readPublic(raw: string, signal: AbortSignal, accept = 'text/html,application/json;q=0.9,*/*;q=0.5'): Promise<{url: string; body: string}> {
  let current = raw;
  for (let hop = 0; hop < 6; hop++) {
    await safeUrl(current,signal);
    const res = await fetch(current,{ redirect:'manual',signal,headers:{ 'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',Accept:accept,'Accept-Language':'en-US,en;q=0.9' } });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) { current = new URL(location,current).toString(); await res.body?.cancel(); continue; }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    if (!/html|xml|json|text|vtt/i.test(res.headers.get('content-type') || '')) { await res.body?.cancel(); throw new Error('unsupported response type'); }
    if (!res.body) throw new Error('empty response');
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) throw new Error('response too large'); chunks.push(value); }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c,offset); offset += c.length; }
    return { url:current,body:new TextDecoder().decode(bytes) };
  }
  throw new Error('too many redirects');
}

export function linkEvidenceText(link: LinkInfo): string {
  return [
    `LINK: ${link.final_url || link.url}`,
    `READING COVERAGE: ${link.evidence || (link.error ? 'unavailable' : 'page')}`,
    link.platform ? `PLATFORM: ${link.platform}` : '',
    link.author ? `CREATOR: ${link.author}` : '',
    link.title ? `TITLE: ${link.title}` : '',
    link.description ? `POST CAPTION / DESCRIPTION (not spoken dialogue): ${link.description}` : '',
    link.music ? `MUSIC: ${link.music}` : '',
    link.transcript ? `AVAILABLE TRANSCRIPT:\n${link.transcript}` : link.platform ? 'No spoken transcript or visual video analysis is available. Do not invent dialogue, scenes or details beyond the caption.' : '',
    !link.platform && link.text ? `PAGE TEXT:\n${link.text.slice(0,6000)}` : '',
    link.error ? `READING LIMITATION: ${link.error}` : '',
  ].filter(Boolean).join('\n');
}

export async function fetchLink(url: string, timeoutMs = 20_000): Promise<LinkInfo> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(),timeoutMs);
  let result: LinkInfo = { url, reader_version:2,checked_at:new Date().toISOString() };
  try {
    const initial = videoTarget(url); result.platform = initial?.platform;
    let page: {url:string;body:string} | undefined;
    try { page = await readPublic(initial?.platform === 'youtube' ? initial.canonical : url,ctrl.signal); result.final_url = page.url; }
    catch (e) { result.error = e instanceof Error ? e.message : 'fetch failed'; }
    const target = page ? videoTarget(page.url) || initial : initial;
    if (!target) {
      if (page) return { ...result,...parseHtml(page.body,page.url),evidence:'page' };
      return result;
    }
    result.platform = target.platform; result.video_id = target.id; result.site = { tiktok:'TikTok',youtube:'YouTube',instagram:'Instagram' }[target.platform];
    const parsed = page ? parseHtml(page.body,page.url) : {};
    const structured = page ? structuredVideo(page.body) : null;
    const specific = page && target.id ? target.platform === 'tiktok' ? tiktokMetadata(page.body,target.id) : target.platform === 'youtube' ? youtubeMetadata(page.body,target.id) : null : null;
    for (const candidate of [parsed,structured,specific]) {
      if (!candidate) continue;
      for (const [key,value] of Object.entries(candidate)) {
        if (['text','site','caption_url'].includes(key) || typeof value !== 'string' && typeof value !== 'number') continue;
        if (typeof value === 'string' && !usefulVideoText(value)) continue;
        (result as unknown as Record<string,unknown>)[key] = typeof value === 'string' ? value.slice(0,12000) : value;
      }
    }
    // Platform oEmbed is an independent metadata fallback, never an audio source.
    if (!usefulVideoText(result.title) && !usefulVideoText(result.description) && target.platform !== 'instagram') {
      const endpoint = target.platform === 'tiktok' ? 'https://www.tiktok.com/oembed' : 'https://www.youtube.com/oembed';
      try {
        const response = await readPublic(`${endpoint}?url=${encodeURIComponent(target.canonical)}&format=json`,ctrl.signal);
        const o = JSON.parse(response.body);
        if (usefulVideoText(o.title)) result.title = o.title.slice(0,6000);
        if (typeof o.author_name === 'string') result.author = o.author_name.slice(0,200);
        if (typeof o.thumbnail_url === 'string') result.image = o.thumbnail_url;
      } catch { /* preserve the original link and diagnostic */ }
    }
    if (target.platform === 'instagram' && !result.description && !result.transcript) {
      try {
        const embedded = await readPublic(`${target.canonical}embed/captioned/`,ctrl.signal);
        const data = structuredVideo(embedded.body) || parseHtml(embedded.body,embedded.url);
        if (usefulVideoText(data.description)) result.description = data.description;
        if (usefulVideoText(data.title)) result.title = data.title;
      } catch { /* public embed may be unavailable */ }
    }
    const captionUrl = specific && 'caption_url' in specific ? specific.caption_url : undefined;
    if (typeof captionUrl === 'string') {
      try {
        const u = new URL(captionUrl);
        if (['www.youtube.com','youtube.com','www.youtube-nocookie.com'].includes(u.hostname) && u.pathname === '/api/timedtext') {
          u.searchParams.set('fmt','json3');
          result.transcript = parseCaptions((await readPublic(u.toString(),ctrl.signal)).body) || undefined;
        }
      } catch { /* captions unavailable; metadata remains valid */ }
    }
    result.evidence = result.transcript ? 'transcript' : result.description || result.title ? 'metadata' : 'unavailable';
    result.text = undefined; // page chrome is never video evidence
    if (result.evidence === 'unavailable') result.error = result.error || 'Public video details are unavailable; only the link was saved.';
    else result.error = undefined;
    return result;
  } catch (e) {
    return { ...result,evidence:'unavailable',error: e instanceof Error && e.name === 'AbortError' ? 'timed out' : e instanceof Error ? e.message.slice(0,120) : 'fetch failed' };
  } finally { clearTimeout(timer); }
}
