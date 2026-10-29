import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Mic, Square, Undo2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCaptureMemory } from '@/hooks/useCaptureMemory';
import { removeQueued } from '@/lib/captureQueue';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// The fastest way into Vinx from a phone's home screen, a Siri/Assistant "open" action, or a desktop
// shortcut: no menus, the cursor is already in the box, one tap or Ctrl/Cmd+Enter saves.
//   /quick               type or paste (images too)
//   /quick?mode=voice    starts listening straight away and saves what you say
// A link can open this page but can never save anything by itself: saving always needs a tap or a keypress.

type Phase = 'ready' | 'saving' | 'saved' | 'error';

export default function Quick() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { search } = useLocation();
  const queryClient = useQueryClient();
  const [text, setText] = useState(() => (params.get('text') ?? '').slice(0, 2000)); // prefill only, never auto-saved
  const [phase, setPhase] = useState<Phase>('ready');
  const [saved, setSaved] = useState<{ id: string; mediaPath: string | null; queued: boolean } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const capture = useCaptureMemory(undefined, { silent: true });

  useEffect(() => {
    if (!loading && !user) navigate(`/auth?next=${encodeURIComponent('/quick' + search)}`, { replace: true });
  }, [loading, user, navigate, search]);

  const save = useCallback(async (args: { content: string; source: 'manual' | 'voice' | 'image'; image?: File | null }) => {
    setPhase('saving');
    try {
      const row = await capture.mutateAsync({ content: args.content, source: args.source, image: args.image ?? null });
      setSaved({ id: row.id, mediaPath: row.media_url, queued: 'queued' in row });
      setPhase('saved');
      setText('');
    } catch {
      setError('Could not save that. Check your connection and try again.');
      setPhase('error');
    }
  }, [capture]);

  const voice = useVoiceRecording({
    maxDuration: 120,
    onTranscription: (t) => { if (t.trim()) void save({ content: t.trim(), source: 'voice' }); else { setError("I couldn't hear anything. Try again."); setPhase('error'); } },
    onError: (e) => { setError(e); setPhase('error'); },
  });

  // ?mode=voice: start listening as soon as the page opens (browsers may need one tap; the button is right there)
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!user || autoStarted.current || params.get('mode') !== 'voice') return;
    autoStarted.current = true;
    voice.startRecording().catch(() => { /* permission prompt dismissed: the mic button is on screen */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => { if (phase === 'ready') inputRef.current?.focus(); }, [phase]);

  // paste a screenshot anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      void save({ content: text.trim(), source: 'image', image: file });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [save, text]);

  const undo = async () => {
    if (!saved) return;
    if (saved.queued) { await removeQueued(saved.id); setSaved(null); setPhase('ready'); return; }
    await supabase.from('raw_memories').delete().eq('id', saved.id);
    if (saved.mediaPath) await supabase.storage.from('memory-media').remove([saved.mediaPath]);
    ['recent-memories', 'dashboard-stats', 'timeline-events', 'all-intents', 'upcoming-intents'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    setSaved(null);
    setPhase('ready');
  };

  const again = () => { setSaved(null); setError(''); setPhase('ready'); };
  const submit = () => { if (text.trim()) void save({ content: text.trim(), source: 'manual' }); };

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const recording = voice.isRecording;
  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {phase === 'saved' ? (
          <div className="text-center space-y-4 py-8" role="status">
            <CheckCircle2 className="w-14 h-14 mx-auto text-memory-processed" />
            <p className="text-xl font-semibold text-foreground">{saved?.queued ? 'Saved on this device' : 'Saved'}</p>
            {saved?.queued && <p className="text-sm text-muted-foreground">You're offline. I'll send it automatically when you're back online.</p>}
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={undo}><Undo2 className="w-4 h-4 mr-2" />Undo</Button>
              <Button onClick={again}>Save another</Button>
            </div>
            <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">Open Vinx <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
          </div>
        ) : (
          <>
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
              placeholder={recording ? 'Listening…' : 'What do you want to remember?'}
              className="min-h-[140px] text-base"
              disabled={phase === 'saving' || recording || voice.isProcessing}
              aria-label="What do you want to remember?"
            />
            {phase === 'error' && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="flex gap-2">
              <Button className="flex-1 h-12" onClick={submit} disabled={!text.trim() || phase === 'saving' || recording}>
                {phase === 'saving' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save
              </Button>
              {recording ? (
                <Button variant="destructive" className="h-12 px-5" onClick={() => voice.stopRecording()} aria-label="Stop and save voice note"><Square className="w-4 h-4 mr-2" />{voice.duration}s</Button>
              ) : (
                <Button variant="outline" className="h-12 px-5" onClick={() => { setError(''); setPhase('ready'); void voice.startRecording(); }} disabled={voice.isProcessing || phase === 'saving'} aria-label="Record a voice note">
                  {voice.isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-5 h-5" />}
                </Button>
              )}
            </div>
            <p className="text-xs text-center text-muted-foreground">Ctrl/Cmd + Enter to save. Paste a screenshot to save it instantly.</p>
          </>
        )}
      </div>
    </main>
  );
}
