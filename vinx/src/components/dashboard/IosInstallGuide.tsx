import { useState } from 'react';
import { Share, PlusSquare, Smartphone, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

const KEY = 'mm_ios_install_dismissed';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/**
 * On an iPhone or iPad, Vinx only gets push reminders, the share sheet entry and a full-screen app
 * once it is on the Home Screen. Shown once on the dashboard, only there, and can be dismissed for good.
 */
export function IosInstallGuide() {
  const { ios, installed } = useInstallPrompt();
  const [hidden, setHidden] = useState(read);
  if (!ios || installed || hidden) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private window: it just comes back next visit */ } setHidden(true); };

  return (
    <Card className="border-primary/40 bg-primary/5" role="region" aria-label="Add Vinx to your Home Screen">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 font-medium"><Smartphone className="w-5 h-5 text-primary" /> Put V on your Home Screen</div>
          <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1" onClick={dismiss} aria-label="Dismiss"><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground">It takes 10 seconds, and unlocks reminders on your phone, one-tap capture and "Share to V" from any app.</p>
        <ol className="space-y-2 text-sm">
          <li className="flex items-center gap-2"><span className="font-semibold">1.</span> Tap <Share className="w-4 h-4 inline text-primary" aria-hidden /> <b>Share</b> at the bottom of Safari.</li>
          <li className="flex items-center gap-2"><span className="font-semibold">2.</span> Choose <PlusSquare className="w-4 h-4 inline text-primary" aria-hidden /> <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li className="flex items-center gap-2"><span className="font-semibold">3.</span> Open <b>Vinx</b> from your Home Screen and turn on notifications in Settings.</li>
        </ol>
        <p className="text-xs text-muted-foreground">Using Chrome on iPhone? Tap Share there and choose Add to Home Screen too. Reminders can also arrive on Telegram, so nothing depends on this step.</p>
        <Button variant="outline" size="sm" onClick={dismiss}>I've done it / not now</Button>
      </CardContent>
    </Card>
  );
}
