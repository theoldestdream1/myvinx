// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const auth = { user: { id: 'u1' } as null | { id: string }, loading: false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const saves: any[] = [];
let failNext = false;
vi.mock('@/hooks/useCaptureMemory', () => ({
  useCaptureMemory: () => ({ mutateAsync: async (a: any) => { saves.push(a); if (failNext) { failNext = false; throw new Error('offline'); } return { id: 'mem1', media_url: a.image ? 'u1/x.png' : null }; } }),
}));
const voice = { isRecording: false, isProcessing: false, duration: 0, startRecording: vi.fn(async () => {}), stopRecording: vi.fn(), cancelRecording: vi.fn(), opts: null as any };
vi.mock('@/hooks/useVoiceRecording', () => ({ useVoiceRecording: (o: any) => { voice.opts = o; return voice; } }));
const del = vi.fn(async () => ({ error: null })); const remove = vi.fn(async () => ({}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ delete: () => ({ eq: del }) }), storage: { from: () => ({ remove }) } } }));

import Quick from '@/pages/Quick';

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const mount = (url = '/quick') => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[url]}><Routes><Route path="/quick" element={<Quick />} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>
  </QueryClientProvider>);

beforeEach(() => { saves.length = 0; auth.user = { id: 'u1' }; voice.startRecording.mockClear(); del.mockClear(); remove.mockClear(); });
afterEach(cleanup);

describe('/quick', () => {
  it('has the cursor ready and saves with the button', async () => {
    mount();
    const box = screen.getByLabelText('What do you want to remember?');
    await waitFor(() => expect(document.activeElement).toBe(box));
    fireEvent.change(box, { target: { value: 'call Amaka about the venue' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(saves[0]).toMatchObject({ content: 'call Amaka about the venue', source: 'manual' });
  });

  it('Ctrl/Cmd+Enter saves', async () => {
    mount();
    const box = screen.getByLabelText('What do you want to remember?');
    fireEvent.change(box, { target: { value: 'keyboard save' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await screen.findByText('Saved');
    expect(saves).toHaveLength(1);
  });

  it('empty text cannot be saved', () => {
    mount();
    expect((screen.getByText('Save').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a pasted screenshot is saved instantly', async () => {
    mount();
    const file = new File([new Uint8Array([1, 2, 3])], 'p.png', { type: 'image/png' });
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as any;
    ev.clipboardData = { files: [file] };
    act(() => { window.dispatchEvent(ev); });
    await screen.findByText('Saved');
    expect(saves[0]).toMatchObject({ source: 'image', image: file });
    expect(ev.defaultPrevented).toBe(true);
  });

  it('pasting plain text just fills the box (no image, no save)', () => {
    mount();
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as any;
    ev.clipboardData = { files: [] };
    act(() => { window.dispatchEvent(ev); });
    expect(saves).toHaveLength(0);
  });

  it('SAFETY: a link can prefill the box but can never save by itself', async () => {
    mount('/quick?text=send%20money%20to%20evil');
    expect((screen.getByLabelText('What do you want to remember?') as HTMLTextAreaElement).value).toBe('send money to evil');
    await new Promise((r) => setTimeout(r, 100));
    expect(saves).toHaveLength(0);
  });

  it('?mode=voice starts listening immediately', async () => {
    mount('/quick?mode=voice');
    await waitFor(() => expect(voice.startRecording).toHaveBeenCalledTimes(1));
  });

  it('plain /quick does not touch the microphone', async () => {
    mount('/quick');
    await new Promise((r) => setTimeout(r, 50));
    expect(voice.startRecording).not.toHaveBeenCalled();
  });

  it('a finished voice note is saved without another tap', async () => {
    mount('/quick?mode=voice');
    await act(async () => { voice.opts.onTranscription('buy cement on Friday'); });
    await screen.findByText('Saved');
    expect(saves[0]).toMatchObject({ content: 'buy cement on Friday', source: 'voice' });
  });

  it('silence is reported, not saved', async () => {
    mount();
    await act(async () => { voice.opts.onTranscription('   '); });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(saves).toHaveLength(0);
  });

  it('Undo really removes the memory and its image', async () => {
    mount();
    const file = new File([new Uint8Array([1])], 'p.png', { type: 'image/png' });
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as any; ev.clipboardData = { files: [file] };
    act(() => { window.dispatchEvent(ev); });
    fireEvent.click(await screen.findByText('Undo'));
    await waitFor(() => expect(del).toHaveBeenCalledWith('id', 'mem1'));
    expect(remove).toHaveBeenCalledWith(['u1/x.png']);
    expect(await screen.findByLabelText('What do you want to remember?')).toBeTruthy();
  });

  it('a failed save keeps the text and says so', async () => {
    mount();
    failNext = true;
    const box = screen.getByLabelText('What do you want to remember?');
    fireEvent.change(box, { target: { value: 'important note' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('What do you want to remember?') as HTMLTextAreaElement).value).toBe('important note');
  });

  it('signed-out visitors are sent to sign in and brought back', async () => {
    auth.user = null;
    mount('/quick?mode=voice');
    expect((await screen.findByTestId('where')).textContent).toBe('/auth?next=%2Fquick%3Fmode%3Dvoice');
  });
});
