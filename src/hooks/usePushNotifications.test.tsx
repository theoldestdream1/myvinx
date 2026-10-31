import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications } from './usePushNotifications';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), deletion: vi.fn(), permission: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), getSub: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: () => ({ delete: () => ({ eq: mocks.deletion }) }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, publicKey: btoa(String.fromCharCode(4) + 'a'.repeat(64)).replace(/=+$/, '') }) }));
  vi.stubGlobal('PushManager', function () {});
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: mocks.permission.mockResolvedValue('granted') });
  const sub = { endpoint: 'https://push.example.test/device', toJSON: () => ({ keys: { p256dh: 'fixture', auth: 'fixture' } }), unsubscribe: mocks.unsubscribe.mockResolvedValue(true) };
  mocks.getSub.mockResolvedValue(null);
  mocks.subscribe.mockResolvedValue(sub);
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.deletion.mockResolvedValue({ error: null });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ active: {}, pushManager: { getSubscription: mocks.getSub, subscribe: mocks.subscribe } }) } });
});

describe('push subscription controls', () => {
  it('requests permission during the tap and registers the resulting device for the owner', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.configured).toBe(true));
    await act(async () => { const request = result.current.subscribe(); expect(mocks.permission).toHaveBeenCalledTimes(1); await request; });
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_subscription', expect.objectContaining({ _endpoint: 'https://push.example.test/device' }));
    expect(result.current.subscribed).toBe(true);
  });
  it('does not create a subscription when permission is denied', async () => {
    mocks.permission.mockResolvedValue('denied');
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.configured).toBe(true));
    await act(async () => { expect(await result.current.subscribe()).toBe(false); });
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it('does not report registration success when the database rejects the device', async () => {
    mocks.rpc.mockResolvedValue({ error: new Error('Rejected fixture') });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.configured).toBe(true));
    await act(async () => { expect(await result.current.subscribe()).toBe(false); });
    expect(result.current.subscribed).toBe(false);
  });
  it('does not unsubscribe locally if the server cannot remove the endpoint', async () => {
    mocks.getSub.mockResolvedValue({ endpoint: 'fixture', unsubscribe: mocks.unsubscribe });
    mocks.deletion.mockResolvedValue({ error: new Error('Deletion failed fixture') });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.configured).toBe(true));
    await act(async () => { await result.current.unsubscribe(); });
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });
});