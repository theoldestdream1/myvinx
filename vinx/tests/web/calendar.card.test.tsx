// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = { token: 'tok1', fail: false };
const feed = () => ({ https: `https://p.supabase.co/functions/v1/calendar-feed?t=${state.token}`, webcal: `webcal://p.supabase.co/functions/v1/calendar-feed?t=${state.token}` });
const invoke = vi.fn(async (_n: string, o: { body: { action: string } }) => {
  if (state.fail) return { data: { error: 'nope' }, error: { message: 'x' } };
  if (o.body.action === 'calendar_regenerate') state.token = 'tok2';
  return { data: feed(), error: null };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: any[]) => (invoke as any)(...a) } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { CalendarCard } from '@/components/settings/CalendarCard';
const renderCard = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CalendarCard /></QueryClientProvider>);
beforeEach(() => { state.token = 'tok1'; state.fail = false; invoke.mockClear(); toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => cleanup());

describe('Calendar settings card', () => {
  it('offers one-tap subscribe with a webcal link', async () => {
    renderCard();
    const a = (await screen.findByText('Add to iPhone / Mac calendar')).closest('a')!;
    expect(a.getAttribute('href')).toBe('webcal://p.supabase.co/functions/v1/calendar-feed?t=tok1');
  });
  it('copies the https link', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard();
    fireEvent.click(await screen.findByText('Copy link'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://p.supabase.co/functions/v1/calendar-feed?t=tok1'));
  });
  it('rotates only after confirmation and shows the new link', async () => {
    renderCard();
    const btn = await screen.findByText('New link');
    window.confirm = vi.fn(() => false); fireEvent.click(btn);
    expect(invoke.mock.calls.some((c) => c[1].body.action === 'calendar_regenerate')).toBe(false);
    window.confirm = vi.fn(() => true); fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('Add to iPhone / Mac calendar').closest('a')!.getAttribute('href')).toContain('t=tok2'));
  });
  it('degrades gracefully when the server fails', async () => {
    state.fail = true;
    renderCard();
    expect(await screen.findByText(/Couldn't load your calendar link/)).toBeTruthy();
  });
});
