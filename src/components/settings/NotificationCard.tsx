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
import { VIBRATE_LABELS, VibratePattern, isAndroid, isVibratePattern, previewVibration, waitForPushArrival } from '@/lib/reminderAlerts';

const BRIEF_HOURS = [6, 7, 8, 9, 10, 12];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

export function NotificationCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const push = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const [arrival, setArrival] = useState<'idle' | 'arrived' | 'missing'>('idle');

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
    setArrival('idle');
    setTestStatus('Sending test notification…');
    const wait = waitForPushArrival('test', 15000);
    try {
      const { data, error } = await supabase.functions.invoke('send-reminders', { body: { test: true } });
      if (error) throw error;
      if (!data?.sent) {
        wait.cancel();
        setTestStatus('Test was not delivered. Turn notifications off and on, then retry.');
        toast.error('The push service rejected the test. Try turning notifications off and on again.');
        return;
      }
      setTestStatus('Sent. Waiting for it to reach this phone…');
      const arrived = await wait.promise;
      if (arrived) {
        setArrival('arrived');
        setTestStatus('It reached this phone.');
      } else {
        setArrival('missing');
        setTestStatus("Your phone hasn't received it after 15 seconds.");
      }
    } catch (e) {
      wait.cancel();
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
        {arrival === 'arrived' && (
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground space-y-1.5">
            <p className="text-foreground font-medium">Didn't pop up or buzz?</p>
            {isAndroid() ? (
              <>
                <p>Android decides how website alerts look and sound, so Vinx has to be allowed once:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Pull down your notifications and long-press the Vinx one.</li>
                  <li>Tap the gear or "Settings", then choose <b>Alerting</b> / <b>Default</b> (not Silent).</li>
                  <li>Turn on <b>Pop on screen</b>, <b>Sound</b> and <b>Vibration</b>.</li>
                  <li>Also make sure your phone isn't on silent or Do Not Disturb.</li>
                </ol>
                <p>Then send another test.</p>
              </>
            ) : (
              <p>Check your phone's notification settings for Vinx (or your browser) and allow banners and sounds, and turn off Focus or Do Not Disturb.</p>
            )}
          </div>
        )}
        {arrival === 'missing' && (
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground space-y-1.5">
            <p className="text-foreground font-medium">The phone isn't receiving it</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>In your phone's Settings → Apps → Chrome, set Battery to <b>Unrestricted</b> / no optimisation, and allow background data.</li>
              <li>Check Chrome's notifications are allowed for this site.</li>
              <li>Tap "Turn off on this device", then enable notifications again, and retry.</li>
            </ol>
          </div>
        )}
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
