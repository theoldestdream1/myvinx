import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' }, loading: false }) }));
vi.mock('@/lib/router-compat', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import SetupShortcuts from './SetupShortcuts';
beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ data: { token: 'synthetic-capture-fixture' }, error: null }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('shortcut setup controls', () => {
  it('creates a key and tests authentication without writing a memory', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 400, json: async () => ({ error: 'Nothing to save. Send text, a url, an image or audio.' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<SetupShortcuts />);
    fireEvent.click(screen.getByRole('button', { name: 'Create my key' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Test my capture connection' }));
    await screen.findByRole('button', { name: 'Connection verified — test again' });
    expect(fetchMock.mock.calls[0][1].body).toBe('{}');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(mocks.invoke).toHaveBeenCalledWith('generate-device-token', expect.any(Object));
  });
  it('recovers the create button when key generation fails', async () => {
    mocks.invoke.mockRejectedValue(new Error('Offline fixture'));
    render(<SetupShortcuts />); fireEvent.click(screen.getByRole('button', { name: 'Create my key' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Create my key' })).toBeEnabled();
  });
  it('does not verify a revoked key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, json: async () => ({ error: 'Invalid or revoked device key' }) }));
    render(<SetupShortcuts />); fireEvent.click(screen.getByRole('button', { name: 'Create my key' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Test my capture connection' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Test my capture connection' })).toBeEnabled();
  });
});