// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = { link: null as null | { id: string; display_name: string; paused: boolean }, health: { configured: true, bot_username: 'memo_bot', webhook_set: true } as any, startError: null as string | null };
const invoke = vi.fn(async (_name: string, o: { body: { action: string } }) => {
  if (o.body.action === 'telegram_health') return { data: state.health, error: null };
  if (state.startError) return { data: { error: state.startError }, error: { message: 'x' } };
  return { data: { url: 'https://t.me/memo_bot?start=abc' }, error: null };
});
const rpc = vi.fn(async () => ({ error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: any[]) => (invoke as any)(...a) },
    rpc: (...a: any[]) => (rpc as any)(...a),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.link, error: null }) }) }),
      delete: () => ({ eq: async () => { state.link = null; return { error: null }; } }),
    }),
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const say = vi.fn();
vi.mock('@/lib/avatar/bus', () => ({ vAgent: { say: (...a: any[]) => say(...a) } }));

import { TelegramCard } from '@/components/settings/TelegramCard';

const renderCard = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TelegramCard /></QueryClientProvider>);

beforeEach(() => { state.link = null; state.health = { configured: true, bot_username: 'memo_bot', webhook_set: true }; state.startError = null; invoke.mockClear(); say.mockClear(); window.open = vi.fn() as any; });
afterEach(() => cleanup());

describe('Telegram settings card', () => {
  it('one tap: asks the server for a link and opens Telegram', async () => {
    renderCard();
    fireEvent.click(await screen.findByText('Connect Telegram'));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://t.me/memo_bot?start=abc', '_blank', 'noopener'));
    expect(await screen.findByText(/tap/i)).toBeTruthy();
  });

  it('notices the link as soon as the person taps Start, and V says so', async () => {
    renderCard();
    fireEvent.click(await screen.findByText('Connect Telegram'));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    state.link = { id: 'l1', display_name: '@ada', paused: false };
    expect(await screen.findByText(/Connected as @ada/, {}, { timeout: 6000 })).toBeTruthy();
    expect(say).toHaveBeenCalledWith(expect.stringContaining('Telegram is connected'), 'excited', 'high');
  }, 10000);

  it('connected: can pause and disconnect', async () => {
    state.link = { id: 'l1', display_name: '@ada', paused: false };
    renderCard();
    fireEvent.click(await screen.findByText('Pause saving'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_channel_paused', { _channel: 'telegram', _paused: true }));
    fireEvent.click(screen.getByText('Disconnect'));
    expect(await screen.findByText('Connect Telegram')).toBeTruthy();
  });

  it('server not set up: explains and does not offer a dead button', async () => {
    state.health = { configured: false };
    renderCard();
    expect(await screen.findByText(/isn't set up on this server/)).toBeTruthy();
    expect((screen.getByText('Connect Telegram').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('webhook missing: tells the owner exactly what to run', async () => {
    state.health = { configured: true, bot_username: 'memo_bot', webhook_set: false };
    renderCard();
    expect(await screen.findByText(/telegram-setup\.sh/)).toBeTruthy();
  });

  it('start failure is shown, not swallowed', async () => {
    state.startError = 'Too many attempts. Try again in a little while.';
    renderCard();
    fireEvent.click(await screen.findByText('Connect Telegram'));
    const { toast } = await import('sonner');
    await waitFor(() => expect((toast.error as any)).toHaveBeenCalledWith('Too many attempts. Try again in a little while.'));
    expect(window.open).not.toHaveBeenCalled();
  });
});
