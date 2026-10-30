import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from './memoryLifecycle';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ remove: mocks.remove }) } } }));
import { changeMemory, listMemories, validateMemoryAction } from './memoryLifecycle';
const memory = { id: 'm1', user_id: 'owner', status: 'processed', deleted_at: null, updated_at: '2026-10-30T23:00:00Z', media_url: null, metadata: {} } as Memory;

describe('Memory lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: memory, error: null }); mocks.remove.mockResolvedValue({ error: null }); });
  it('edits the saved note and extracted insight together using a conflict timestamp', async () => {
    await changeMemory(memory, 'edit', { content: ' corrected note ', eventId: 'e1', title: 'Corrected insight', summary: 'New summary', topics: ['work'] });
    expect(mocks.rpc).toHaveBeenCalledWith('memory_lifecycle', expect.objectContaining({ _id: 'm1', _expected_updated_at: memory.updated_at, _content: 'corrected note', _event_id: 'e1', _title: 'Corrected insight', _topics: ['work'] }));
  });
  it('rejects blank notes without writing', async () => {
    await expect(changeMemory(memory, 'edit', { content: '  ' })).rejects.toThrow('Note cannot be empty');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not edit while background understanding is in progress', () => {
    expect(() => validateMemoryAction({ ...memory, status: 'processing' }, 'edit', { content: 'new' })).toThrow();
  });
  it('moves to Trash without deleting the attachment', async () => {
    await changeMemory({ ...memory, media_url: 'owner/image.png' }, 'trash');
    expect(mocks.rpc).toHaveBeenCalledWith('memory_lifecycle', expect.objectContaining({ _action: 'trash' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('restores a trashed memory without reprocessing or replacing reminders', async () => {
    await changeMemory({ ...memory, deleted_at: '2026-10-30T23:01:00Z' }, 'restore');
    expect(mocks.rpc).toHaveBeenCalledWith('memory_lifecycle', expect.objectContaining({ _action: 'restore' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('requires Trash before permanent deletion', async () => {
    await expect(changeMemory(memory, 'purge')).rejects.toThrow('Move to Trash first');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('permanently deletes only attachments in the owner folder', async () => {
    await changeMemory({ ...memory, deleted_at: '2026-10-30', media_url: 'owner/photo.png', metadata: { audio_path: 'other/voice.webm' } }, 'purge');
    expect(mocks.remove).toHaveBeenCalledWith(['owner/photo.png']);
  });
  it('propagates conflicts without deleting attachments', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Memory changed. Refresh and try again.') });
    await expect(changeMemory({ ...memory, deleted_at: '2026-10-30', media_url: 'owner/photo.png' }, 'purge')).rejects.toThrow('Memory changed');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('does not silently report attachment cleanup failure as complete', async () => {
    mocks.remove.mockResolvedValue({ error: new Error('offline') });
    await expect(changeMemory({ ...memory, deleted_at: '2026-10-30', media_url: 'owner/photo.png' }, 'purge')).rejects.toThrow('attachment could not be removed');
  });
  it('scopes active and Trash lists to the owner and paginates beyond 50 rows', async () => {
    const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), not: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
    [q.select, q.eq, q.is, q.not, q.order].forEach(fn => fn.mockReturnValue(q)); mocks.from.mockReturnValue(q);
    await listMemories('owner', false); await listMemories('owner', true, 50);
    expect(q.eq).toHaveBeenCalledWith('user_id', 'owner'); expect(q.is).toHaveBeenCalledWith('deleted_at', null); expect(q.not).toHaveBeenCalledWith('deleted_at', 'is', null); expect(q.range).toHaveBeenCalledWith(50, 99);
  });
});