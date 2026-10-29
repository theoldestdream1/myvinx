import { describe, flushOutbox, pagePayload, sendOrQueue } from './vinx.js';

const MENUS = [
  { id: 'vinx-selection', title: 'Save selection to V', contexts: ['selection'] },
  { id: 'vinx-link', title: 'Save link to V', contexts: ['link'] },
  { id: 'vinx-image', title: 'Save image to V', contexts: ['image'] },
  { id: 'vinx-page', title: 'Save this page to V', contexts: ['page'] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => MENUS.forEach((m) => chrome.contextMenus.create(m)));
  chrome.alarms.create('vinx-flush', { periodInMinutes: 5 });
});
chrome.runtime.onStartup?.addListener(() => { flushOutbox(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'vinx-flush') flushOutbox(); });

function tell(message) {
  chrome.notifications?.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: 'Vinx', message });
}

export async function handleMenu(info, tab) {
  let payload;
  if (info.menuItemId === 'vinx-selection') payload = pagePayload({ title: tab?.title, url: info.pageUrl || tab?.url, selection: info.selectionText });
  else if (info.menuItemId === 'vinx-link') payload = pagePayload({ title: info.selectionText || info.linkUrl, url: info.linkUrl, note: `Link found on ${tab?.title || info.pageUrl || 'a page'}` });
  else if (info.menuItemId === 'vinx-image') payload = pagePayload({ title: tab?.title, url: info.srcUrl, note: 'Image from a page' });
  else if (info.menuItemId === 'vinx-page') payload = pagePayload({ title: tab?.title, url: info.pageUrl || tab?.url });
  else return;
  tell(describe(await sendOrQueue(payload)));
}
chrome.contextMenus.onClicked.addListener((info, tab) => { handleMenu(info, tab); });

export async function handleCommand(command, tab) {
  if (command !== 'save-page') return;
  const [active] = tab ? [tab] : await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active) return;
  let selection = '';
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: active.id }, func: () => String(getSelection() || '') });
    selection = res?.result || '';
  } catch { /* pages like chrome:// cannot be read; save the title and link anyway */ }
  tell(describe(await sendOrQueue(pagePayload({ title: active.title, url: active.url, selection }))));
}
chrome.commands.onCommand.addListener((c, tab) => { handleCommand(c, tab); });
