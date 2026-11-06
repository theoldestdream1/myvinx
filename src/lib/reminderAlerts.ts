// Vibration patterns for reminder push notifications.
// The same map lives in public/sw.js (service workers can't import app modules);
// keep the two in sync — reminderAlerts.test.ts guards the values.
export const VIBRATE_PATTERNS = {
  buzz: [220, 90, 220, 90, 320],
  pulse: [120, 60, 120],
  off: [],
} as const;

export type VibratePattern = keyof typeof VIBRATE_PATTERNS;

export const VIBRATE_LABELS: Record<VibratePattern, string> = {
  buzz: 'Strong buzz',
  pulse: 'Gentle pulse',
  off: 'Silent (no vibration)',
};

export function isVibratePattern(v: unknown): v is VibratePattern {
  return typeof v === 'string' && v in VIBRATE_PATTERNS;
}

/** Preview the pattern on this device. Returns false when vibration is unsupported. */
export function previewVibration(pattern: VibratePattern): boolean {
  if (!('vibrate' in navigator)) return false;
  return navigator.vibrate([...VIBRATE_PATTERNS[pattern]]);
}

export interface PushArrival {
  type: 'vinx-push';
  kind: string;
  vibrate: number[];
}

/** Recognises the "a push just landed" message posted by public/sw.js. */
export function isPushArrival(msg: unknown): msg is PushArrival {
  const m = msg as Partial<PushArrival> | null;
  return !!m && m.type === 'vinx-push' && typeof m.kind === 'string' && Array.isArray(m.vibrate);
}

/** Buzz in-page; Android 8+ ignores a notification's own vibrate pattern. */
export function buzzForArrival(a: PushArrival): void {
  if (a.vibrate.length && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(a.vibrate); } catch { /* unsupported */ }
  }
}

/**
 * Resolves true when this device receives a push of the given kind within the timeout.
 * Lets the test button tell "never reached the phone" apart from "arrived but muted".
 */
export function waitForPushArrival(kind: string, timeoutMs = 15000): { promise: Promise<boolean>; cancel: () => void } {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw) return { promise: Promise.resolve(false), cancel: () => {} };
  let done: (v: boolean) => void = () => {};
  const promise = new Promise<boolean>((r) => { done = r; });
  const onMsg = (e: MessageEvent) => { if (isPushArrival(e.data) && e.data.kind === kind) finish(true); };
  const timer = setTimeout(() => finish(false), timeoutMs);
  function finish(v: boolean) { clearTimeout(timer); sw!.removeEventListener('message', onMsg); done(v); }
  sw.addEventListener('message', onMsg);
  return { promise, cancel: () => finish(false) };
}

export const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
