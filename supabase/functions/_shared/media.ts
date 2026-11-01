// Public video metadata only. Never treat a post caption as a spoken transcript.
export type VideoPlatform = 'tiktok' | 'youtube' | 'instagram';
export type MediaEvidence = {
  platform?: VideoPlatform;
  video_id?: string;
  author?: string;
  music?: string;
  duration_seconds?: number;
  transcript?: string;
  evidence?: 'page' | 'metadata' | 'transcript' | 'unavailable';
};

export function videoTarget(raw: string): { platform: VideoPlatform; id?: string; canonical: string } | null {
  const u = new URL(raw);
  const h = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  if (h === 'tiktok.com' || h === 'vt.tiktok.com' || h === 'vm.tiktok.com') {
    const id = u.pathname.match(/\/(?:video|embed\/v2)\/(\d+)/)?.[1];
    return { platform: 'tiktok', id, canonical: id ? `https://www.tiktok.com${u.pathname}` : u.toString() };
  }
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com') {
    const id = h === 'youtu.be' ? u.pathname.split('/')[1] : u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) return { platform: 'youtube', id, canonical: `https://www.youtube.com/watch?v=${id}` };
  }
  if (h === 'instagram.com') {
    const id = u.pathname.match(/^\/(?:reel|reels|p|tv)\/([\w-]+)/)?.[1];
    if (id) return { platform: 'instagram', id, canonical: `https://www.instagram.com${u.pathname.replace(/\/+$/, '')}/` };
  }
  return null;
}

export function readJsonScript(html: string, id: string): any {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (match[1].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] !== id) continue;
    try { return JSON.parse(match[2]); } catch { return null; }
  }
  return null;
}

export function tiktokMetadata(html: string, expectedId?: string) {
  const universal = readJsonScript(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
  const sigi = readJsonScript(html, 'SIGI_STATE');
  const item = universal?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ||
    (expectedId ? sigi?.ItemModule?.[expectedId] : null);
  if (!item || (expectedId && String(item.id) !== expectedId)) return null;
  const description = typeof item.desc === 'string' ? item.desc.slice(0, 6000) : undefined;
  return {
    title: description?.split('\n')[0]?.slice(0, 200), description,
    author: [item.author?.nickname, item.author?.uniqueId ? `@${item.author.uniqueId}` : ''].filter(Boolean).join(' '),
    music: typeof item.music?.title === 'string' ? item.music.title : undefined,
    image: item.video?.cover || item.video?.originCover,
    duration_seconds: Number(item.video?.duration) || undefined,
    video_id: String(item.id),
  };
}

/** Extract one JSON object after a JS assignment without executing page scripts. */
export function assignedJson(html: string, name: string): any {
  const start = html.search(new RegExp(`(?:var\\s+)?${name}\\s*=`));
  if (start < 0) return null;
  const open = html.indexOf('{', start); if (open < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(open, i + 1)); } catch { return null; } }
  }
  return null;
}

export function youtubeMetadata(html: string, expectedId: string) {
  const player = assignedJson(html, 'ytInitialPlayerResponse');
  if (!player || player.videoDetails?.videoId !== expectedId) return null;
  const d = player.videoDetails;
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const track = Array.isArray(tracks) ? tracks.find((t: any) => t.languageCode === 'en' && t.kind !== 'asr') || tracks.find((t: any) => t.languageCode === 'en') || tracks[0] : undefined;
  return {
    title: typeof d.title === 'string' ? d.title : undefined,
    description: typeof d.shortDescription === 'string' ? d.shortDescription.slice(0, 6000) : undefined,
    author: typeof d.author === 'string' ? d.author : undefined,
    duration_seconds: Number(d.lengthSeconds) || undefined,
    image: d.thumbnail?.thumbnails?.at(-1)?.url,
    caption_url: typeof track?.baseUrl === 'string' ? track.baseUrl : undefined,
  };
}

export function parseCaptions(payload: string): string {
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed.events)) return parsed.events.flatMap((e: any) => Array.isArray(e.segs) ? e.segs.map((s: any) => typeof s.utf8 === 'string' ? s.utf8 : '') : []).join(' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
  } catch { /* XML and VTT fallback */ }
  if (!/<(?:text|p)\b|WEBVTT/.test(payload)) return '';
  return payload.replace(/<[^>]+>/g, ' ').replace(/^WEBVTT.*$/gm, '').replace(/^\d+$/gm, '').replace(/^.*-->.*$/gm, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 12000);
}

export function structuredVideo(html: string) {
  const queue: any[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { queue.push(JSON.parse(m[1])); } catch { /* invalid JSON is not evidence */ }
  }
  let count = 0;
  while (queue.length && count++ < 100) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { queue.push(...node.slice(0, 100)); continue; }
    const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (type.some((t: string) => t === 'VideoObject' || t === 'Clip')) return {
      title: typeof node.name === 'string' ? node.name : undefined,
      description: typeof node.description === 'string' ? node.description.slice(0, 6000) : undefined,
      author: typeof node.author === 'string' ? node.author : node.author?.name,
      image: Array.isArray(node.thumbnailUrl) ? node.thumbnailUrl[0] : node.thumbnailUrl,
      transcript: typeof node.transcript === 'string' ? node.transcript.slice(0, 12000) : undefined,
    };
    queue.push(...Object.values(node).filter(v => v && typeof v === 'object').slice(0, 100));
  }
  return null;
}

export function usefulVideoText(text?: string): boolean {
  return !!text?.trim() && !/^(TikTok(?:\s*-\s*Make Your Day)?|YouTube|Instagram|Instagram photos and videos|Login\s*[•|]\s*Instagram|Watch .* videos on TikTok)\s*$/i.test(text.trim());
}