import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bot } from 'lucide-react';
import { PERSONALITIES, getPersonality, setPersonality, type Personality } from '@/lib/v/personality';
import { vSpeak } from '@/lib/v/voice';
import { line } from '@/lib/v/personality';
import { loadPrefs, savePrefs, subscribePrefs, type AvatarPrefs } from '@/lib/avatar/prefs';

export function AvatarCard() {
  const [prefs, setPrefs] = useState<AvatarPrefs>(() => loadPrefs());
  useEffect(() => subscribePrefs(setPrefs), []);
  const update = (patch: Partial<AvatarPrefs>) => {
    const next = { ...loadPrefs(), ...patch };
    setPrefs(next);
    savePrefs(next);
  };
  const [persona, setPersona] = useState<Personality>(() => getPersonality());
  const choose = (p: Personality) => { setPersona(p); setPersonality(p); void vSpeak(line('greet', p).text); };
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
        <div className="space-y-2">
          <Label>Personality</Label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="V's personality">
            {PERSONALITIES.map((p) => (
              <button key={p.id} role="radio" aria-checked={persona === p.id} onClick={() => choose(p.id)}
                className={`rounded-2xl border px-3 py-2.5 text-left transition ${persona === p.id ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-border'}`}>
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-[11px] leading-tight text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>
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
        <Button variant="outline" size="sm" onClick={() => update({ introSeen: false, enabled: true, minimized: false })}>
          Replay the introduction on next visit
        </Button>
      </CardContent>
    </Card>
  );
}
