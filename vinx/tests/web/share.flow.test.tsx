// @vitest-environment jsdom
// Share page flow tests. Not part of the app build. To run:
//   npm i -D vitest jsdom @testing-library/react @testing-library/dom
//   cp tests/web/share.flow.test.tsx src/pages/ && npx vitest run src/pages/share.flow.test.tsx
// (see tests/README.md; the file is kept outside src/ so a normal build never needs vitest)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

let authState: { user: { id: string } | null; loading: boolean } = { user: { id: 'U1' }, loading: false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

const mutateAsync = vi.fn();
vi.mock('@/hooks/useCaptureMemory', () => ({ useCaptureMemory: () => ({ mutateAsync }) }));

const deleteEq = vi.fn(async () => ({ error: null as null | { message: string } }));
const storageRemove = vi.fn(async () => ({}));
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_t: string) => ({ delete: () => ({ eq: deleteEq }) }),
    storage: { from: () => ({ remove: storageRemove }) },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import Share from './Share';

// Fake CacheStorage holding "what the service worker stored". Entries are plain descriptors so blob()
// returns a jsdom Blob (a Node Blob would not survive `new File([...])`).
type Entry = { json?: unknown; file?: { bytes: number; type: string; name: string } };
const store = new Map<string, Entry>();
const asResponse = (e: Entry) => ({
  json: async () => e.json,
  blob: async () => new Blob([new Uint8Array(e.file!.bytes)], { type: e.file!.type }),
  headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? e.file!.type : k.toLowerCase() === 'x-filename' ? encodeURIComponent(e.file!.name) : null) },
});
const fakeCaches = {
  open: async () => ({
    match: async (k: string) => (store.has(k) ? asResponse(store.get(k)!) : undefined),
    delete: async (k: string) => store.delete(k),
  }),
};
const shareText = (p: { title?: string; text?: string; url?: string }) =>
  store.set('/__shared-payload', { json: { title: '', text: '', url: '', ...p } });
const shareFile = (bytes: number, type: string, name = 'shot.png') =>
  store.set('/__shared-file', { file: { bytes, type, name } });

const mount = (strict = false) => {
  const qc = new QueryClient();
  const tree = <QueryClientProvider client={qc}><Share /></QueryClientProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(50); }); };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  store.clear(); navigate.mockReset(); mutateAsync.mockReset(); invoke.mockReset(); deleteEq.mockClear(); storageRemove.mockClear();
  mutateAsync.mockImplementation(async (a: { image: File | null }) => ({ id: 'mem1', media_url: a.image ? 'U1/x.png' : null }));
  authState = { user: { id: 'U1' }, loading: false };
  (globalThis as any).caches = fakeCaches; (window as any).caches = fakeCaches;
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
  window.close = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Share target page', () => {
  it('a shared screenshot is SAVED IMMEDIATELY with no note step', async () => {
    shareText({}); shareFile(2048, 'image/png');
    mount(); await flush();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mutateAsync.mock.calls[0][0];
    expect(arg.image).toBeInstanceOf(File);
    expect(arg.image.type).toBe('image/png');
    expect(arg.content).toBe('');
    expect(screen.getByText('Saved to Vinx')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/what do you want to remember/i)).toBeNull();
    expect(screen.queryByText(/save memory/i)).toBeNull();
    expect(store.size).toBe(0);
  });

  it('survives React StrictMode double-mount: still exactly one save', async () => {
    shareText({}); shareFile(100, 'image/png');
    mount(true); await flush();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('shared link/text saves as a browser memory, without duplicating the URL', async () => {
    shareText({ title: 'Great read', text: 'Check this https://ex.com/a', url: 'https://ex.com/a' });
    mount(); await flush();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mutateAsync.mock.calls[0][0];
    expect(arg.source).toBe('browser');
    expect(arg.image).toBeNull();
    expect(arg.content).toBe('Great read\nCheck this https://ex.com/a');
    expect((arg.content.match(/https:\/\/ex\.com\/a/g) ?? []).length).toBe(1);
  });

  it('tries to close the window after ~2s, and tells you if it could not', async () => {
    shareText({ text: 'hello' });
    mount(); await flush();
    expect(window.close).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2300); });
    expect(window.close).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(screen.getByText(/switch back to the app/i)).toBeTruthy();
  });

  it('Undo deletes the memory + its file, and cancels the auto-close', async () => {
    shareText({}); shareFile(100, 'image/png');
    mount(); await flush();
    await act(async () => { fireEvent.click(screen.getByText('Undo')); });
    await flush();
    expect(deleteEq).toHaveBeenCalledWith('id', 'mem1');
    expect(storageRemove).toHaveBeenCalledWith(['U1/x.png']);
    expect(screen.getByText(/nothing was kept/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(window.close).not.toHaveBeenCalled();
  });

  it('a failed Undo keeps the Saved screen and does not claim success', async () => {
    shareText({ text: 'x' });
    deleteEq.mockResolvedValueOnce({ error: { message: 'rls' } });
    mount(); await flush();
    await act(async () => { fireEvent.click(screen.getByText('Undo')); });
    await flush();
    expect(screen.queryByText(/nothing was kept/i)).toBeNull();
    expect(screen.getByText('Saved to Vinx')).toBeTruthy();
  });

  it('a failed save keeps the shared data and Try again works', async () => {
    shareText({ text: 'important' });
    mutateAsync.mockRejectedValueOnce(new Error('network'));
    mount(); await flush();
    expect(screen.getByText(/couldn't save that/i)).toBeTruthy();
    expect(store.size).toBe(1);
    await act(async () => { fireEvent.click(screen.getByText('Try again')); });
    await flush();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls[1][0].content).toBe('important');
    expect(screen.getByText('Saved to Vinx')).toBeTruthy();
    expect(store.size).toBe(0);
  });

  it('missing storage bucket gives a specific message', async () => {
    shareText({}); shareFile(100, 'image/png');
    mutateAsync.mockRejectedValueOnce(new Error('Bucket not found'));
    mount(); await flush();
    expect(screen.getByText(/memory-media/)).toBeTruthy();
  });

  it('oversized image is rejected before any upload', async () => {
    shareText({}); shareFile(11 * 1024 * 1024, 'image/png');
    mount(); await flush();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/larger than 10 MB/i)).toBeTruthy();
  });

  it('opened directly (nothing shared): shows a note box and does NOT auto-save', async () => {
    mount(); await flush();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/what do you want to remember/i)).toBeTruthy();
  });

  it('shared voice note is transcribed then saved as a voice memory', async () => {
    shareText({}); shareFile(5000, 'audio/ogg', 'note.ogg');
    invoke.mockResolvedValueOnce({ data: { text: 'remind me to call Sarah' }, error: null });
    mount(); await flush();
    expect(invoke).toHaveBeenCalledWith('voice-to-text', expect.objectContaining({ body: expect.objectContaining({ mimeType: 'audio/ogg' }) }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ content: 'remind me to call Sarah', source: 'voice', image: null });
  });

  it('failed transcription falls back to the note box (nothing saved blindly)', async () => {
    shareText({}); shareFile(5000, 'audio/ogg', 'note.ogg');
    invoke.mockResolvedValueOnce({ data: { text: '' }, error: null });
    mount(); await flush();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/what do you want to remember/i)).toBeTruthy();
  });

  it('signed out: sends you to sign in (and back), saves nothing', async () => {
    authState = { user: null, loading: false };
    shareText({ text: 'x' });
    mount(); await flush();
    expect(navigate).toHaveBeenCalledWith('/auth?next=%2Fshare%3Fshared%3D1', { replace: true });
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(store.size).toBe(1);
  });
});
