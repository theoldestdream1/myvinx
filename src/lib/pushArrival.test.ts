import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { isPushArrival, waitForPushArrival } from './reminderAlerts';

describe('push arrival', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('recognises only the worker arrival message', () => {
    expect(isPushArrival({ type: 'vinx-push', kind: 'test', vibrate: [220] })).toBe(true);
    expect(isPushArrival({ type: 'other', kind: 'test', vibrate: [] })).toBe(false);
    expect(isPushArrival({ type: 'vinx-push', kind: 'test' })).toBe(false);
  });

  it('service worker posts the arrival message to open pages', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    expect(sw).toMatch(/postMessage\(\{ type: 'vinx-push'/);
  });

  it('reports arrival when the test push lands, and missing after 15 seconds otherwise', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    vi.stubGlobal('navigator', { serviceWorker: target });
    const a = waitForPushArrival('test', 15000);
    target.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'vinx-push', kind: 'test', vibrate: [] } }));
    await expect(a.promise).resolves.toBe(true);

    const b = waitForPushArrival('test', 15000);
    vi.advanceTimersByTime(15000);
    await expect(b.promise).resolves.toBe(false);
  });
});
