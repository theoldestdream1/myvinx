import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications, functionErrorMessage } from '@/hooks/usePushNotifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, BellOff, BellRing, Loader2, Vibrate } from 'lucide-react';
import { toast } from 'sonner';
import { VIBRATE_LABELS, VibratePattern, isVibratePattern, previewVibration } from '@/lib/reminderAlerts';

const BRIEF_HOURS = [6, 7, 8, 9, 10, 12];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

export function NotificationCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const push = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('');

  const { data: prefs, isError, refetch } = useQuery({
    queryKey: ['notification-prefs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('reminders_enabled, daily_brief_enabled, brief_hour, vibrate_pattern')
        .eq('id', user?.id ?? '')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updatePrefs = useMutation({
    mutationFn: async (patch: { reminders_enabled?: boolean; daily_brief_enabled?: boolean; brief_hour?: number; vibrate_pattern?: VibratePattern }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', user?.id ?? '');
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-prefs'] }),
    onError: () => toast.error('Could not save that setting'),
  });

  const sendTest = async () => {
    setTesting(true);
    setTestStatus('Sending test notification…');
    try {
      const { data, error } = await supabase.functions.invoke('send-reminders', { body: { test: true } });
      if (error) throw error;
      if (!data?.sent) { setTestStatus('Test was not delivered. Turn notifications off and on, then retry.'); toast.error('The push service rejected the test. Try turning notifications off and on again.'); }
      else { setTestStatus('Test sent. Check this device for the notification.'); toast.success('Test sent. It should arrive in a few seconds.'); }
    } catch (e) {
      const message = await functionErrorMessage(e, 'Could not send a test notification');
      setTestStatus(message); toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  let deviceControl: React.ReactNode;
  if (push.needsInstall) {
    deviceControl = <p className="text-sm text-muted-foreground">On iPhone (iOS 16.4 or newer), add Vinx to your Home Screen in Safari, open it from there, then enable notifications here.</p>;
  } else if (!push.supported) {
    deviceControl = (
      <p className="text-sm text-muted-foreground">
        This browser doesn't support push notifications. Try Chrome, Edge, Firefox, or Safari (iPhone: add Vinx to your Home Screen first).
      </p>
    );
  } else if (push.configLoading) {
    deviceControl = <p role="status" className="text-sm text-muted-foreground">Checking notification availability…</p>;
  } else if (push.configError) {
    deviceControl = <Button variant="outline" onClick={push.reloadConfig}>Retry notification setup</Button>;
  } else if (!push.configured) {
    deviceControl = (
      <p className="text-sm text-muted-foreground">
        Notifications are temporarily unavailable. Telegram and calendar reminders remain available.
      </p>
    );
  } else if (push.permission === 'denied') {
    deviceControl = (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked for this site. Allow them in your browser or phone settings, then reload this page.
      </p>
    );
  } else if (push.subscribed) {
    deviceControl = (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={sendTest} disabled={testing || push.busy} aria-busy={testing}>
          {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BellRing className="w-4 h-4 mr-2" />}
          Send test notification
        </Button>
        <Button variant="ghost" onClick={push.unsubscribe} disabled={push.busy}>
          <BellOff className="w-4 h-4 mr-2" />
          Turn off on this device
        </Button>
      </div>
    );
  } else {
    deviceControl = (
      <Button onClick={push.subscribe} disabled={push.busy}>
        {push.busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
        Enable notifications on this device
      </Button>
    );
  }

  const canConfigure = !!prefs;
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Notifications
        </CardTitle>
        <CardDescription>Get reminded on time, and start your day with a brief.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {deviceControl}
        {testStatus && <p role="status" className="text-sm text-muted-foreground">{testStatus}</p>}
        {isError && <div role="alert"><p className="text-sm text-destructive">Could not load notification preferences.</p><Button variant="outline" onClick={() => refetch()}>Retry preferences</Button></div>}

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="reminders">Reminders</Label>
            <p className="text-xs text-muted-foreground">Alert me when something I saved is due.</p>
          </div>
          <Switch
            id="reminders"
            disabled={!canConfigure || updatePrefs.isPending}
            checked={prefs?.reminders_enabled ?? true}
            onCheckedChange={(v) => updatePrefs.mutate({ reminders_enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="brief">Daily brief</Label>
            <p className="text-xs text-muted-foreground">What's due today and a memory worth revisiting.</p>
          </div>
          <Switch
            id="brief"
            disabled={!canConfigure || updatePrefs.isPending}
            checked={prefs?.daily_brief_enabled ?? true}
            onCheckedChange={(v) => updatePrefs.mutate({ daily_brief_enabled: v })}
          />
        </div>

        {(prefs?.daily_brief_enabled ?? true) && (
          <div className="flex items-center justify-between gap-4">
            <Label>Send it around</Label>
            <Select
              disabled={!canConfigure || updatePrefs.isPending}
              value={String(prefs?.brief_hour ?? 8)}
              onValueChange={(v) => updatePrefs.mutate({ brief_hour: Number(v) })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRIEF_HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="flex items-center gap-1.5"><Vibrate className="h-3.5 w-3.5" /> Reminder buzz</Label>
            <p className="text-xs text-muted-foreground">How your phone vibrates when a reminder lands.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              disabled={!canConfigure || updatePrefs.isPending}
              value={isVibratePattern(prefs?.vibrate_pattern) ? prefs.vibrate_pattern : 'buzz'}
              onValueChange={(v) => {
                if (!isVibratePattern(v)) return;
                updatePrefs.mutate({ vibrate_pattern: v });
                if (v !== 'off' && !previewVibration(v)) {
                  toast.info('This device does not support vibration preview — it will still buzz on phones that do.');
                }
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VIBRATE_LABELS) as VibratePattern[]).map((k) => (
                  <SelectItem key={k} value={k}>{VIBRATE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Times use your local timezone. If a reminder is never marked Done or Snoozed, V nudges you again — up to twice, 30 minutes apart. Notification sounds follow your device’s sound and Focus settings.</p>
      </CardContent>
    </Card>
  );
}
