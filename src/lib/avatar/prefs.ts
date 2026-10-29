// Avatar preferences, stored per browser. Every access is wrapped: storage can be blocked.

export interface AvatarPrefs {
  enabled: boolean; // show the avatar at all
  voice: boolean; // speak out loud (opt-in: browsers block audio until the person asks for it)
  captions: boolean; // show what V says as text
  introSeen: boolean; // has the full first-time introduction played?
  minimized: boolean; // collapsed to the small orb
  lastGreetingDay: string; // YYYY-MM-DD of the last "welcome back" so it isn't repeated all day
}

export const DEFAULT_PREFS: AvatarPrefs = {
  enabled: true, voice: true, captions: true, introSeen: false, minimized: false, lastGreetingDay: '',
};

const KEY = 'vinx.avatar.v1';

export function loadPrefs(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AvatarPrefs {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<AvatarPrefs>;
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULT_PREFS.enabled,
      voice: typeof p.voice === 'boolean' ? p.voice : DEFAULT_PREFS.voice,
      captions: typeof p.captions === 'boolean' ? p.captions : DEFAULT_PREFS.captions,
      introSeen: typeof p.introSeen === 'boolean' ? p.introSeen : DEFAULT_PREFS.introSeen,
      minimized: typeof p.minimized === 'boolean' ? p.minimized : DEFAULT_PREFS.minimized,
      lastGreetingDay: typeof p.lastGreetingDay === 'string' ? p.lastGreetingDay : '',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: AvatarPrefs, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try { storage?.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable: keep in memory only */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: p }));
}

export const PREFS_EVENT = 'vinx:avatar-prefs';

/** Be told when preferences change anywhere in the app (avatar menu, Settings). */
export function subscribePrefs(fn: (p: AvatarPrefs) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = (e: Event) => fn((e as CustomEvent<AvatarPrefs>).detail);
  window.addEventListener(PREFS_EVENT, h);
  return () => window.removeEventListener(PREFS_EVENT, h);
}

function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** YYYY-MM-DD in the given timezone (falls back to UTC if the zone is invalid). */
export function dayKey(now = new Date(), tz?: string): string {
  try { return now.toLocaleDateString('en-CA', { timeZone: tz }); } catch { return now.toLocaleDateString('en-CA', { timeZone: 'UTC' }); }
}
