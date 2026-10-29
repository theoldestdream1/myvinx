// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = { info: { configured: true, address: 'abc123abc123ab@in.vinx.test', extra_senders: [] as string[] } as any, error: null as string | null };
const invoke = vi.fn(async (_n: string, o: { body: { action: string; email?: string } }) => {
  const { action, email } = o.body;
  if (state.error) return { data: { error: state.error }, error: { message: 'x' } };
  if (action === 'email_regenerate') state.info = { ...state.info, address: 'newnewnewnew12@in.vinx.test' };
  if (action === 'email_add_sender') state.info = { ...state.info, extra_senders: [...state.info.extra_senders, email] };
  if (action === 'email_remove_sender') state.info = { ...state.info, extra_senders: state.info.extra_senders.filter((e: string) => e !== email) };
  return { data: state.info, error: null };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: any[]) => (invoke as any)(...a) } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { EmailCard } from '@/components/settings/EmailCard';
const renderCard = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EmailCard /></QueryClientProvider>);

beforeEach(() => { state.info = { configured: true, address: 'abc123abc123ab@in.vinx.test', extra_senders: [] }; state.error = null; invoke.mockClear(); toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => cleanup());

describe('Email settings card', () => {
  it('shows the private address and copies it', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard();
    expect((await screen.findByTestId('inbound-address')).textContent).toBe('abc123abc123ab@in.vinx.test');
    fireEvent.click(screen.getByLabelText('Copy address'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('abc123abc123ab@in.vinx.test'));
  });
  it('says so when the server has no inbound domain', async () => {
    state.info = { configured: false };
    renderCard();
    expect(await screen.findByText(/isn't set up on this server/)).toBeTruthy();
  });
  it('adds and removes an approved sender', async () => {
    renderCard();
    fireEvent.change(await screen.findByLabelText('Another email address to accept'), { target: { value: 'work@corp.com' } });
    fireEvent.click(screen.getByText('Add'));
    expect(await screen.findByText('work@corp.com')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove work@corp.com'));
    await waitFor(() => expect(screen.queryByText('work@corp.com')).toBeNull());
  });
  it('only rotates the address after confirmation', async () => {
    renderCard();
    await screen.findByTestId('inbound-address');
    window.confirm = vi.fn(() => false);
    fireEvent.click(screen.getByLabelText('Create a new address'));
    expect(invoke.mock.calls.some((c) => c[1].body.action === 'email_regenerate')).toBe(false);
    window.confirm = vi.fn(() => true);
    fireEvent.click(screen.getByLabelText('Create a new address'));
    await waitFor(() => expect(screen.getByTestId('inbound-address').textContent).toBe('newnewnewnew12@in.vinx.test'));
  });
  it('shows the server error for a bad address', async () => {
    renderCard();
    await screen.findByTestId('inbound-address');
    state.error = 'That doesn\'t look like an email address.';
    fireEvent.change(screen.getByLabelText('Another email address to accept'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That doesn't look like an email address."));
  });
});
