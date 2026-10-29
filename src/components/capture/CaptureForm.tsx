import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Send, Loader2, MessageSquare, Mail, Calendar, FileText, Mic, Image, Globe, BellRing, PenLine, MicOff, Square } from 'lucide-react';
import { useNavigate } from "@/lib/router-compat";
import { vAgent } from '@/lib/avatar/bus';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useCaptureMemory, useImageAttachment, type MemorySource } from '@/hooks/useCaptureMemory';
import { ScreenshotButton, ScreenshotPreview } from './ScreenshotAttach';

const sources: { value: MemorySource; label: string; icon: typeof MessageSquare; description: string }[] = [
  { value: 'manual', label: 'Manual Note', icon: PenLine, description: 'A personal note or thought' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, description: 'Message from WhatsApp' },
  { value: 'email', label: 'Email', icon: Mail, description: 'Email content' },
  { value: 'sms', label: 'SMS', icon: MessageSquare, description: 'Text message' },
  { value: 'calendar', label: 'Calendar', icon: Calendar, description: 'Calendar event' },
  { value: 'notes', label: 'Notes App', icon: FileText, description: 'Note from notes app' },
  { value: 'voice', label: 'Voice Note', icon: Mic, description: 'Transcribed voice note' },
  { value: 'image', label: 'Image/Screenshot', icon: Image, description: 'Text from image' },
  { value: 'browser', label: 'Browser', icon: Globe, description: 'Web content' },
  { value: 'notification', label: 'Notification', icon: BellRing, description: 'App notification' },
];

export function CaptureForm() {
  const [content, setContent] = useState('');
  const [source, setSource] = useState<MemorySource>('manual');
  const [participants, setParticipants] = useState('');
  const [location, setLocation] = useState('');
  const navigate = useNavigate();
  const image = useImageAttachment();

  const { 
    isRecording, 
    isProcessing, 
    duration, 
    startRecording, 
    stopRecording, 
    cancelRecording 
  } = useVoiceRecording({
    maxDuration: 60,
    onTranscription: (text) => {
      setContent((prev) => prev ? `${prev}\n\n${text}` : text);
      setSource('voice');
      toast.success('Voice transcribed successfully!');
      vAgent.emote('happy', 1200);
    },
    onError: (error) => {
      toast.error(error);
      vAgent.idle();
    },
  });

  const captureMemory = useCaptureMemory(() => navigate('/dashboard'));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !image.file) {
      toast.error('Add some text or a screenshot first');
      return;
    }

    const metadata: { participants?: string[]; location?: string } = {};
    if (participants.trim()) {
      metadata.participants = participants.split(',').map((p) => p.trim()).filter(Boolean);
    }
    if (location.trim()) metadata.location = location.trim();

    captureMemory.mutate({ content, source, image: image.file, metadata });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLoading = captureMemory.isPending;
  const selectedSource = sources.find((s) => s.value === source);

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {selectedSource && <selectedSource.icon className="w-5 h-5 text-primary" />}
          New Memory
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Source Selection */}
          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as MemorySource)}>
              <SelectTrigger className="bg-muted/50 border-border/50">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <div className="flex items-center gap-2">
                      <s.icon className="w-4 h-4" />
                      <span>{s.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSource && (
              <p className="text-xs text-muted-foreground">{selectedSource.description}</p>
            )}
          </div>

          {/* Content with Voice Recording */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Content</Label>
              <div className="flex items-center gap-2">
                {isRecording && (
                  <span className="text-xs text-destructive font-medium animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-destructive" />
                    {formatDuration(duration)}
                  </span>
                )}
                {isProcessing && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Transcribing...
                  </span>
                )}
              </div>
            </div>
            
            <div className="relative">
              <Textarea
                id="content"
                placeholder={isRecording ? "Recording... speak now" : "Paste a message, a screenshot, or type what you want to remember..."}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onPaste={image.onPaste}
                className="min-h-[200px] bg-muted/50 border-border/50 focus:border-primary resize-none pr-24"
                disabled={isRecording}
              />
              
              {/* Voice Recording Button */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                {isRecording ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => { cancelRecording(); vAgent.idle(); }}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <MicOff className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => { stopRecording(); vAgent.idle(); }}
                      className="h-8 w-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      <Square className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                  <ScreenshotButton onFile={(f) => image.attach(f)} disabled={isProcessing || isLoading} />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => { startRecording(); vAgent.listening(); }}
                    disabled={isProcessing || isLoading}
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                  </>
                )}
              </div>
            </div>

            <ScreenshotPreview url={image.previewUrl} onRemove={image.clear} />
            
            <p className="text-xs text-muted-foreground">
              Type, paste text or a screenshot (Ctrl/Cmd+V), attach an image, or record a voice note (max 60s)
            </p>
          </div>

          {/* Optional metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="participants">Participants (optional)</Label>
              <Input
                id="participants"
                placeholder="John, Sarah, Mike..."
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                className="bg-muted/50 border-border/50 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground">Comma-separated names</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location (optional)</Label>
              <Input
                id="location"
                placeholder="Coffee shop, Office, Home..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-muted/50 border-border/50 focus:border-primary"
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isLoading || (!content.trim() && !image.file) || isRecording || isProcessing}
            className="w-full gradient-primary text-primary-foreground font-semibold"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Capture & Process with AI
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
