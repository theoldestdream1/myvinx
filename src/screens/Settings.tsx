import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { useSignOut } from '@/hooks/useSignOut';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Bell, Smartphone, Sparkles, Zap, Send, Mail, CalendarDays, Activity, KeyRound, Download,
  LogOut, Trash2, ChevronRight, ChevronLeft, SlidersHorizontal, Loader2, Monitor,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { isIOS, isStandalone } from '@/hooks/usePushNotifications';
import { NotificationCard } from '@/components/settings/NotificationCard';
import { InstallCard } from '@/components/settings/InstallCard';
import { AvatarCard } from '@/components/settings/AvatarCard';
import { TelegramCard } from '@/components/settings/TelegramCard';
import { EmailCard } from '@/components/settings/EmailCard';
import { CalendarCard } from '@/components/settings/CalendarCard';
import { SearchHealthCard } from '@/components/settings/SearchHealthCard';
import { DeviceKeys } from '@/components/settings/DeviceKeys';
import { ThemePicker } from '@/components/layout/ThemeProvider';
import { startTour } from '@/lib/v/tour';
import { Button } from '@/components/ui/button';

type Device = 'ios' | 'android' | 'desktop';
function detectDevice(): Device {
  if (isIOS()) return 'ios';
  if (/android/i.test(navigator.userAgent)) return 'android';
  return 'desktop';
}

type PanelKey = 'notifications' | 'install' | 'v' | 'telegram' | 'email' | 'calendar' | 'search' | 'keys';
const PANELS: Record<PanelKey, { title: string; desc: string; body: () => ReactNode }> = {
  notifications: { title: 'Notifications', desc: 'How V reaches you when a reminder lands.', body: () => <NotificationCard /> },
  install: { title: 'Install Vinx', desc: 'Keep V one tap away on this device.', body: () => <InstallCard /> },
  v: { title: 'V, your companion', desc: 'Her personality, voice and captions.', body: () => <AvatarCard /> },
  telegram: { title: 'Telegram', desc: 'Send memories to V from a chat.', body: () => <TelegramCard /> },
  email: { title: 'Email in', desc: 'Forward anything to your private address.', body: () => <EmailCard /> },
  calendar: { title: 'Calendar feed', desc: 'See your reminders in your calendar app.', body: () => <CalendarCard /> },
  search: { title: 'Search health', desc: 'Check that V can find everything you saved.', body: () => <SearchHealthCard /> },
  keys: { title: 'Device keys', desc: 'Keys for phones and scripts that send memories.', body: () => <DeviceKeys /> },
};

function Row({ icon: Icon, title, hint, onClick, to, tone }: {
  icon: typeof Bell; title: string; hint?: string; onClick?: () => void; to?: string; tone?: 'danger';
}) {
  const inner = (
    <>
      <span className={tone === 'danger' ? 'icon-well h-9 w-9 text-destructive' : 'icon-well h-9 w-9'}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-sm font-medium ${tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}>{title}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </>
  );
  const cls = 'group press flex w-full items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-foreground/[0.03]';
  return to ? <Link to={to} className={cls}>{inner}</Link> : <Button variant="ghost" type="button" onClick={onClick} className={`${cls} h-auto whitespace-normal rounded-none`}>{inner}</Button>;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="eyebrow mb-2.5 px-1">{label}</p>
      <div className="card-ghost overflow-hidden divide-y divide-border/40">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { user, loading, signOut } = useAuth();
  const { signOut: safeSignOut, signingOut } = useSignOut();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const advanced = params.get('view') === 'advanced';
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [installed, setInstalled] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setDevice(detectDevice()); setInstalled(isStandalone()); }, []);
  useEffect(() => { if (!loading && !user) navigate('/auth'); }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleExportData = async () => {
    setExporting(true);
    try {
      const [memories, events, entities, intents] = await Promise.all([
        supabase.from('raw_memories').select('*').order('created_at', { ascending: false }),
        supabase.from('structured_events').select('*').order('created_at', { ascending: false }),
        supabase.from('entities').select('*'),
        supabase.from('pending_intents').select('*'),
      ]);
      const firstError = [memories, events, entities, intents].find((r) => r.error)?.error;
      if (firstError) throw firstError;
      const payload = {
        exported_at: new Date().toISOString(),
        raw_memories: memories.data, structured_events: events.data,
        entities: entities.data, pending_intents: intents.data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vinx-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await signOut();
      toast.success('Your account and data were deleted');
      navigate('/');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  const deviceLabel = device === 'ios' ? 'iPhone' : device === 'android' ? 'Android' : 'Computer';
  const DeviceIcon = device === 'desktop' ? Monitor : Smartphone;
  const initial = (user.email ?? 'V')[0].toUpperCase();
  const current = panel ? PANELS[panel] : null;

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-xl p-5 lg:p-8">
        {advanced ? (
          <button onClick={() => setParams({})} className="press eyebrow mb-6 flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> Settings
          </button>
        ) : null}
        <PageHeader
          eyebrow={advanced ? 'Advanced' : 'Settings'}
          title={advanced ? <>Under the <span className="serif-accent">hood</span></> : <>Make V <span className="serif-accent">yours</span></>}
          sub={advanced ? 'Tools for checking, exporting and connecting. Most people never need these.' : undefined}
        />

        <div className="rise space-y-7">
          {!advanced && (
            <>
              <div className="card-lit flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/40 font-display text-2xl text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.4)]">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{user.email}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <DeviceIcon className="h-3.5 w-3.5" /> On {deviceLabel}{installed ? ' · app installed' : ''}
                  </p>
                </div>
              </div>

              <Group label={`On this ${deviceLabel.toLowerCase()}`}>
                <Row icon={Sparkles} title="Plan & billing" hint="Free, Pro or Premium" to="/pricing" />
                <Row icon={Bell} title="Notifications" hint="Reminder alerts and daily brief" onClick={() => setPanel('notifications')} />
                {!installed && (
                  <Row icon={Download} title="Install Vinx" hint={device === 'desktop' ? 'Add to your dock or taskbar' : 'Add to your home screen'} onClick={() => setPanel('install')} />
                )}
                {device === 'ios' && <Row icon={Zap} title="Siri & Back Tap" hint="“Hey Siri, tell V” and screenshot capture" to="/setup/shortcuts" />}
                {device === 'android' && <Row icon={Zap} title="Quick capture" hint="Share sheet, Google Assistant and widgets" to="/setup/shortcuts" />}
                <Row icon={Sparkles} title="V, your companion" hint="Personality and voice" onClick={() => setPanel('v')} />
              </Group>

              <Group label="Send memories from">
                <Row icon={Send} title="Telegram" hint="Chat with V" onClick={() => setPanel('telegram')} />
                <Row icon={Mail} title="Email" hint="Forward to your private address" onClick={() => setPanel('email')} />
                <Row icon={CalendarDays} title="Calendar" hint="Reminders in your calendar app" onClick={() => setPanel('calendar')} />
              </Group>

              <section className="space-y-3"><p className="eyebrow">Appearance</p><ThemePicker /></section>

              <Group label="More">
                <Row icon={Sparkles} title="Take a tour with V" hint="Let her show you around" onClick={startTour} />
                <Row icon={SlidersHorizontal} title="Advanced settings" hint="Search health, keys, export, account" onClick={() => setParams({ view: 'advanced' })} />
                <Row icon={signingOut ? Loader2 : LogOut} title={signingOut ? 'Signing out…' : 'Sign out'} onClick={safeSignOut} />
              </Group>
            </>
          )}

          {advanced && (
            <>
              <Group label="Diagnostics">
                <Row icon={Activity} title="Search health" hint="Is everything findable?" onClick={() => setPanel('search')} />
              </Group>
              <Group label="Connections">
                {device === 'desktop' && <Row icon={Zap} title="Shortcuts & automations" hint="Zapier, scripts and phone shortcuts" to="/setup/shortcuts" />}
                <Row icon={KeyRound} title="Device keys" hint="For phones and scripts that send memories" onClick={() => setPanel('keys')} />
              </Group>
              <Group label="Your data">
                <Row icon={exporting ? Loader2 : Download} title={exporting ? 'Preparing export…' : 'Export all memories'} hint="Download everything as a file" onClick={handleExportData} />
              </Group>
              <Group label="Account">
                <div className="flex items-center justify-between px-4 py-3.5 text-sm">
                  <span className="text-muted-foreground">Account ID</span>
                  <span className="font-mono text-xs text-foreground">{user.id.slice(0, 8)}…</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <div><Row icon={Trash2} tone="danger" title={deleting ? 'Deleting…' : 'Delete account'} hint="Permanently erase everything" /></div>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes your account, every memory, screenshot, and device key. This cannot be undone.
                        Consider exporting your memories first.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteAccount}>Yes, delete everything</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Group>
            </>
          )}
        </div>
      </div>

      <Sheet open={!!panel} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={`${isMobile ? 'max-h-[88vh] rounded-t-lg' : 'w-full sm:max-w-lg'} overflow-y-auto border-border/50 bg-background`}
        >
          {current && (
            <>
              <SheetHeader className="mb-4 text-left">
                <SheetTitle className="font-display text-3xl font-normal">{current.title}</SheetTitle>
                <SheetDescription>{current.desc}</SheetDescription>
              </SheetHeader>
              <div className="[&>div]:border-0 [&>div]:bg-transparent [&>div]:shadow-none [&_.p-6]:px-0">{current.body()}</div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
