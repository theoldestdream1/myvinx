import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import webpush from 'web-push';
import { isEditorHost } from './registerDeviceWorker';

describe('stable push signing', () => {
  it('derives a valid paired signing key that can encrypt a Web Push request', () => {
    const source = readFileSync('supabase/functions/_shared/vapid.ts', 'utf8').replace(/^import .*;$/gm, '').replace('export function', 'function');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    // Synthetic fixture only, not an application secret.
    const context = vm.createContext({ p256, sha256, TextEncoder, Uint8Array, btoa, Deno: { env: { get: (name: string) => name === 'VAPID_KEY_SEED' ? 'synthetic-unit-test-fixture-only' : undefined } } });
    vm.runInContext(js, context);
    const keys = vm.runInContext('vapidKeys()', context);
    const again = vm.runInContext('vapidKeys()', context);
    expect(keys).toEqual(again);
    expect(webpush.validateVapidDetails({ subject: 'https://myvinx.lovable.app', ...keys })).toBeUndefined();
    const receiver = webpush.generateVAPIDKeys();
    const request = webpush.generateRequestDetails({ endpoint: 'https://push.example.test/subscription', keys: { p256dh: receiver.publicKey, auth: Buffer.alloc(16, 1).toString('base64url') } }, JSON.stringify({ title: 'Test' }), { vapidDetails: { subject: 'https://myvinx.lovable.app', ...keys } });
    expect(request.method).toBe('POST');
    expect(request.body?.length).toBeGreaterThan(0);
  });
  it('excludes editor hosts but permits published and custom domains', () => {
    for (const host of ['id-preview--test.lovable.app', 'preview-2--test.gpt-eng.com', 'abc.lovableproject-dev.com', 'project--test-dev.lovable.app']) expect(isEditorHost(host)).toBe(true);
    for (const host of ['myvinx.lovable.app', 'myvinx.tech', 'preview-v2--shop.example.com']) expect(isEditorHost(host)).toBe(false);
  });
});

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  const context = vm.createContext({
    self: { addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, location: { origin: 'https://myvinx.lovable.app' }, registration: { showNotification, getNotifications: async () => [] }, clients: { matchAll: async () => [], openWindow }, skipWaiting: async () => {} },
    caches: {}, fetch, URL, Response, setTimeout: (fn: () => void) => fn(),
  });
  vm.runInContext(readFileSync('public/sw.js', 'utf8'), context);
  return { handlers, showNotification, openWindow, fetch };
}

describe('device notification worker', () => {
  it('shows a reminder with lock-screen actions', async () => {
    const w = worker(); let job: Promise<unknown> = Promise.resolve();
    w.handlers.push({ data: { json: () => ({ type: 'reminder', title: 'Call Amaka', token: 'synthetic-action-fixture', actionUrl: 'https://example.test/action' }) }, waitUntil: (p: Promise<unknown>) => { job = p; } });
    await job;
    expect(w.showNotification).toHaveBeenCalledWith('Call Amaka', expect.objectContaining({ actions: [{ action: 'done', title: 'Done' }, { action: 'snooze', title: 'Snooze 1h' }] }));
  });
  it.each(['done', 'snooze'])('sends the %s action and acknowledges only after success', async action => {
    const w = worker(); let job: Promise<unknown> = Promise.resolve();
    w.handlers.notificationclick({ action, notification: { close: vi.fn(), data: { token: 'synthetic-action-fixture', actionUrl: 'https://example.test/action' } }, waitUntil: (p: Promise<unknown>) => { job = p; } });
    await job;
    expect(JSON.parse(w.fetch.mock.calls[0][1].body)).toEqual({ token: 'synthetic-action-fixture', action, minutes: 60 });
    expect(w.showNotification).toHaveBeenCalledTimes(1);
  });
  it('opens reminders when an action fails rather than confirming success', async () => {
    const w = worker(); w.fetch.mockResolvedValue({ ok: false }); let job: Promise<unknown> = Promise.resolve();
    w.handlers.notificationclick({ action: 'done', notification: { close: vi.fn(), data: { token: 'fixture', actionUrl: 'https://example.test/action', url: '/intents' } }, waitUntil: (p: Promise<unknown>) => { job = p; } });
    await job;
    expect(w.showNotification).not.toHaveBeenCalled();
    expect(w.openWindow).toHaveBeenCalledWith('https://myvinx.lovable.app/intents');
  });
  it('never intercepts page navigations or caches signed-in HTML', () => {
    const w = worker(); const respondWith = vi.fn();
    w.handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://myvinx.lovable.app/dashboard' }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
});