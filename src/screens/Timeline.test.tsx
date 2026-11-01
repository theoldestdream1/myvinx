import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryWithInsights } from '@/lib/memoryLifecycle';

const state = vi.hoisted(() => ({ rows: [] as MemoryWithInsights[], change: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' }, loading: false }) }));
vi.mock('@/lib/router-compat', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ error: null }) } } }));
vi.mock('@/lib/memoryLifecycle', async () => {
  const actual = await vi.importActual<typeof import('@/lib/memoryLifecycle')>('@/lib/memoryLifecycle');
  return { ...actual, retryAttachmentCleanup: vi.fn().mockResolvedValue(undefined), listMemories: async (_: string, trash: boolean) => state.rows.filter(m => !!m.deleted_at === trash).map(m => ({ ...m })), changeMemory: state.change };
});
import Timeline from './Timeline';
import { supabase } from '@/integrations/supabase/client';

describe('Timeline memory lifecycle interactions', () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockReset().mockResolvedValue({ data: null, error: null });
    state.rows = [{ id: 'memory1', user_id: 'owner', raw_content: 'Original meeting note', status: 'processed', source: 'manual', captured_at: '2026-10-30T12:00:00Z', updated_at: '2026-10-30T12:00:00Z', deleted_at: null, structured_events: [{ id: 'event1', title: 'Meeting', summary: 'Original summary', topics: ['work'] }] } as MemoryWithInsights];
    state.change.mockReset();
    state.change.mockImplementation(async (memory, action, draft) => {
      const row = state.rows.find(m => m.id === memory.id);
      if (!row) throw new Error('Missing memory');
      if (action === 'edit') { row.raw_content = draft.content; row.structured_events[0].title = draft.title; row.structured_events[0].summary = draft.summary; row.structured_events[0].topics = draft.topics; }
      if (action === 'trash') row.deleted_at = '2026-10-30T23:00:00Z';
      if (action === 'restore') row.deleted_at = null;
      if (action === 'purge') state.rows = [];
      return row;
    });
  });
  afterEach(cleanup);
  function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><Timeline /></QueryClientProvider>); }
  it('re-reads a saved video by its memory ID and reads back updated insights', async () => {
    state.rows[0].metadata = { link: { url:'https://vt.tiktok.com/ZSgwQcMB6/',evidence:'unavailable' } };
    vi.mocked(supabase.functions.invoke).mockImplementation(async () => {
      state.rows[0].structured_events[0].title = 'London outfit check';
      return { data:{ success:true },error:null };
    });
    mount(); fireEvent.click(await screen.findByRole('button',{name:'Re-read link'}));
    await screen.findByRole('heading',{name:'London outfit check'});
    expect(supabase.functions.invoke).toHaveBeenCalledWith('process-memory',{ body:{ memoryId:'memory1',force:true } });
  });
  it('saves edited note, title, summary, and deduplicated tags then reads them back', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Edit memory' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Corrected note' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated meeting' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Corrected summary' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'work, planning, work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(state.rows[0].raw_content).toBe('Corrected note'));
    expect(state.rows[0].structured_events[0].topics).toEqual(['work', 'planning']);
    await screen.findByRole('heading', { name: 'Updated meeting' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('requires confirmation, moves a note to Trash, restores it, and permanently deletes it', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Move to Trash' }));
    expect(state.change).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move to Trash' }).at(-1) as HTMLElement);
    await waitFor(() => expect(state.rows[0].deleted_at).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^Trash$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(state.rows[0].deleted_at).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^Memories$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Trash' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Move to Trash' }).at(-1) as HTMLElement);
    await waitFor(() => expect(state.rows[0].deleted_at).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^Trash$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    expect(state.rows).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete permanently' }).at(-1) as HTMLElement);
    await waitFor(() => expect(state.rows).toHaveLength(0));
  });
});