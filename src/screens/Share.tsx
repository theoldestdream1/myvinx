import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCaptureMemory, type MemorySource } from '@/hooks/useCaptureMemory';
import { functionErrorMessage } from '@/hooks/usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Mic, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

// Must match public/sw.js
const SHARE_CACHE = 'vinx-share-target';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 7 * 1024 * 1024; // base64 inflates ~33%; the function caps at ~10M chars
const AUTO_CLOSE_MS = 2200;

interface SharedPayload {
  title: string;
  text: string;
  url: string;
}
interface SharedFile {
  kind: 'image' | 'audio';
  file: File;
}
interface SaveArgs {
  content: string;
  image: File | null;
  source: MemorySource;
}
type Phase = 'loading' | 'transcribing' | 'saving' | 'saved' | 'undoing' | 'undone' | 'error' | 'manual';

async function readShared(): Promise<{ payload: SharedPayload | null; shared: SharedFile | null }> {
  if (!('caches' in window)) return { payload: null, shared: null };
  const cache = await caches.open(SHARE_CACHE);

  const payloadRes = await cache.match('/__shared-payload');
  const payload: SharedPayload | null = payloadRes ? await payloadRes.json() : null;

  let shared: SharedFile | null = null;
  const fileRes = await cache.match('/__shared-file');
  if (fileRes) {
    const blob = await fileRes.blob();
    const type = blob.type || fileRes.headers.get('content-type') || '';
    const name = decodeURIComponent(fileRes.headers.get('x-filename') || '') || 'shared';
    if (type.startsWith('image/')) shared = { kind: 'image', file: new File([blob], name, { type }) };
    else if (type.startsWith('audio/')) shared = { kind: 'audio', file: new File([blob], name, { type }) };
  }
  return { payload, shared };
}

async function clearShared() {
  if (!('caches' in window)) return;
  const cache = await caches.open(SHARE_CACHE);
  await cache.delete('/__shared-payload');
  await cache.delete('/__shared-file');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read audio'));
    r.readAsDataURL(blob);
  });
}

/** Android Chrome often puts the link inside `text` already; avoid duplicating it. */
function composeText(p: SharedPayload | null): string {
  if (!p) return '';
  const parts: string[] = [];
  if (p.title && !p.text.includes(p.title)) parts.push(p.title);
  if (p.text) parts.push(p.text);
  if (p.url && !p.text.includes(p.url)) parts.push(p.url);
  return parts.join('\n').trim();
}

export default function Share() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const capture = useCaptureMemory(undefined, { silent: true });

  const [phase, setPhase] = useState<Phase>('loading');
  const [content, setContent] = useState('');
  const [hasUrl, setHasUrl] = useState(false);
  const [shared, setShared] = useState<SharedFile | null>(null);
  const [saved, setSaved] = useState<{ id: string; mediaPath: string | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [closeFailed, setCloseFailed] = useState(false);

  const startedRef = useRef(false); // the auto-save must run exactly once (React strict mode runs effects twice)
  const lastArgs = useRef<SaveArgs | null>(null);

  const previewUrl = useMemo(() => (shared ? URL.createObjectURL(shared.file) : null), [shared]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Signed out? Sign in and come right back: the shared data survives in the cache
  useEffect(() => {
    if (!loading && !user) navigate(`/auth?next=${encodeURIComponent('/share?shared=1')}`, { replace: true });
  }, [loading, user, navigate]);

  const save = async (args: SaveArgs) => {
    lastArgs.current = args;
    if (args.image && args.image.size > MAX_IMAGE_BYTES) {
      setErrorMsg('That image is larger than 10 MB.');
      setPhase('error');
      return;
    }
    setPhase('saving');
    try {
      const row = await capture.mutateAsync(args);
      await clearShared(); // only after success, so a failure never loses what was shared
      setSaved({ id: row.id, mediaPath: row.media_url });
      setPhase('saved');
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? '');
      setErrorMsg(
        /bucket/i.test(msg)
          ? 'Screenshot storage is not set up yet (missing "memory-media" bucket).'
          : 'Could not save this right now. Check your connection and try again.',
      );
      setPhase('error');
    }
  };

  const transcribe = async (file: File): Promise<string | null> => {
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error('That voice note is too long to transcribe here (max about 7 MB).');
      return null;
    }
    try {
      const audio = await blobToBase64(file);
      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio, mimeType: file.type },
      });
      if (error) throw error;
      const text = String(data?.text ?? '').trim();
      if (!text) {
        toast.error("Couldn't make out any speech in that audio.");
        return null;
      }
      return text;
    } catch (e) {
      toast.error(await functionErrorMessage(e, 'Transcription failed. You can type a note instead.'));
      return null;
    }
  };

  // The whole point: sharing IS saving. No note step, no extra tap.
  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      let payload: SharedPayload | null = null;
      let file: SharedFile | null = null;
      try {
        ({ payload, shared: file } = await readShared());
      } catch {
        /* treat as nothing shared */
      }
      const text = composeText(payload);
      const url = !!payload?.url;
      setShared(file);
      setContent(text);
      setHasUrl(url);

      if (!text && !file) {
        setPhase('manual'); // opened directly (not via a share): offer a plain note box
        return;
      }

      if (file?.kind === 'audio') {
        setPhase('transcribing');
        const spoken = await transcribe(file.file);
        if (spoken === null) {
          setPhase('manual'); // keep the audio visible so they can retry or type
          return;
        }
        const combined = text ? `${text}\n\n${spoken}` : spoken;
        setContent(combined);
        await save({ content: combined, image: null, source: 'voice' });
        return;
      }

      await save({
        content: text,
        image: file?.kind === 'image' ? file.file : null,
        source: url ? 'browser' : 'manual',
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // After saving, get out of the way: try to close this window and return to the app you shared from.
  // Browsers only allow this for some launches, so if it doesn't close we say so instead of hanging.
  useEffect(() => {
    if (phase !== 'saved') return;
    const t = window.setTimeout(() => {
      window.close();
      window.setTimeout(() => setCloseFailed(true), 500);
    }, AUTO_CLOSE_MS);
    return () => window.clearTimeout(t); // tapping Undo changes the phase, which cancels the close
  }, [phase]);

  const undo = async () => {
    if (!saved) return;
    setPhase('undoing');
    // Deleting the memory cascades to its events, reminders and search rows (see migration)
    const { error } = await supabase.from('raw_memories').delete().eq('id', saved.id);
    if (error) {
      toast.error("Couldn't undo that. You can delete it from your dashboard.");
      setPhase('saved');
      return;
    }
    if (saved.mediaPath) await supabase.storage.from('memory-media').remove([saved.mediaPath]);
    ['recent-memories', 'dashboard-stats', 'timeline-events', 'all-intents', 'upcoming-intents'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
    setPhase('undone');
  };

  const saveManual = () => {
    const image = shared?.kind === 'image' ? shared.file : null;
    if (!content.trim() && !image) {
      toast.error('Add a note first.');
      return;
    }
    save({
      content,
      image,
      source: shared?.kind === 'audio' ? 'voice' : hasUrl ? 'browser' : 'manual',
    });
  };

  const discard = async () => {
    await clearShared();
    navigate('/dashboard');
  };

  if (loading || !user || phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const snippet = content.trim().length > 140 ? `${content.trim().slice(0, 140)}…` : content.trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md bg-card/60 border-border/50">
        <CardContent className="p-6 space-y-5">
          {/* ---- saving / transcribing ---- */}
          {(phase === 'saving' || phase === 'transcribing') && (
            <div className="flex flex-col items-center text-center gap-3 py-4" aria-live="polite">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="font-medium text-foreground">
                {phase === 'transcribing' ? 'Transcribing your voice note…' : 'Saving to Vinx…'}
              </p>
            </div>
          )}

          {/* ---- saved ---- */}
          {(phase === 'saved' || phase === 'undoing') && (
            <div className="space-y-4" aria-live="polite">
              <div className="flex flex-col items-center text-center gap-2">
                <CheckCircle2 className="w-12 h-12 text-memory-processed" />
                <p className="text-lg font-semibold text-foreground">Saved to Vinx</p>
                <p className="text-sm text-muted-foreground">
                  Reading it now. Later, just describe it and Vinx will find it.
                </p>
              </div>

              {shared?.kind === 'image' && previewUrl && (
                <img src={previewUrl} alt="What you shared" className="mx-auto max-h-40 rounded-md border border-border/50 object-contain" />
              )}
              {snippet && (
                <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {snippet}
                </p>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={undo} disabled={phase === 'undoing'}>
                  {phase === 'undoing' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
                  Undo
                </Button>
                <Button className="flex-1" onClick={() => navigate('/dashboard')}>
                  Open Vinx
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              {closeFailed && (
                <p className="text-center text-xs text-muted-foreground">
                  All done. You can switch back to the app you were in.
                </p>
              )}
            </div>
          )}

          {/* ---- undone ---- */}
          {phase === 'undone' && (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <p className="font-medium text-foreground">Removed. Nothing was kept.</p>
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
                Open Vinx
              </Button>
            </div>
          )}

          {/* ---- error ---- */}
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center gap-2">
                <AlertTriangle className="w-10 h-10 text-destructive" />
                <p className="font-medium text-foreground">Couldn't save that</p>
                <p className="text-sm text-muted-foreground">{errorMsg}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setPhase('manual')}>
                  Edit
                </Button>
                <Button className="flex-1" onClick={() => lastArgs.current && save(lastArgs.current)}>
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* ---- manual: opened directly, or transcription failed ---- */}
          {phase === 'manual' && (
            <div className="space-y-4">
              <p className="font-medium text-foreground">Save a note to Vinx</p>
              {!shared && !content && (
                <p className="text-xs text-muted-foreground">
                  To save things instantly, use Share → Vinx from any app.
                </p>
              )}

              {shared?.kind === 'image' && previewUrl && (
                <img src={previewUrl} alt="Shared screenshot" className="max-h-48 rounded-md border border-border/50 object-contain" />
              )}
              {shared?.kind === 'audio' && previewUrl && (
                <div className="space-y-2">
                  <audio controls src={previewUrl} className="w-full" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setPhase('transcribing');
                      const spoken = await transcribe(shared.file);
                      if (spoken) setContent((c) => (c ? `${c}\n\n${spoken}` : spoken));
                      setPhase('manual');
                    }}
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Transcribe
                  </Button>
                </div>
              )}

              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What do you want to remember?"
                className="min-h-[140px] bg-muted/50 border-border/50 resize-none"
              />
              <div className="flex gap-3">
                <Button variant="ghost" onClick={discard}>
                  Discard
                </Button>
                <Button className="flex-1" onClick={saveManual}>
                  Save memory
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
