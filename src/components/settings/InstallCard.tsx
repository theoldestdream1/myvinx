import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smartphone, CheckCircle2, Share2 } from 'lucide-react';

export function InstallCard() {
  const { installed, canPromptInstall, ios, install } = useInstallPrompt();

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          Install Vinx
        </CardTitle>
        <CardDescription>
          Put it on your home screen for one-tap capture, reminders, and "Share to Vinx" from other apps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {installed ? (
          <p className="flex items-center gap-2 text-sm text-memory-processed">
            <CheckCircle2 className="w-4 h-4" /> Vinx is installed on this device.
          </p>
        ) : canPromptInstall ? (
          <Button onClick={install}>Install app</Button>
        ) : ios ? (
          <p className="text-sm text-muted-foreground">
            In Safari tap <Share2 className="inline w-4 h-4 -mt-0.5" /> Share, then <b>Add to Home Screen</b>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open your browser menu and choose <b>Install app</b> (or <b>Add to Home screen</b>).
          </p>
        )}
        {!ios && (
          <p className="text-xs text-muted-foreground">
            Once installed on Android or desktop Chrome/Edge, Vinx appears in the Share menu of other apps. Screenshots,
            text, links and voice notes can be sent straight in.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
