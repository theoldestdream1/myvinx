import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Memory = Database['public']['Tables']['raw_memories']['Row'];
export type Insight = Database['public']['Tables']['structured_events']['Row'];
export type MemoryWithInsights = Memory & { structured_events: Insight[] };
export type MemoryAction = 'edit' | 'trash' | 'restore' | 'purge';
export interface MemoryDraft { content: string; eventId?: string; title?: string; summary?: string; topics?: string[] }

export function validateMemoryAction(memory: Memory, action: MemoryAction, draft?: MemoryDraft) {
  if (action === 'edit') {
    if (memory.deleted_at || memory.status !== 'processed') throw new Error('Wait until V has finished reading before editing');
    if (!draft?.content.trim()) throw new Error('Note cannot be empty');
    if (draft.eventId && !draft.title?.trim()) throw new Error('Title cannot be empty');
  }
  if ((action === 'restore' || action === 'purge') && !memory.deleted_at) throw new Error('Move to Trash first');
  if (action === 'trash' && memory.deleted_at) throw new Error('Already in Trash');
}

export async function listMemories(userId: string, trash: boolean, offset = 0): Promise<MemoryWithInsights[]> {
  let query = supabase.from('raw_memories').select('*, structured_events(*)').eq('user_id', userId);
  query = trash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  const { data, error } = await query.order(trash ? 'deleted_at' : 'captured_at', { ascending: false }).range(offset, offset + 49);
  if (error) throw error;
  return data ?? [];
}

export async function retryAttachmentCleanup(userId: string) {
  const { data, error } = await supabase.from('memory_media_cleanup').select('*').eq('user_id', userId).limit(50);
  if (error) throw error;
  for (const job of data ?? []) {
    const paths = job.paths.filter(p => p.startsWith(`${userId}/`));
    if (paths.length) {
      const { error: fileError } = await supabase.storage.from('memory-media').remove(paths);
      if (fileError) throw new Error('Attachment cleanup is pending. Your deletion will be retried when you reopen Timeline.');
    }
    const { error: finishError } = await supabase.from('memory_media_cleanup').delete().eq('id', job.id).eq('user_id', userId);
    if (finishError) throw finishError;
  }
}

export async function changeMemory(memory: Memory, action: MemoryAction, draft?: MemoryDraft) {
  validateMemoryAction(memory, action, draft);
  const { data, error } = await supabase.rpc('memory_lifecycle', {
    _id: memory.id, _action: action, _expected_updated_at: memory.updated_at,
    ...(draft ? { _content: draft.content.trim(), _event_id: draft.eventId, _title: draft.title?.trim(), _summary: draft.summary, _topics: draft.topics } : {}),
  });
  if (error) throw error;
  if (action === 'purge') {
    const meta = memory.metadata as { audio_path?: string } | null;
    const paths = [memory.media_url, meta?.audio_path].filter((p): p is string => !!p && p.startsWith(`${memory.user_id}/`));
    if (paths.length) {
      const { error: mediaError } = await supabase.storage.from('memory-media').remove(paths);
      if (mediaError) throw new Error('Note deleted, but its attachment could not be removed. Cleanup is queued and will retry when you reopen Timeline.');
    }
  }
  return data;
}

export const memoryQueryKeys = ['memory-library', 'recent-memories', 'timeline-events', 'dashboard-stats', 'daily-brief', 'all-intents', 'upcoming-intents', 'entities', 'relationships'];