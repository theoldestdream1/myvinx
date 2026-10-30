import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/hooks/usePushNotifications';

export interface RepairResult {
  /** memories we re-ran AI processing on */
  retried: number;
  /** of those, how many worked */
  recovered: number;
  /** memories (re)added to the search index */
  indexed: number;
  /** a human-readable reason if something is still wrong, else null */
  problem: string | null;
}

/**
 * One button that fixes the usual reasons recall comes back empty:
 *  1. memories that failed or got stranded before AI processing finished -> process them again
 *  2. memories missing from the semantic index (or indexed with an older model) -> re-index
 */
export async function repairSearch(): Promise<RepairResult> {
  let retried = 0;
  let recovered = 0;
  let indexed = 0;
  let problem: string | null = null;

  const stale = new Date(Date.now() - 2 * 60_000).toISOString();
  const [failed, stranded] = await Promise.all([
    supabase.from('raw_memories').select('id').is('deleted_at', null).eq('status', 'failed').order('created_at', { ascending: false }).limit(10),
    supabase.from('raw_memories').select('id').is('deleted_at', null).eq('status', 'pending').lt('created_at', stale).limit(10),
  ]);
  // Screenshots processed before images were described properly: re-read them (replacing, not duplicating)
  const shots = await supabase
    .from('raw_memories')
    .select('id, metadata')
    .is('deleted_at', null)
    .eq('status', 'processed')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30);
  const thin = (shots.data ?? [])
    .filter((m) => {
      const d = (m.metadata as { image_description?: string } | null)?.image_description;
      return !d || d.trim().length < 40;
    })
    .map((m) => ({ id: m.id, force: true }));

  const queue = [
    ...[...new Set([...(failed.data ?? []), ...(stranded.data ?? [])].map((r) => r.id))].map((id) => ({ id, force: false })),
    ...thin,
  ].slice(0, 10);

  for (const { id, force } of queue) {
    retried++;
    const { error } = await supabase.functions.invoke('process-memory', { body: { memoryId: id, force } });
    if (error) {
      problem ??= await functionErrorMessage(error, 'Some memories could not be read');
    } else {
      recovered++;
    }
  }

  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase.functions.invoke('reindex-memories');
    if (error) {
      problem ??= await functionErrorMessage(error, 'Could not rebuild the search index');
      break;
    }
    indexed += data?.indexed ?? 0;
    if (!data?.remaining || !data?.indexed) break;
  }

  return { retried, recovered, indexed, problem };
}

export function describeRepair(r: RepairResult): string {
  const parts: string[] = [];
  if (r.retried) parts.push(`re-read ${r.recovered} of ${r.retried} memories`);
  if (r.indexed) parts.push(`re-indexed ${r.indexed}`);
  if (!parts.length) parts.push('nothing needed fixing');
  return parts.join(', ');
}
