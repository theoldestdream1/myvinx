export function isEditorHost(hostname: string) {
  const host = hostname.toLowerCase();
  return /(^|\.)(lovableproject(?:-dev)?\.com|beta\.lovable\.dev)$/.test(host)
    || /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+\.(?:lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host)
    || /^project--.+-dev\.(?:lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host);
}

/** Device messaging and Android share transport only; never an offline app shell. */
export async function registerDeviceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let embedded = true;
  try { embedded = window.self !== window.top; } catch { /* refuse embedded registration */ }
  if (!import.meta.env.PROD || embedded || isEditorHost(window.location.hostname)) return;
  await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
}