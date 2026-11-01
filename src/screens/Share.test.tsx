import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ save: vi.fn(), navigate: vi.fn(), options: {} as Record<string, unknown>, user: { id: 'owner' } as { id: string } | null, loading: false, update: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user, loading: state.loading }) }));
vi.mock('@/lib/router-compat', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/hooks/useCaptureMemory', () => ({ useCaptureMemory: (_: unknown, options: Record<string, unknown>) => { state.options = options; return { mutateAsync: state.save }; } }));
vi.mock('@/hooks/usePushNotifications', () => ({ functionErrorMessage: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ update: () => ({ eq: () => ({ eq: state.update }) }) }) } }));
import Share from './Share';

describe('Share immediate capture', () => {
  let remove: ReturnType<typeof vi.fn>;
  let match: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    state.user = { id: 'owner' }; state.loading = false;
    state.save.mockReset().mockResolvedValue({ id: 'memory1', media_url: null });
    state.navigate.mockReset(); state.update.mockReset().mockResolvedValue({ error: null });
    remove = vi.fn().mockResolvedValue(true);
    match = vi.fn(async (key: string) => key === '/__shared-payload' ? { json: async () => ({ title: 'Video', text: 'https://example.com/video', url: 'https://example.com/video' }) } : null);
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ match, delete: remove }) });
    vi.spyOn(window, 'close').mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function mount() { const client = new QueryClient(); return render(<QueryClientProvider client={client}><Share /></QueryClientProvider>); }
  it('saves a shared link once, without waiting on cache cleanup, and tries returning promptly', async () => {
    remove.mockImplementation(() => new Promise(() => {}));
    mount(); await screen.findByText('Saved to Vinx');
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledWith({ content: 'Video\nhttps://example.com/video', image: null, source: 'browser' });
    expect(state.options.remoteOnly).toBe(true);
    await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1), { timeout: 900 });
    await screen.findByText('You can return to your previous app.');
  });
  it('preserves the share and its client ID on failure, then checks for a previous write on retry', async () => {
    state.save.mockRejectedValueOnce(new Error('Failed to fetch'));
    mount(); await screen.findByText("Couldn't save that");
    const id = state.options.clientId;
    expect(remove).not.toHaveBeenCalled(); expect(window.close).not.toHaveBeenCalled();
    expect(state.options.skipInitialLookup).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Saved to Vinx');
    expect(state.options.clientId).toBe(id); expect(state.save).toHaveBeenCalledTimes(2);
  });
  it('never confirms an offline queue as remotely saved', async () => {
    state.save.mockResolvedValue({ queued: true, id: 'local1', media_url: null });
    mount(); await screen.findByText("Couldn't save that");
    expect(remove).not.toHaveBeenCalled(); expect(window.close).not.toHaveBeenCalled();
  });
  it('preserves signed-out payloads and returns to the sharing screen after sign-in', async () => {
    state.user = null; mount();
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/auth?next=%2Fshare%3Fshared%3D1', { replace: true }));
    expect(state.save).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
  it('does not auto-close an ordinary manual note', async () => {
    match.mockResolvedValue(null); mount();
    await screen.findByText('Save a note to Vinx');
    fireEvent.change(screen.getByPlaceholderText('What do you want to remember?'), { target: { value: 'Buy milk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));
    await screen.findByText('Saved to Vinx');
    await new Promise(resolve => setTimeout(resolve, 550));
    expect(window.close).not.toHaveBeenCalled();
  });
  it('Undo cancels automatic return and moves the confirmed memory to Trash', async () => {
    mount(); await screen.findByText('Saved to Vinx');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('Moved to Trash.');
    await new Promise(resolve => setTimeout(resolve, 550));
    expect(state.update).toHaveBeenCalledWith('user_id', 'owner'); expect(window.close).not.toHaveBeenCalled();
  });
});