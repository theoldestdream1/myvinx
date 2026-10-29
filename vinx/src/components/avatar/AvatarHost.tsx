import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { loadPrefs, subscribePrefs } from '@/lib/avatar/prefs';

// Only this small file ships with the main bundle. The character, animation engine and styles
// download after the page is interactive, so the avatar never slows first paint.
const AssistantAvatar = lazy(() => import('./AssistantAvatar'));

// Pages where a floating assistant would be in the way
const HIDDEN_ON = new Set(['/', '/auth', '/share', '/quick', '/hero-demo']);

export function AvatarHost() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [enabled, setEnabled] = useState(() => loadPrefs().enabled);
  const [ready, setReady] = useState(false);
  const allowed = !!user && !HIDDEN_ON.has(pathname);

  useEffect(() => subscribePrefs((p) => setEnabled(p.enabled)), []);

  useEffect(() => {
    if (!allowed || !enabled || ready) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(t);
  }, [allowed, enabled, ready]);

  if (!allowed || !enabled || !ready) return null;
  return (
    <Suspense fallback={null}>
      <AssistantAvatar />
    </Suspense>
  );
}

export default AvatarHost;
