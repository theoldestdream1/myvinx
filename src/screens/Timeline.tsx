import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@/lib/router-compat';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { MemoryEditor } from '@/components/memory/MemoryEditor';
import { changeMemory, listMemories, retryAttachmentCleanup, memoryQueryKeys, type MemoryAction, type MemoryDraft, type MemoryWithInsights } from '@/lib/memoryLifecycle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ArchiveRestore, Calendar, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';

export default function Timeline() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [trash, setTrash] = useState(false);
  const [editing, setEditing] = useState<MemoryWithInsights | null>(null);
  const [confirm, setConfirm] = useState<{ memory: MemoryWithInsights; action: 'trash' | 'purge' } | null>(null);
  useEffect(() => { if (!loading && !user) navigate('/auth'); }, [user, loading, navigate]);
  useEffect(() => { if (user) void retryAttachmentCleanup(user.id).catch(e => toast.warning(e.message)); }, [user?.id]);
  const library = useInfiniteQuery({
    queryKey: ['memory-library', user?.id, trash], enabled: !!user, initialPageParam: 0,
    queryFn: ({ pageParam }) => { if (!user) throw new Error('Sign in required'); return listMemories(user.id, trash, pageParam); },
    getNextPageParam: (last, pages) => last.length === 50 ? pages.length * 50 : undefined,
  });
  const mutation = useMutation({
    mutationFn: ({ memory, action, draft }: { memory: MemoryWithInsights; action: MemoryAction; draft?: MemoryDraft }) => changeMemory(memory, action, draft),
    onSuccess: (_, { action }) => {
      setEditing(null); setConfirm(null);
      memoryQueryKeys.forEach(key => void client.invalidateQueries({ queryKey: [key] }));
      toast.success(action === 'edit' ? 'Changes saved' : action === 'trash' ? 'Moved to Trash' : action === 'restore' ? 'Memory restored' : 'Permanently deleted');
      if (action === 'edit') void supabase.functions.invoke('reindex-memories').then(({ error }) => { if (error) toast.warning('Changes saved. Keyword search is ready; smart search needs a retry in Settings.'); });
    },
    onError: (e) => { toast.error(e.message); void client.invalidateQueries({ queryKey: ['memory-library'] }); },
  });
  const reread = useMutation({
    mutationFn: async (memory: MemoryWithInsights) => {
      const { data, error } = await supabase.functions.invoke('process-memory', { body: { memoryId: memory.id, force: true } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not re-read this link');
    },
    onSuccess: () => { memoryQueryKeys.forEach(key => void client.invalidateQueries({ queryKey: [key] })); toast.success('V finished re-reading the link'); },
    onError: (e) => toast.error(e.message),
  });
  if (loading || !user) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="animate-spin text-primary" /></div>;
  const memories = library.data?.pages.flat() ?? [];
  return <AppLayout><div className="mx-auto w-full max-w-3xl px-5 py-8 lg:p-10 pb-36">
    <PageHeader eyebrow="Timeline" title={<>Your memories, <span className="serif-accent">in order</span></>} sub="Everything you saved, organised by day." />
    <div className="flex items-center gap-2 border-b border-border pb-4 mb-6">
      <Button variant={trash ? 'ghost' : 'secondary'} onClick={() => setTrash(false)} aria-pressed={!trash}><Calendar />Memories</Button>
      <Button variant={trash ? 'secondary' : 'ghost'} onClick={() => setTrash(true)} aria-pressed={trash}><Trash2 />Trash</Button>
    </div>
    {library.isPending ? <Loader2 className="mx-auto animate-spin text-muted-foreground" /> : library.isError ? <div role="alert" className="space-y-3"><p className="text-destructive">Couldn’t load your memories.</p><Button variant="outline" onClick={() => void library.refetch()}>Try again</Button></div> : !memories.length ? <div className="py-12 text-center"><p className="font-display text-2xl text-muted-foreground">{trash ? 'Trash is empty.' : 'Nothing saved yet.'}</p></div> : <div className="space-y-4">
      {memories.map(memory => {
        const event = memory.structured_events[0];
        const link = (memory.metadata as { link?: { url: string; final_url?: string; title?: string; site?: string; error?: string; author?: string; evidence?: string; platform?: string } } | null)?.link;
        return <article key={memory.id} className="card-ghost beam rounded-lg p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow mb-2">{memory.source} · {format(new Date(trash ? memory.deleted_at ?? memory.captured_at : memory.captured_at), 'MMM d, yyyy')}</p><h2 className="font-display text-xl break-words">{event?.title ?? memory.raw_content.slice(0, 100)}</h2></div><Badge variant="outline" className="shrink-0">{trash ? 'Trashed' : memory.status}</Badge></div>
          <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">{event?.summary ?? memory.raw_content}</p>
          {(() => { const l = link; if (!l) return null; const href = l.final_url || l.url; let host = href; try { const u = new URL(href); if (!/^https?:$/.test(u.protocol)) return null; host = u.hostname.replace(/^www\./, ''); } catch { return null; } return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm hover:bg-muted">
              <span className="min-w-0 flex-1"><span className="block truncate text-foreground">{l.title || host}</span><span className="block break-words text-xs text-muted-foreground">{l.site || host}{l.author ? ` · ${l.author}` : ''}{l.evidence === 'transcript' ? ' · Transcript available' : l.evidence === 'metadata' ? ' · Caption/title only; video not watched' : l.error || l.evidence === 'unavailable' ? ' · Link saved; details unavailable' : ''}</span></span>
            </a>); })()}
          {event && <details className="mt-3 text-sm text-muted-foreground"><summary className="cursor-pointer">Original note</summary><p className="mt-2 whitespace-pre-wrap break-words">{memory.raw_content}</p></details>}
          {!!event?.topics?.length && <div className="mt-3 flex flex-wrap gap-2">{event.topics.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
          <div className="mt-4 flex justify-end gap-2">
            {!trash && link && <Button variant="ghost" size="icon" title="Re-read link" aria-label="Re-read link" disabled={reread.isPending || mutation.isPending || memory.status === 'processing'} onClick={() => reread.mutate(memory)}>{reread.isPending && reread.variables?.id === memory.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}</Button>}
            {trash ? <><Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ memory, action: 'restore' })}><ArchiveRestore />Restore</Button><Button variant="ghost" size="icon" title="Delete permanently" aria-label="Delete permanently" disabled={mutation.isPending} onClick={() => setConfirm({ memory, action: 'purge' })}><Trash2 className="text-destructive" /></Button></> : <><Button variant="ghost" size="icon" title={memory.status === 'processed' ? 'Edit memory' : 'Available once V finishes reading'} aria-label="Edit memory" disabled={mutation.isPending || memory.status !== 'processed'} onClick={() => setEditing(memory)}><Pencil /></Button><Button variant="ghost" size="icon" title="Move to Trash" aria-label="Move to Trash" disabled={mutation.isPending} onClick={() => setConfirm({ memory, action: 'trash' })}><Trash2 /></Button></>}
          </div>
        </article>;
      })}
      {library.hasNextPage && <Button className="w-full" variant="outline" disabled={library.isFetchingNextPage} onClick={() => void library.fetchNextPage()}>{library.isFetchingNextPage && <Loader2 className="animate-spin" />}Load more</Button>}
    </div>}
    {editing && <MemoryEditor key={editing.id} memory={editing} busy={mutation.isPending} onClose={() => setEditing(null)} onSave={draft => mutation.mutate({ memory: editing, action: 'edit', draft })} />}
    <Dialog open={!!confirm} onOpenChange={open => { if (!open && !mutation.isPending) setConfirm(null); }}><DialogContent className="w-[calc(100%-2rem)] rounded-lg"><DialogHeader><DialogTitle>{confirm?.action === 'purge' ? 'Delete permanently?' : 'Move to Trash?'}</DialogTitle><DialogDescription>{confirm?.action === 'purge' ? 'This removes the note, insights, search entries, linked reminders and attachments. It cannot be undone.' : 'V won’t recall this memory or send its linked reminders while it’s in Trash. You can restore it.'}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="ghost" disabled={mutation.isPending} onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm?.action === 'purge' ? 'destructive' : 'default'} disabled={mutation.isPending} onClick={() => { if (confirm) mutation.mutate(confirm); }}>{mutation.isPending && <Loader2 className="animate-spin" />}{confirm?.action === 'purge' ? 'Delete permanently' : 'Move to Trash'}</Button></div></DialogContent></Dialog>
  </div></AppLayout>;
}
