// The browser extension's logic, run against a mocked chrome.* API and fetch.
import { describe, it, expect, beforeEach, vi } from 'vitest';
// @ts-expect-error plain JS module outside src
import * as vinx from '../../extension/vinx.js';

const store: Record<string, any> = {};
const sent: any[] = [];
const net = { down: false, status: 200, body: { ok: true, id: 'x' } as any };
const notes: any[] = []; const created: any[] = []; const listeners: Record<string, Function> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  sent.length = 0; notes.length = 0; created.length = 0; net.down = false; net.status = 200; net.body = { ok: true, id: 'x' };
  (globalThis as any).chrome = {
    storage: { local: { get: async (k: string) => ({ [k]: store[k] }), set: async (o: any) => { Object.assign(store, JSON.parse(JSON.stringify(o))); } } },
    notifications: { create: (n: any) => notes.push(n) },
    contextMenus: { create: (m: any) => created.push(m), removeAll: (cb: any) => cb(), onClicked: { addListener: (f: any) => (listeners.menu = f) } },
    runtime: { onInstalled: { addListener: (f: any) => (listeners.installed = f) }, onStartup: { addListener: () => {} } },
    alarms: { create: vi.fn(), onAlarm: { addListener: (f: any) => (listeners.alarm = f) } },
    commands: { onCommand: { addListener: (f: any) => (listeners.command = f) } },
    tabs: { query: async () => [{ id: 7, title: 'Pricing – Acme', url: 'https://acme.com/pricing' }] },
    scripting: { executeScript: async () => [{ result: 'selected words' }] },
  };
  (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
    if (net.down) throw new TypeError('Failed to fetch');
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(net.body), { status: net.status, headers: { 'content-type': 'application/json' } });
  });
});
const configure = () => vinx.saveConfig({ url: 'https://abc.supabase.co/functions/v1/capture', key: 'mm_secret_key' });

describe('config', () => {
  it('accepts a real capture URL and a device key', async () => { await configure(); expect((await vinx.getConfig()).key).toBe('mm_secret_key'); });
  it('rejects other URLs (the key must only ever go to the capture endpoint)', async () => {
    await expect(vinx.saveConfig({ url: 'https://evil.example.com/collect', key: 'mm_x' })).rejects.toThrow(/capture URL/);
    await expect(vinx.saveConfig({ url: 'http://abc.supabase.co/functions/v1/capture', key: 'mm_x' })).rejects.toThrow();
  });
  it('rejects a key that is not a device key', async () => { await expect(vinx.saveConfig({ url: '', key: 'sk-123' })).rejects.toThrow(/mm_/); });
  it('stores the key locally, never in sync storage', async () => { await configure(); expect(Object.keys(store)).toEqual(['memoConfig']); expect((chrome as any).storage.sync).toBeUndefined(); });
});

describe('sending', () => {
  it('not configured -> asks the person to set up, makes no request', async () => {
    const r = await vinx.send({ text: 'x' });
    expect(r.setup).toBe(true); expect(vinx.describe(r)).toMatch(/Not set up/); expect(sent.length).toBe(0);
  });
  it('posts JSON with the bearer key and a client_id', async () => {
    await configure();
    const r = await vinx.send(vinx.pagePayload({ title: 'T', url: 'https://a.com', selection: 'sel', note: 'my note' }));
    expect(r.ok).toBe(true);
    expect(sent[0].url).toBe('https://abc.supabase.co/functions/v1/capture');
    expect(sent[0].headers.Authorization).toBe('Bearer mm_secret_key');
    expect(sent[0].body).toMatchObject({ title: 'T', url: 'https://a.com', source: 'browser', client: 'browser-extension', text: 'my note\n\n"sel"' });
    expect(sent[0].body.client_id).toBeTruthy();
  });
  it('a bad key is not queued and gives a helpful message', async () => {
    await configure(); net.status = 401; net.body = { error: 'Invalid or revoked device key' };
    const r = await vinx.sendOrQueue({ text: 'x' });
    expect(r.ok).toBe(false); expect(vinx.describe(r)).toMatch(/not accepted/); expect(await vinx.outboxCount()).toBe(0);
  });
  it('offline: queued with its id, then sent once when back (no duplicates)', async () => {
    await configure(); net.down = true;
    const r = await vinx.sendOrQueue({ text: 'on the train' });
    expect(r.queued).toBe(true); expect(vinx.describe(r)).toMatch(/Saved on this device/); expect(await vinx.outboxCount()).toBe(1);
    expect((await vinx.flushOutbox())).toEqual({ sent: 0, remaining: 1 });
    net.down = false;
    expect(await vinx.flushOutbox()).toEqual({ sent: 1, remaining: 0 });
    expect(sent.length).toBe(1);
    expect(await vinx.flushOutbox()).toEqual({ sent: 0, remaining: 0 });
  });
  it('server errors (5xx, 429) are retried later; a permanent rejection is dropped', async () => {
    await configure(); net.status = 503; net.body = { error: 'down' };
    await vinx.sendOrQueue({ text: 'a' }); expect(await vinx.outboxCount()).toBe(1);
    net.status = 400; net.body = { error: 'bad' };
    expect(await vinx.flushOutbox()).toEqual({ sent: 0, remaining: 0 });
  });
  it('explains skipped, duplicate and oversize results', () => {
    expect(vinx.describe({ ok: true, body: { skipped: 'sensitive', message: 'Not saved: it looks like a card number.' } })).toMatch(/card number/);
    expect(vinx.describe({ ok: true, body: { duplicate: true } })).toBe('Already saved.');
    expect(vinx.describe({ ok: false, status: 413 })).toMatch(/too large/);
    expect(vinx.describe({ ok: true, body: { id: '1' } })).toBe('Saved to V.');
  });
  it('caps what can pile up offline', async () => {
    await configure(); net.down = true;
    for (let i = 0; i < 100; i++) await vinx.sendOrQueue({ text: `n${i}` });
    const r = await vinx.sendOrQueue({ text: 'one too many' });
    expect(r.ok).toBe(false); expect(await vinx.outboxCount()).toBe(100);
  });
});

describe('payload building', () => {
  it('trims long selections and titles', () => {
    const p = vinx.pagePayload({ title: 'x'.repeat(500), url: 'u', selection: 'y'.repeat(9000) });
    expect(p.title.length).toBe(300); expect(p.text.length).toBeLessThan(4010);
  });
});

describe('background: context menu + hotkey', () => {
  it('registers menus on install and a periodic retry', async () => {
    await import('../../extension/background.js' as string);
    listeners.installed();
    expect(created.map((c) => c.id)).toEqual(['vinx-selection', 'vinx-link', 'vinx-image', 'vinx-page']);
    expect((chrome as any).alarms.create).toHaveBeenCalledWith('vinx-flush', { periodInMinutes: 5 });
  });
  it('saving a selection sends it with page context and tells the person', async () => {
    await configure(); await import('../../extension/background.js' as string);
    await (listeners.menu as any)({ menuItemId: 'vinx-selection', selectionText: 'quote me', pageUrl: 'https://acme.com/pricing' }, { title: 'Pricing – Acme', url: 'https://acme.com/pricing' });
    await vi.waitFor(() => expect(notes.length).toBe(1));
    expect(sent[0].body.text).toContain('quote me'); expect(sent[0].body.url).toBe('https://acme.com/pricing');
    expect(notes[0].message).toBe('Saved to V.');
  });
  it('the save-page shortcut grabs the selected text', async () => {
    await configure(); await import('../../extension/background.js' as string);
    await (listeners.command as any)('save-page');
    await vi.waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].body.text).toContain('selected words'); expect(sent[0].body.title).toBe('Pricing – Acme');
  });
  it('ignores unknown shortcuts', async () => {
    await configure(); await import('../../extension/background.js' as string);
    await (listeners.command as any)('something-else'); expect(sent.length).toBe(0);
  });
});

describe('manifest', () => {
  it('is valid MV3 and asks for no broad permissions', async () => {
    const m = (await import('../../extension/manifest.json')).default as any;
    expect(m.manifest_version).toBe(3);
    expect(m.permissions).not.toContain('<all_urls>'); expect(m.host_permissions).toBeUndefined();
    expect(m.background.service_worker).toBe('background.js');
    for (const f of Object.values(m.icons) as string[]) expect(f).toMatch(/^icons\/icon\d+\.png$/);
  });
});
