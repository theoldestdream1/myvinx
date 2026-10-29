import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCaptureMemory } from '@/hooks/useCaptureMemory';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

// Pages with their own capture UI or no signed-in user
const OFF = ['/', '/auth', '/share', '/quick', '/hero-demo'];

const isEditable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.('[contenteditable="true"],[role="textbox"]');
};

/**
 * Capture from anywhere in the web app:
 *  - Ctrl/Cmd+Shift+M opens a quick-note box (Ctrl/Cmd+Enter saves, Esc closes)
 *  - Ctrl/Cmd+V with nothing focused: a copied screenshot is saved straight away, copied text opens the box
 *    pre-filled so nothing is saved by surprise
 * Renders nothing until used.
 */
export function GlobalCapture() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const capture = useCaptureMemory(() => { setOpen(false); setText(''); });
  const active = !!user && !OFF.includes(pathname);

  const save = useCallback(() => {
    if (!text.trim() || capture.isPending) return;
    capture.mutate({ content: text.trim(), source: 'manual' });
  }, [text, capture]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); setOpen((o) => !o); }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || document.querySelector('[role="dialog"]')) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (file) { e.preventDefault(); capture.mutate({ content: '', source: 'image', image: file }); return; }
      const pasted = e.clipboardData?.getData('text/plain')?.trim();
      if (pasted) { e.preventDefault(); setText(pasted.slice(0, 20_000)); setOpen(true); toast.message('Save this to V? Press Ctrl/Cmd+Enter.'); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  }, [active, capture]);

  if (!active) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onOpenAutoFocus={(e) => { e.preventDefault(); ref.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle>Remember this</DialogTitle>
          <DialogDescription>Ctrl/Cmd+Enter to save. Esc to close.</DialogDescription>
        </DialogHeader>
        <Textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} className="min-h-[120px]" aria-label="What do you want to remember?"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }} placeholder="What do you want to remember?" />
        <div className="flex justify-end">
          <Button onClick={save} disabled={!text.trim() || capture.isPending}>{capture.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
