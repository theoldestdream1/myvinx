import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { VIBRATE_PATTERNS, isVibratePattern } from './reminderAlerts';

describe('reminder vibration patterns', () => {
  it('buzz is a strong multi-pulse pattern', () => {
    expect(VIBRATE_PATTERNS.buzz).toEqual([220, 90, 220, 90, 320]);
  });

  it('pulse is gentler than buzz', () => {
    const max = (p: readonly number[]) => Math.max(...p);
    expect(max(VIBRATE_PATTERNS.pulse)).toBeLessThan(max(VIBRATE_PATTERNS.buzz));
    expect(VIBRATE_PATTERNS.pulse.length).toBeLessThan(VIBRATE_PATTERNS.buzz.length);
  });

  it('off is an empty pattern (silent)', () => {
    expect(VIBRATE_PATTERNS.off).toEqual([]);
  });

  it('validates pattern names', () => {
    expect(isVibratePattern('buzz')).toBe(true);
    expect(isVibratePattern('pulse')).toBe(true);
    expect(isVibratePattern('off')).toBe(true);
    expect(isVibratePattern('loud')).toBe(false);
    expect(isVibratePattern(undefined)).toBe(false);
  });

  it('service worker carries the same patterns for reminders', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    expect(sw).toContain('buzz: [220, 90, 220, 90, 320]');
    expect(sw).toContain('pulse: [120, 60, 120]');
    expect(sw).toContain('vibrate:');
  });
});
