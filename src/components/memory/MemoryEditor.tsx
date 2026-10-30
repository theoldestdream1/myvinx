import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import type { MemoryDraft, MemoryWithInsights } from '@/lib/memoryLifecycle';

export function MemoryEditor({ memory, busy, onClose, onSave }: { memory: MemoryWithInsights; busy: boolean; onClose: () => void; onSave: (draft: MemoryDraft) => void }) {
  const insight = memory.structured_events[0];
  const [content, setContent] = useState(memory.raw_content);
  const [title, setTitle] = useState(insight?.title ?? '');
  const [summary, setSummary] = useState(insight?.summary ?? '');
  const [tags, setTags] = useState(insight?.topics?.join(', ') ?? '');
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
      <DialogHeader><DialogTitle>Edit memory</DialogTitle><DialogDescription>Your note and V’s understanding.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave({ content, eventId: insight?.id, title, summary, topics: [...new Set(tags.split(',').map(t => t.trim()).filter(Boolean))] }); }}>
        <div className="space-y-2"><Label htmlFor="memory-note">Note</Label><Textarea id="memory-note" value={content} onChange={e => setContent(e.target.value)} rows={5} required disabled={busy} /></div>
        {insight && <>
          <div className="space-y-2"><Label htmlFor="memory-title">Title</Label><Input id="memory-title" value={title} onChange={e => setTitle(e.target.value)} required disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="memory-summary">Summary</Label><Textarea id="memory-summary" value={summary} onChange={e => setSummary(e.target.value)} rows={3} disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="memory-tags">Tags</Label><Input id="memory-tags" value={tags} onChange={e => setTags(e.target.value)} disabled={busy} /></div>
        </>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !content.trim() || (!!insight && !title.trim())}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Save changes</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}