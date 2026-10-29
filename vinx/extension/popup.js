import { describe, pagePayload, sendOrQueue, outboxCount } from './vinx.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('status').textContent = t; };

async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }

async function selectionOf(tab) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(getSelection() || '') });
    return r?.result || '';
  } catch { return ''; }
}

async function run(fn) {
  status('Saving…');
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try { status(describe(await fn())); } catch { status('Could not save.'); }
  document.querySelectorAll('button').forEach((b) => (b.disabled = false));
}

$('page').addEventListener('click', () => run(async () => {
  const tab = await activeTab();
  return sendOrQueue(pagePayload({ title: tab?.title, url: tab?.url, selection: tab ? await selectionOf(tab) : '', note: $('note').value }));
}));

$('shot').addEventListener('click', () => run(async () => {
  const tab = await activeTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
  const p = pagePayload({ title: tab?.title, url: tab?.url, note: $('note').value });
  return sendOrQueue({ ...p, image_base64: dataUrl.replace(/^data:image\/png;base64,/, ''), mime: 'image/png' });
}));

$('note-only').addEventListener('click', () => run(async () => {
  const note = $('note').value.trim();
  if (!note) return { ok: false, error: 'Type a note first.' };
  return sendOrQueue({ text: note, source: 'browser', client: 'browser-extension' });
}));

document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('page').click(); } });
outboxCount().then((n) => { if (n) status(`${n} waiting to send.`); });
$('note').focus();
