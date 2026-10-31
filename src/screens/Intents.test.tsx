import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reminder } from '@/lib/reminders';
const state = vi.hoisted(() => ({ rows: [] as Reminder[], rpc: vi.fn(), failRead: false }));
vi.mock('@/components/settings/NotificationCard', () => ({ NotificationCard: () => <div /> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' }, loading: false }) }));
vi.mock('@/lib/router-compat', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: () => { const q = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: async () => ({ data: state.rows.map(r => ({ ...r })), error: state.failRead ? new Error('Offline') : null }) }; return q; } } }));
import Intents from './Intents';
HTMLElement.prototype.scrollIntoView = vi.fn();
describe('reminder interactions', () => {
  beforeEach(() => {
    state.failRead = false;
    state.rows = [{ id: 'r1', user_id: 'owner', intent_text: 'Review the budget', trigger_type: 'date', status: 'pending', trigger_date: '2099-01-01T09:00:00Z', repeat_frequency: 'daily', repeat_interval: 1, repeat_timezone: 'UTC', created_at: '2026-10-31T09:00:00Z' } as Reminder];
    state.rpc.mockReset().mockImplementation(async (_name, args) => {
      const row = state.rows[0];
      if (args._action === 'done') { row.status = 'resolved'; state.rows.push({ ...row, id: 'r2', status: 'pending', trigger_date: '2099-01-02T09:00:00Z' }); }
      if (args._action === 'snooze') row.trigger_date = args._date;
      if (args._action === 'schedule') { row.repeat_frequency = args._frequency; row.repeat_interval = args._interval; }
      return { data: row, error: null };
    });
  });
  afterEach(cleanup);
  function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><Intents /></QueryClientProvider>); }
  it('completes a reminder and reads back its next occurrence with history', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(state.rows).toHaveLength(2));
    await screen.findByText('History (1)');
    expect(screen.getAllByText('Review the budget')).toHaveLength(2);
    expect(state.rpc.mock.calls[0][1]._action).toBe('done');
  });
  it('turns off recurrence from the schedule dialog', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Repeat' }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Does not repeat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(state.rows[0].repeat_frequency).toBe('none'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('custom snooze changes the due date without completing or spawning a reminder', async () => {
    mount(); fireEvent.keyDown(await screen.findByRole('button', { name: 'Snooze' }), { key: 'Enter' });
    fireEvent.click(await screen.findByText('Choose date & time…'));
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2099-02-03T10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].status).toBe('pending');
    expect(new Date(state.rows[0].trigger_date ?? '').getFullYear()).toBe(2099);
    expect(new Date(state.rows[0].trigger_date ?? '').getMonth()).toBe(1);
  });
  it('failed completion leaves the reminder open', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'Offline' } });
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    expect(state.rows[0].status).toBe('pending');
    expect(state.rows).toHaveLength(1);
  });
  it('shows retry instead of a misleading empty state on fetch failure', async () => {
    state.failRead = true; mount();
    await screen.findByRole('button', { name: 'Try again' });
    state.failRead = false; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Review the budget');
  });
});