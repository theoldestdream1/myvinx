import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), update: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), readFailure: false, installed: true, subscribed: true }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/usePushNotifications', () => ({
  functionErrorMessage: async (_error: unknown, fallback: string) => fallback,
  usePushNotifications: () => ({ supported: true, needsInstall: !state.installed, configured: true, configLoading: false, configError: false, permission: 'granted', subscribed: state.subscribed, busy: false, subscribe: state.subscribe, unsubscribe: state.unsubscribe }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: state.invoke },
  from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.readFailure ? null : { reminders_enabled: true, daily_brief_enabled: false, brief_hour: 8 }, error: state.readFailure ? new Error('Offline') : null }) };
    return { ...query, update: (patch: unknown) => ({ eq: async (column: string, id: string) => { state.update(patch, column, id); return { error: null }; } }) };
  },
} }));
import { NotificationCard } from './NotificationCard';
beforeEach(() => { vi.clearAllMocks(); state.readFailure = false; state.installed = true; state.subscribed = true; state.invoke.mockResolvedValue({ data: { sent: 1 }, error: null }); });
afterEach(cleanup);
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NotificationCard /></QueryClientProvider>); }
describe('notification settings actions', () => {
  it('sends a real test request and does not call it delivered when rejected', async () => {
    state.invoke.mockResolvedValue({ data: { sent: 0 }, error: null });
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Send test notification' }));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('send-reminders', { body: { test: true } }));
    await screen.findByRole('status');
    expect(screen.getByRole('status')).toHaveTextContent('not delivered');
  });
  it('updates only the current owner’s reminder preference', async () => {
    mount(); const toggle = await screen.findByRole('switch', { name: 'Reminders' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(state.update).toHaveBeenCalledWith({ reminders_enabled: false }, 'id', 'owner'));
  });
  it('enables and disables notifications through their actual handlers', () => {
    state.subscribed = false; const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications on this device' }));
    expect(state.subscribe).toHaveBeenCalledOnce();
    view.unmount(); state.subscribed = true; mount();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off on this device' }));
    expect(state.unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not offer activation outside the iPhone installed app', () => {
    state.installed = false; mount();
    expect(screen.queryByRole('button', { name: 'Enable notifications on this device' })).toBeNull();
  });
});