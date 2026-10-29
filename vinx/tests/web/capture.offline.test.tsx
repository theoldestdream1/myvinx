// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const net = vi.hoisted(() => ({ down: false, rows: [] as any[], invoked: [] as string[], insertError: null as any }));
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const f: Array<[string, any]> = []; let op = 'select'; let payload: any;
    const b: any = {
      select: () => b, insert: (p: any) => { op = 'insert'; payload = p; return b; }, eq: (c: string, v: any) => { f.push([c, v]); return b; },
      limit: () => b, single: () => b,
      then: (res: any, rej: any) => (async () => {
        if (net.down) throw new TypeError('Failed to fetch');
        if (op === 'insert') {
          if (net.insertError) return { data: null, error: net.insertError };
          const row = { id: `m${net.rows.length + 1}`, created_at: 'now', media_url: payload[0].media_url, source: payload[0].source, ...payload[0] };
          net.rows.push(row); return { data: row, error: null };
        }
        const hit = net.rows.filter((r) => f.every(([c, v]) => (c === 'metadata->>client_id' ? r.metadata?.client_id === v : r[c] === v)));
        return { data: hit, error: null };
      })().then(res, rej),
    };
    return b;
  };
  return { supabase: {
    from: builder,
    storage: { from: () => ({ upload: async () => { if (net.down) throw new TypeError('Failed to fetch'); return { error: null }; }, remove: async () => ({}) }) },
    functions: { invoke: async (n: string, o: any) => { net.invoked.push(n + ':' + o.body.memoryId); return { error: null }; } },
  } };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/avatar/bus', () => ({ vAgent: { say: vi.fn() } }));

import { listQueued, removeQueued, __resetQueueForTests } from '@/lib/captureQueue';
import { OutboxFlusher } from '@/components/capture/OutboxFlusher';
import { GlobalCapture } from '@/components/capture/GlobalCapture';

const wrap = (ui: React.ReactNode, path = '/dashboard') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>);
const goOnline = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v);

beforeEach(async () => { for (const i of await listQueued()) await removeQueued(i.id); __resetQueueForTests(); net.down = false; net.rows = []; net.invoked = []; net.insertError = null; Object.values(toast).forEach((f: any) => f.mockClear?.()); vi.restoreAllMocks(); });
afterEach(() => cleanup());

describe('GlobalCapture + offline outbox', () => {
  it('Ctrl+Shift+M opens the box; Ctrl+Enter saves and closes it', async () => {
    wrap(<GlobalCapture />);
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true, shiftKey: true });
    const box = await screen.findByLabelText('What do you want to remember?');
    fireEvent.change(box, { target: { value: 'buy oat milk' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(net.rows.length).toBe(1));
    expect(net.rows[0].raw_content).toBe('buy oat milk');
    expect(net.rows[0].metadata.client_id).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText('What do you want to remember?')).toBeNull());
    expect(net.invoked[0]).toBe('process-memory:m1');
  });
  it('Cmd+Shift+M works on Mac too, and toggles closed', async () => {
    wrap(<GlobalCapture />);
    fireEvent.keyDown(window, { key: 'm', metaKey: true, shiftKey: true });
    await screen.findByLabelText('What do you want to remember?');
    fireEvent.keyDown(window, { key: 'm', metaKey: true, shiftKey: true });
    await waitFor(() => expect(screen.queryByLabelText('What do you want to remember?')).toBeNull());
  });
  it('is inactive on pages with their own capture UI', () => {
    wrap(<GlobalCapture />, '/quick');
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true, shiftKey: true });
    expect(screen.queryByLabelText('What do you want to remember?')).toBeNull();
  });
  it('pasting text opens the box pre-filled and saves nothing by itself', async () => {
    wrap(<GlobalCapture />);
    fireEvent.paste(document.body, { clipboardData: { files: [], getData: () => 'https://example.com/article' } });
    const box = (await screen.findByLabelText('What do you want to remember?')) as HTMLTextAreaElement;
    expect(box.value).toBe('https://example.com/article');
    expect(net.rows.length).toBe(0);
  });
  it('pasting a screenshot saves it straight away', async () => {
    wrap(<GlobalCapture />);
    const file = new File([new Uint8Array([1, 2])], 'shot.png', { type: 'image/png' });
    fireEvent.paste(document.body, { clipboardData: { files: [file], getData: () => '' } });
    await waitFor(() => expect(net.rows.length).toBe(1));
    expect(net.rows[0].source).toBe('image');
  });
  it('never hijacks pasting into a text field', () => {
    wrap(<><input aria-label="name" /><GlobalCapture /></>);
    fireEvent.paste(screen.getByLabelText('name'), { clipboardData: { files: [], getData: () => 'my name' } });
    expect(screen.queryByLabelText('What do you want to remember?')).toBeNull();
  });

  it('offline: the note is kept on the device, the person is told, and nothing is lost', async () => {
    wrap(<GlobalCapture />);
    net.down = true;
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true, shiftKey: true });
    const box = await screen.findByLabelText('What do you want to remember?');
    fireEvent.change(box, { target: { value: 'idea on the plane' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    const q = await listQueued('u1');
    expect(q.length).toBe(1); expect(q[0].content).toBe('idea on the plane');
    expect(net.rows.length).toBe(0);
  });
  it('back online: the flusher sends it once, processes it, and clears the queue', async () => {
    wrap(<GlobalCapture />);
    net.down = true;
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true, shiftKey: true });
    const box = await screen.findByLabelText('What do you want to remember?');
    fireEvent.change(box, { target: { value: 'idea on the plane' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(async () => expect((await listQueued('u1')).length).toBe(1));
    cleanup();

    net.down = false;
    wrap(<OutboxFlusher />); // the app is reopened
    await waitFor(() => expect(net.rows.length).toBe(1));
    expect(net.rows[0].raw_content).toBe('idea on the plane');
    await waitFor(async () => expect((await listQueued('u1')).length).toBe(0));
    expect(net.invoked).toEqual(['process-memory:m1']);
    expect(toast.success).toHaveBeenCalledWith('Sent the memory you saved offline');
  });
  it('is safe to retry: if the first attempt actually reached the server, no duplicate is created', async () => {
    wrap(<GlobalCapture />);
    net.down = true;
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true, shiftKey: true });
    const box = await screen.findByLabelText('What do you want to remember?');
    fireEvent.change(box, { target: { value: 'sent but reply lost' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(async () => expect((await listQueued('u1')).length).toBe(1));
    const [q] = await listQueued('u1');
    net.rows.push({ id: 'already', user_id: 'u1', raw_content: 'sent but reply lost', metadata: { client_id: q.id } }); // the "lost reply" case
    cleanup(); net.down = false;
    wrap(<OutboxFlusher />);
    await waitFor(async () => expect((await listQueued('u1')).length).toBe(0));
    expect(net.rows.length).toBe(1);
  });
  it('a real server error (not a network problem) is shown, not silently queued', async () => {
    wrap(<GlobalCapture />);
    net.insertError = { message: 'new row violates row-level security policy', code: '42501' };
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true, shiftKey: true });
    const box = await screen.findByLabelText('What do you want to remember?');
    fireEvent.change(box, { target: { value: 'x' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect((await listQueued('u1')).length).toBe(0);
  });
  it('the flusher waits while the browser says it is offline', async () => {
    const { listQueued: l } = await import('@/lib/captureQueue');
    const { enqueue } = await import('@/lib/captureQueue');
    await enqueue({ id: 'q1', userId: 'u1', content: 'queued', source: 'manual' });
    goOnline(false);
    wrap(<OutboxFlusher />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(net.rows.length).toBe(0); expect((await l('u1')).length).toBe(1);
  });
});
