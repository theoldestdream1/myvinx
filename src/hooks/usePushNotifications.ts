import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const PUSH_CONFIG_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminders`;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Reads a useful message out of a failed functions.invoke() call. */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const res = (error as { context?: Response } | null)?.context;
    if (res && typeof res.json === 'function') {
      const body = (await res.json()) as { error?: unknown };
      if (body?.error) return String(body.error);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const userId = user?.id;
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const configured = !!publicKey;
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(false);
    try {
      const response = await fetch(PUSH_CONFIG_URL, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Configuration unavailable');
      const data = await response.json();
      setPublicKey(data.configured && typeof data.publicKey === 'string' ? data.publicKey : null);
    } catch { setConfigError(true); }
    finally { setConfigLoading(false); }
  }, []);
  useEffect(() => { void loadConfig(); }, [loadConfig]);
  // iPhones only allow web push for apps added to the Home Screen
  const needsInstall = isIOS() && !isStandalone();

  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const register = useCallback(async (sub: PushSubscription) => {
    const json = sub.toJSON();
    const { error } = await supabase.rpc('register_push_subscription', {
      _endpoint: sub.endpoint,
      _p256dh: json.keys?.p256dh ?? '',
      _auth: json.keys?.auth ?? '',
      _user_agent: navigator.userAgent,
    });
    if (error) throw error;
  }, []);

  const getRegistration = useCallback(async () => {
    if (!supported) return null;
    return (await navigator.serviceWorker.getRegistration('/')) ?? null;
  }, [supported]);

  const createSubscription = useCallback(
    async (reg: ServiceWorkerRegistration) => {
      if (!publicKey) throw new Error('Notifications are not configured');
      const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) };
      try {
        return await reg.pushManager.subscribe(options);
      } catch (e) {
        // A subscription made with different VAPID keys blocks a new one: drop it and retry once
        const old = await reg.pushManager.getSubscription();
        if (old) {
          await old.unsubscribe();
          return await reg.pushManager.subscribe(options);
        }
        throw e;
      }
    },
    [publicKey],
  );

  // On load: reflect real state, and heal drift (browser rotated/dropped the subscription)
  useEffect(() => {
    if (!supported || !configured || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await getRegistration();
        if (!reg) return;
        let sub = await reg.pushManager.getSubscription();
        if (Notification.permission === 'granted') {
          if (!sub) sub = await createSubscription(reg); // permission already given: silently restore
          await register(sub); // keep the server's copy current
        }
        if (!cancelled) {
          setPermission(Notification.permission);
          setSubscribed(!!sub && Notification.permission === 'granted');
        }
      } catch (e) {
        console.warn('push sync failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, configured, userId, getRegistration, createSubscription, register]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !configured || !userId || needsInstall) return false;
    // Request immediately within the tap; iOS loses user activation after an awaited lookup.
    const permissionRequest = Notification.requestPermission();
    setBusy(true);
    try {
      const result = await permissionRequest;
      setPermission(result);
      if (result !== 'granted') {
        toast.error('Notifications were not allowed. You can try again or change your browser settings.');
        return false;
      }
      let reg = await getRegistration();
      if (reg && !reg.active) {
        reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>(resolve => setTimeout(() => resolve(null), 10000))]);
      }
      if (!reg) {
        toast.error('Notifications work in the installed / production app, not in the dev preview.');
        return false;
      }
      const sub = (await reg.pushManager.getSubscription()) ?? (await createSubscription(reg));
      await register(sub);
      setSubscribed(true);
      toast.success('Notifications enabled on this device');
      return true;
    } catch (e) {
      console.error(e);
      toast.error('Could not enable notifications');
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, configured, userId, needsInstall, getRegistration, createSubscription, register]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        if (error) throw error;
        if (!await sub.unsubscribe()) throw new Error('Browser did not remove subscription');
      }
      setSubscribed(false);
      toast.success('Notifications turned off on this device');
    } catch (e) {
      console.error(e);
      toast.error('Could not turn off notifications');
    } finally {
      setBusy(false);
    }
  }, [getRegistration]);

  return { supported, configured, configLoading, configError, reloadConfig: loadConfig, needsInstall, permission, subscribed, busy, subscribe, unsubscribe };
}
