/* Vinx service worker
 * - Web Push: reminders + daily brief, with Done / Snooze buttons that work from the lock screen
 * - Share target: receives "Share -> Vinx" from other apps (Android / desktop Chromium)
 * - No app-shell caching: pages and assets always use the network
 */
const SHARE_CACHE = 'vinx-share-target'; // survives SW upgrades on purpose

self.addEventListener('install', (event) => {
  event.waitUntil(
    self.skipWaiting(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('vinx-shell-')).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* ------------------------------ fetch ------------------------------ */

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Share target (manifest share_target posts multipart data here)
  if (req.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(req));
    return;
  }

});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const text = (k) => {
      const v = form.get(k);
      return typeof v === 'string' ? v.slice(0, 20000) : '';
    };

    const cache = await caches.open(SHARE_CACHE);
    await cache.delete('/__shared-payload');
    await cache.delete('/__shared-file');

    await cache.put(
      '/__shared-payload',
      new Response(JSON.stringify({ title: text('title'), text: text('text'), url: text('url') }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const file = form.get('media');
    if (file && typeof file !== 'string' && file.size > 0) {
      await cache.put(
        '/__shared-file',
        new Response(file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || '') },
        }),
      );
    }
  } catch (e) {
    // fall through: the page will just show "nothing shared"
  }
  return Response.redirect(new URL('/share?shared=1', self.location.origin).href, 303);
}

/* ------------------------------- push ------------------------------ */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Vinx', body: event.data ? event.data.text() : '' };
  }

  const isReminder = data.type === 'reminder';
  const actions = isReminder && data.token && data.actionUrl
    ? [
        { action: 'done', title: 'Done' },
        { action: 'snooze', title: 'Snooze 1h' },
      ]
    : [];

  // A push MUST show a notification (userVisibleOnly), so always do, even on odd payloads
  event.waitUntil(
    self.registration.showNotification(data.title || 'Vinx', {
      body: data.body || '',
      tag: data.tag || 'vinx',
      icon: '/__l5e/assets-v1/2af17854-3c0f-4d58-bdd9-de7d5dfdcde4/vinx-icon-192.png',
      badge: '/__l5e/assets-v1/ce716f6a-850f-48bb-aaae-1f7ba71bc68c/vinx-badge-96.png',
      requireInteraction: isReminder,
      actions,
      data: {
        url: data.url || '/dashboard',
        token: data.token,
        actionUrl: data.actionUrl,
        apikey: data.apikey,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};

  if ((event.action === 'done' || event.action === 'snooze') && d.token && d.actionUrl) {
    event.waitUntil(
      runAction(d, event.action).catch(() => openApp(d.url || '/intents')),
    );
    return;
  }
  event.waitUntil(openApp(d.url || '/dashboard'));
});

async function runAction(d, action) {
  const headers = { 'Content-Type': 'application/json' };
  if (d.apikey) headers.apikey = d.apikey;

  const res = await fetch(d.actionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token: d.token, action, minutes: 60 }),
  });
  if (!res.ok) throw new Error('action failed');

  // Quick, self-dismissing confirmation (tapping a button otherwise gives no feedback)
  await self.registration.showNotification(action === 'done' ? 'Marked done' : 'Snoozed for 1 hour', {
    tag: 'vinx-ack',
    icon: '/__l5e/assets-v1/2af17854-3c0f-4d58-bdd9-de7d5dfdcde4/vinx-icon-192.png',
    silent: true,
  });
  await new Promise((r) => setTimeout(r, 2500));
  const open = await self.registration.getNotifications({ tag: 'vinx-ack' });
  open.forEach((n) => n.close());
}

async function openApp(path) {
  const target = new URL(path, self.location.origin).href;
  if (new URL(target).origin !== self.location.origin) return;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of clients) {
    if (new URL(c.url).origin === self.location.origin) {
      try {
        await c.focus();
        if ('navigate' in c) await c.navigate(target);
        return;
      } catch (e) {
        /* fall back to a new window */
      }
    }
  }
  await self.clients.openWindow(target);
}
