import { renderHook, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), lookup: vi.fn(), invoke: vi.fn(), enqueue: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from, functions: { invoke: state.invoke } } }));
vi.mock('@/lib/captureQueue', () => ({ enqueue: state.enqueue, isNetworkError: () => true }));
import { saveMemory, useCaptureMemory } from './useCaptureMemory';
const input = { content: 'Shared link', source: 'browser' as const };
describe('Fast remote capture', () => {
  beforeEach(() => {
    state.insert.mockReset().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'memory1', media_url: null }, error: null }) }) });
    state.lookup.mockReset().mockResolvedValue({ data: [], error: null });
    state.invoke.mockReset().mockResolvedValue({ error: null }); state.enqueue.mockReset();
    state.from.mockReset().mockReturnValue({ insert: state.insert, select: () => ({ eq: () => ({ eq: () => ({ limit: state.lookup }) }) }) });
  });
  afterEach(cleanup);
  it('fresh share takes one database request and stores its retry ID', async () => {
    await saveMemory('owner', input, 'share1', false);
    expect(state.lookup).not.toHaveBeenCalled(); expect(state.from).toHaveBeenCalledTimes(1);
    expect(state.insert.mock.calls[0][0][0].metadata.client_id).toBe('share1');
  });
  it('retry returns the previously saved row rather than inserting another', async () => {
    state.lookup.mockResolvedValue({ data: [{ id: 'existing' }], error: null });
    expect(await saveMemory('owner', input, 'share1')).toEqual({ id: 'existing' });
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('failed retry lookup cannot proceed to a potentially duplicate insert', async () => {
    state.lookup.mockResolvedValue({ data: null, error: new Error('Network') });
    await expect(saveMemory('owner', input, 'share1')).rejects.toThrow('Network');
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('remote-only sharing rejects network failures instead of silently queuing', async () => {
    state.lookup.mockResolvedValue({ data: null, error: new Error('Network') });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useCaptureMemory(undefined, { remoteOnly: true, silent: true, clientId: 'share1' }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('Network'); });
    expect(state.enqueue).not.toHaveBeenCalled();
  });
});