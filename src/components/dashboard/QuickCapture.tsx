import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Send, PenLine, Loader2, Mic, MicOff, Square } from 'lucide-react';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useCaptureMemory, useImageAttachment, type MemorySource } from '@/hooks/useCaptureMemory';
import { ScreenshotButton, ScreenshotPreview } from '@/components/capture/ScreenshotAttach';

const sources: { value: MemorySource; label: string }[] = [
  { value: 'manual', label: 'Manual Note' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'notes', label: 'Notes' },
  { value: 'voice', label: 'Voice' },
  { value: 'browser', label: 'Browser' },
];

export function QuickCapture() {
  const [content, setContent] = useState('');
  const [source, setSource] = useState<MemorySource>('manual');
  const image = useImageAttachment();

  const {
    isRecording,
    isProcessing,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording({
    maxDuration: 60,
    onTranscription: (text) => {
      setContent((prev) => (prev ? `${prev}\n\n${text}` : text));
      setSource('voice');
      toast.success('Voice transcribed');
    },
    onError: (msg) => toast.error(msg),
  });

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const captureMemory = useCaptureMemory(() => {
    setContent('');
    image.clear();
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !image.file) {
      toast.error('Add some text or a screenshot first');
      return;
    }
    captureMemory.mutate({ content, source, image: image.file });
  };

  const isLoading = captureMemory.isPending;

  return (
    <Card className="bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 border-primary/20">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <PenLine className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Quick Capture</span>
            <div className="ml-auto flex items-center gap-2 text-xs">
              {isRecording && (
                <span className="text-destructive font-medium animate-pulse flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  {formatDuration(duration)}
                </span>
              )}
              {isProcessing && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Transcribing...
                </span>
              )}
              {!isRecording && !isProcessing && (
                <span className="text-muted-foreground">Type or speak</span>
              )}
            </div>
          </div>

          <div className="relative">
            <Textarea
              placeholder={isRecording ? 'Recording... speak now' : 'Paste text or a screenshot, type, or tap the mic...'}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={image.onPaste}
              disabled={isRecording}
              className="min-h-[100px] bg-background/50 border-border/50 focus:border-primary resize-none pr-14"
            />
            <div className="absolute bottom-2 right-2 flex gap-1">
              {isRecording ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={cancelRecording}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <MicOff className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    onClick={stopRecording}
                    className="h-8 w-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                <ScreenshotButton onFile={(f) => image.attach(f)} disabled={isProcessing} />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                >
                  <Mic className="w-4 h-4" />
                </Button>
                </>
              )}
            </div>
          </div>

          <ScreenshotPreview url={image.previewUrl} onRemove={image.clear} />

          <div className="flex items-center gap-3">
            <Select value={source} onValueChange={(v) => setSource(v as MemorySource)}>
              <SelectTrigger className="w-[180px] bg-background/50 border-border/50">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="submit"
              disabled={isLoading || (!content.trim() && !image.file)}
              className="ml-auto gradient-primary text-primary-foreground font-semibold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Capture & Process
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
