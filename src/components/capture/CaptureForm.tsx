import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUp, Loader2, Mic, Square, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from "@/lib/router-compat";
import { vAgent } from '@/lib/avatar/bus';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useCaptureMemory, useImageAttachment } from '@/hooks/useCaptureMemory';
import { ScreenshotButton, ScreenshotPreview } from './ScreenshotAttach';

/** One calm canvas: speak, type, paste or drop. V works out the who/where/when afterwards. */
export function CaptureForm() {
  const [content, setContent] = useState('');
  const [spoken, setSpoken] = useState(false);
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();
  const image = useImageAttachment();
  const ta = useRef<HTMLTextAreaElement>(null);

  const rec = useVoiceRecording({
    maxDuration: 60,
    onTranscription: (text) => {
      setContent((prev) => (prev ? `${prev}\n\n${text}` : text));
      setSpoken(true);
      vAgent.emote('happy', 1200);
    },
    onError: (error) => { toast.error(error); vAgent.idle(); },
  });

  const captureMemory = useCaptureMemory(() => navigate('/dashboard'));
  const busy = captureMemory.isPending;
  const canSave = (!!content.trim() || !!image.file) && !rec.isRecording && !rec.isProcessing && !busy;

  const submit = () => {
    if (!canSave) return;
    captureMemory.mutate({ content, source: spoken && !image.file ? 'voice' : 'manual', image: image.file });
  };

  return (
    <div className="space-y-5">
      {/* voice orb */}
      <div className="flex flex-col items-center gap-3 py-4">
        <motion.button
          type="button"
          aria-label={rec.isRecording ? 'Stop recording' : 'Record a voice note'}
          onClick={() => { if (rec.isRecording) { rec.stopRecording(); vAgent.idle(); } else { void rec.startRecording(); vAgent.listening(); } }}
          disabled={rec.isProcessing || busy}
          whileTap={{ scale: 0.92 }}
          animate={rec.isRecording ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={rec.isRecording ? { repeat: Infinity, duration: 1.2 } : { type: 'spring', stiffness: 300, damping: 20 }}
          className="capture-orb relative flex h-24 w-24 items-center justify-center rounded-full"
        >
          {rec.isProcessing ? <Loader2 className="h-8 w-8 animate-spin" /> : rec.isRecording ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
        </motion.button>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {rec.isRecording ? `Listening · ${rec.duration}s` : rec.isProcessing ? 'Writing it down…' : 'Tap to talk'}
        </p>
        {rec.isRecording && (
          <button type="button" onClick={() => { rec.cancelRecording(); vAgent.idle(); }} className="text-xs text-muted-foreground underline-offset-4 hover:underline">Discard</button>
        )}
      </div>

      {/* text canvas */}
      <div
        className={`beam relative rounded-3xl border border-border/60 bg-card/70 p-4 shadow-lg transition-shadow ${dragging ? 'ring-2 ring-primary/60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f && image.attach(f)) toast.success('Screenshot attached'); }}
      >
        <textarea
          ref={ta}
          aria-label="What should V remember?"
          placeholder="…or type it, paste it, drop a screenshot."
          value={content}
          onChange={(e) => { setContent(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 420)}px`; }}
          onPaste={image.onPaste}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          disabled={rec.isRecording}
          rows={4}
          className="w-full resize-none bg-transparent font-serif text-xl leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
        />
        <AnimatePresence>
          {image.previewUrl && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <ScreenshotPreview url={image.previewUrl} onRemove={image.clear} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <ScreenshotButton onFile={(f) => image.attach(f)} disabled={rec.isProcessing || busy} />
            {content && (
              <button type="button" aria-label="Clear" onClick={() => { setContent(''); setSpoken(false); }} className="rounded-full p-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            )}
          </div>
          <motion.button
            type="button"
            onClick={submit}
            disabled={!canSave}
            whileTap={{ scale: 0.94 }}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition-opacity disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            Give to V
          </motion.button>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">No forms. V figures out who, where and when by herself.</p>
    </div>
  );
}
