// Shared logic for the Vinx extension. No UI here, so it can be tested without a browser.
// The device key lives in chrome.storage.local (never sync) and is only ever sent to the capture URL.

export const DEFAULT_CONFIG = { url: '', key: '' };
const OUTBOX_MAX = 100;

export async function getConfig() {
  const { memoConfig } = await chrome.storage.local.get('memoConfig');
  return { ...DEFAULT_CONFIG, ...(memoConfig || {}) };
}
export async function saveConfig(cfg) {
  const url = String(cfg.url || '').trim();
  const key = String(cfg.key || '').trim();
  if (url && !/^https:\/\/[^\s/]+\/functions\/v1\/capture\/?$/.test(url)) throw new Error('That does not look like your Vinx capture URL (it ends in /functions/v1/capture).');
  if (key && !key.startsWith('mm_')) throw new Error('Device keys start with mm_. Create one in Vinx > Settings.');
  await chrome.storage.local.set({ memoConfig: { url, key } });
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Turn what the user is looking at into a capture payload. */
export function pagePayload({ title, url, selection, note } = {}) {
  const parts = [];
  if (note) parts.push(note.trim());
  if (selection) parts.push(`"${selection.trim().slice(0, 4000)}"`);
  return { title: (title || '').trim().slice(0, 300), url: (url || '').slice(0, 2000), text: parts.join('\n\n'), source: 'browser', client: 'browser-extension' };
}

/** POST one capture. Returns { ok, status, body } and never throws. `network: true` means "retry later". */
export async function send(payload, cfg) {
  const c = cfg || (await getConfig());
  if (!c.url || !c.key) return { ok: false, status: 0, error: 'Not set up yet. Open the extension options and paste your device key.', setup: true };
  try {
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify({ ...payload, client_id: payload.client_id || newId() }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, body };
    // 429 and 5xx are worth retrying; 4xx (bad key, too large) are not
    return { ok: false, status: res.status, error: body.error || `Server said ${res.status}`, network: res.status === 429 || res.status >= 500 };
  } catch {
    return { ok: false, status: 0, error: 'No connection', network: true };
  }
}

export async function outboxCount() {
  const { memoOutbox = [] } = await chrome.storage.local.get('memoOutbox');
  return memoOutbox.length;
}

/** Send now; if the connection is down, keep it and retry later (same client_id, so no duplicates). */
export async function sendOrQueue(payload) {
  const withId = { ...payload, client_id: payload.client_id || newId() };
  const r = await send(withId);
  if (r.ok || !r.network) return r;
  const { memoOutbox = [] } = await chrome.storage.local.get('memoOutbox');
  if (memoOutbox.length >= OUTBOX_MAX) return { ...r, error: 'Too many unsent items waiting. Reconnect and try again.' };
  await chrome.storage.local.set({ memoOutbox: [...memoOutbox, withId] });
  return { ok: true, queued: true, status: 0 };
}

export async function flushOutbox() {
  const { memoOutbox = [] } = await chrome.storage.local.get('memoOutbox');
  const left = [];
  let sent = 0;
  for (let i = 0; i < memoOutbox.length; i++) {
    const r = await send(memoOutbox[i]);
    if (r.ok) { sent++; continue; }
    if (r.network || r.setup) { left.push(...memoOutbox.slice(i)); break; } // still offline: stop
    // a permanent rejection (revoked key, too large): drop it rather than retry forever
  }
  await chrome.storage.local.set({ memoOutbox: left });
  return { sent, remaining: left.length };
}

/** Result of a save, as a short line for a notification or the popup. */
export function describe(r) {
  if (r.queued) return "Saved on this device. I'll send it when you're back online.";
  if (r.ok && r.body?.duplicate) return 'Already saved.';
  if (r.ok && r.body?.skipped === 'sensitive') return r.body.message || 'Not saved: it looks sensitive.';
  if (r.ok) return 'Saved to V.';
  if (r.status === 401) return 'Your device key was not accepted. Create a new one in Vinx > Settings.';
  if (r.status === 413) return 'That is too large to save.';
  return r.error || 'Could not save.';
}
