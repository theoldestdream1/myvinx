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
