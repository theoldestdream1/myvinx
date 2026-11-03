import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bot } from 'lucide-react';
import { loadPrefs, savePrefs, subscribePrefs, type AvatarPrefs } from '@/lib/avatar/prefs';
import { startTour } from '@/lib/v/tour';

export function AvatarCard() {
  const [prefs, setPrefs] = useState<AvatarPrefs>(() => loadPrefs());
  useEffect(() => subscribePrefs(setPrefs), []);
  const update = (patch: Partial<AvatarPrefs>) => {
    const next = { ...loadPrefs(), ...patch };
    setPrefs(next);
    savePrefs(next);
  };
  const speechOk = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          V, your assistant
        </CardTitle>
        <CardDescription>The floating assistant that confirms what you save, reads out answers and greets you each day.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="v-enabled">Show V</Label>
          <Switch id="v-enabled" checked={prefs.enabled} onCheckedChange={(v) => update({ enabled: v, minimized: false })} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="v-voice" className={speechOk ? '' : 'text-muted-foreground'}>
            Speak out loud {speechOk ? '' : '(not supported by this browser)'}
          </Label>
          <Switch id="v-voice" disabled={!speechOk} checked={prefs.voice} onCheckedChange={(v) => update({ voice: v })} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="v-captions">Show captions while V speaks</Label>
          <Switch id="v-captions" disabled={!prefs.voice} checked={prefs.captions || !prefs.voice} onCheckedChange={(v) => update({ captions: v })} />
        </div>
        <Button variant="outline" size="sm" onClick={startTour}>
          Take a tour with V
        </Button>
      </CardContent>
    </Card>
  );
}
