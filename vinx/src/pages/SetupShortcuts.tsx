import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, KeyRound, Loader2, Mic, Camera, Share2, Smartphone, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'https://YOUR-PROJECT.supabase.co';
export const CAPTURE_URL = `${BASE}/functions/v1/capture`;
// Optional: iCloud links to ready-made, signed shortcuts (set these in .env after you publish them)
const LINKS = {
  tell: import.meta.env.VITE_IOS_SHORTCUT_TELL_URL as string | undefined,
  screenshot: import.meta.env.VITE_IOS_SHORTCUT_SCREENSHOT_URL as string | undefined,
  save: import.meta.env.VITE_IOS_SHORTCUT_SAVE_URL as string | undefined,
};

function Copyable({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1500); }
    catch { toast.error('Copy failed. Select the text and copy it by hand.'); }
  };
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <code className={`flex-1 min-w-0 truncate rounded-md bg-muted px-3 py-2 text-xs ${secret ? 'text-primary' : ''}`}>{value}</code>
        <Button size="sm" variant="outline" onClick={copy} aria-label={`Copy ${label}`}>{done ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button>
      </div>
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-1.5 text-sm text-foreground/90">{children}</ol>;
}

function KeyMaker({ value, onCreated }: { value: string | null; onCreated: (k: string) => void }) {
  const [busy, setBusy] = useState(false);
  const isIphone = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);
  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('generate-device-token', { body: { name: isIphone ? 'iPhone shortcuts' : 'Quick capture' } });
    setBusy(false);
    if (error || !data?.token) { toast.error('Could not create a key. Try again.'); return; }
    onCreated(data.token);
  };
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="w-4 h-4 text-primary" /> Step 1: your capture key</CardTitle>
        <CardDescription>A private password that lets your shortcuts save to your account. It is shown once, so copy it into the shortcut now. You can revoke it any time in Settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {value ? (
          <>
            <Copyable label="Your key (shown once)" value={value} secret />
            <Copyable label="Address to send to" value={CAPTURE_URL} />
          </>
        ) : (
          <>
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}Create my key</Button>
            <Copyable label="Address to send to" value={CAPTURE_URL} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ShortcutLink({ href, label }: { href?: string; label: string }) {
  if (!href) return null;
  return <Button asChild size="sm" className="mb-2"><a href={href}>{label}</a></Button>;
}

export default function SetupShortcuts() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [key, setKey] = useState<string | null>(null);
  const k = key ?? 'YOUR_KEY';
  const defaultTab = useMemo(() => (/Android/.test(navigator.userAgent) ? 'android' : /iPhone|iPad|Mac/.test(navigator.userAgent) ? 'iphone' : 'other'), []);

  useEffect(() => { if (!loading && !user) navigate(`/auth?next=${encodeURIComponent('/setup/shortcuts')}`, { replace: true }); }, [loading, user, navigate]);
  if (loading || !user) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const curl = `curl -X POST ${CAPTURE_URL} \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text":"Call Amaka about the venue","client":"curl"}'`;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Capture from anywhere</h1>
            <p className="text-muted-foreground mt-1">Say it to your phone, double-tap the back of it, or share to V. Saving takes a moment because V only stores it first and does the thinking afterwards.</p>
          </div>

          <KeyMaker value={key} onCreated={setKey} />

          <Tabs defaultValue={defaultTab}>
            <TabsList>
              <TabsTrigger value="iphone"><Smartphone className="w-4 h-4 mr-1.5" />iPhone</TabsTrigger>
              <TabsTrigger value="android"><Smartphone className="w-4 h-4 mr-1.5" />Android</TabsTrigger>
              <TabsTrigger value="other"><Terminal className="w-4 h-4 mr-1.5" />Computer &amp; apps</TabsTrigger>
            </TabsList>

            <TabsContent value="iphone" className="space-y-4">
              <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mic className="w-4 h-4 text-primary" />"Hey Siri, Tell V"</CardTitle>
                <CardDescription>Siri asks what to remember, you say it, it is saved. Works hands-free, from the lock screen and from AirPods.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <ShortcutLink href={LINKS.tell} label="Add “Tell V” to Shortcuts" />
                  <Steps>
                    <li>Open the <b>Shortcuts</b> app, tap <b>+</b>, and name it exactly <b>Tell V</b>. (Siri uses the name as the phrase.)</li>
                    <li>Add the action <b>Dictate Text</b> (stop listening: <i>After Pause</i>).</li>
                    <li>Add <b>Get Contents of URL</b>. Set the URL to the address above, <i>Method</i> to <b>POST</b>.</li>
                    <li>Under <i>Headers</i> add <code>Authorization</code> = <code>Bearer {k}</code>.</li>
                    <li>Set <i>Request Body</i> to <b>JSON</b> and add two Text fields: <code>text</code> = <b>Dictated Text</b>, and <code>client</code> = <code>ios-siri</code>.</li>
                    <li>Add <b>Show Notification</b> with the text “Saved to V”.</li>
                    <li>Say “Hey Siri, Tell V”, wait for the prompt, then say what to remember. Siri can't take the whole sentence in one breath, but it is two seconds end to end.</li>
                  </Steps>
                </CardContent></Card>

              <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Camera className="w-4 h-4 text-primary" />"Screenshot and send this to V"</CardTitle>
                <CardDescription>Takes a screenshot of whatever is on screen and saves it. Run it by voice, with a double tap on the back of the phone, or with the Action Button.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <ShortcutLink href={LINKS.screenshot} label="Add “V Screenshot” to Shortcuts" />
                  <Steps>
                    <li>New shortcut named <b>V Screenshot</b>.</li>
                    <li>Add <b>Take Screenshot</b>.</li>
                    <li>Add <b>Get Contents of URL</b> with the same URL, <b>POST</b> and the same <code>Authorization</code> header.</li>
                    <li>Set <i>Request Body</i> to <b>Form</b>, then add: a <b>File</b> field named <code>image</code> = <b>Screenshot</b>, and a Text field <code>client</code> = <code>ios-screenshot</code>.</li>
                    <li>Add <b>Show Notification</b>: “Saved to V”.</li>
                    <li><b>Back Tap:</b> Settings → Accessibility → Touch → Back Tap → Double Tap → scroll to Shortcuts → <b>V Screenshot</b>.</li>
                    <li><b>Action Button</b> (iPhone 15 Pro and newer): Settings → Action Button → Shortcut → choose <b>Tell V</b> or <b>V Screenshot</b>.</li>
                    <li>By voice: “Hey Siri, V Screenshot”.</li>
                  </Steps>
                </CardContent></Card>

              <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Share2 className="w-4 h-4 text-primary" />Save to V (share sheet)</CardTitle>
                <CardDescription>Adds V to the Share menu of every app, so a message, link, photo or web page is one tap away. This is the iPhone's stand-in for “Share to Vinx”.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <ShortcutLink href={LINKS.save} label="Add “Save to V” to Shortcuts" />
                  <Steps>
                    <li>New shortcut named <b>Save to V</b>. In its settings (ⓘ) turn on <b>Show in Share Sheet</b> and accept <b>Images, Text, URLs</b>.</li>
                    <li>Add an <b>If</b> action: <i>Shortcut Input</i> <b>is</b> <b>Image</b> (use “Has Any Value” if you prefer).</li>
                    <li>Inside <i>If</i>: <b>Get Contents of URL</b> (POST, same header) with a <b>Form</b> body: <code>image</code> = <b>Shortcut Input</b> (File), <code>client</code> = <code>ios-share</code>.</li>
                    <li>Inside <i>Otherwise</i>: <b>Get Contents of URL</b> with a <b>JSON</b> body: <code>text</code> = <b>Shortcut Input</b>, <code>client</code> = <code>ios-share</code>.</li>
                    <li>End If, then <b>Show Notification</b>: “Saved to V”.</li>
                  </Steps>
                </CardContent></Card>

              <Card className="bg-card/50 border-border/50"><CardContent className="pt-6 space-y-2 text-sm text-muted-foreground">
                <p><b className="text-foreground">Good to know.</b> iPhone web apps can't appear in the Share menu on their own, which is why these shortcuts exist. For reminders as notifications, add Vinx to your Home Screen first (Safari → Share → Add to Home Screen). iPhones in the EU don't support web push at all, so connect <b>Telegram</b> or add the <b>calendar feed</b> in Settings for reliable alerts.</p>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="android" className="space-y-4">
              <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="text-base">Install once, then it is built in</CardTitle></CardHeader>
                <CardContent><Steps>
                  <li>In Chrome open Vinx, then menu (⋮) → <b>Install app</b>. Now <b>Vinx appears in the Share menu</b> of every app: share a screenshot, text or link and it saves in one tap with Undo.</li>
                  <li><b>Long-press the Vinx icon</b> for <b>Voice note</b> and <b>Quick note</b>. Drag either one onto your home screen for a one-tap button.</li>
                  <li>Want a voice button anywhere? Open <code>/quick?mode=voice</code> in Chrome → ⋮ → <b>Add to Home screen</b>. It starts listening the moment it opens.</li>
                </Steps></CardContent></Card>
              <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="text-base">"Hey Google"</CardTitle>
                <CardDescription>Being straight with you: Google doesn't currently let apps register their own “tell V…” phrase, and Assistant is moving to Gemini. These work today:</CardDescription></CardHeader>
                <CardContent><Steps>
                  <li>Say <b>“Hey Google, open Vinx”</b>. Then tap the voice button. Or add the voice-note button above to your home screen and tap it.</li>
                  <li>In Google Assistant / Gemini <b>Routines</b>, create a routine started by a phrase you choose (for example “tell V”) whose action <b>opens Vinx</b> (or the voice-note home-screen shortcut, where your phone offers that). Availability differs by phone and Google account.</li>
                  <li><b>Telegram</b> works hands-free on any Android: connect it in Settings, then dictate a message to the V bot from the keyboard microphone.</li>
                  <li>Power users: <b>HTTP Shortcuts</b> or <b>Tasker</b> can call the address above with your key, which gives you a true one-tap or voice-triggered save.</li>
                </Steps></CardContent></Card>
            </TabsContent>

            <TabsContent value="other" className="space-y-4">
              <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="text-base">Save from anything that can send a web request</CardTitle>
                <CardDescription>Zapier, Make, n8n, scripts, and the browser extension all use the same address and key.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">{curl}</pre>
                  <Copyable label="curl command" value={curl.replace(/\\\n\s*/g, '')} />
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><b className="text-foreground">Fields</b> (JSON or form): <code>text</code>, <code>url</code>, <code>title</code>, <code>source</code> (notes, browser, email, calendar), <code>client</code> (a label for where it came from), <code>client_id</code> (send the same one twice and it is saved once), <code>timestamp</code>.</p>
                    <p><b className="text-foreground">Files:</b> multipart <code>image</code> or <code>audio</code>, or <code>image_base64</code> / <code>audio_base64</code> in JSON, or send the file itself as the request body. Images up to 10 MB, audio up to 20 MB. Voice is transcribed after it is saved.</p>
                    <p>The answer is <code>201 {'{ ok, id }'}</code> straight away. Passwords, one-time codes and card numbers are never saved. Limit: 120 saves an hour.</p>
                  </div>
                </CardContent></Card>
              <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="text-base">On your computer</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p><b className="text-foreground">In Vinx itself:</b> press <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> for a quick note box from any page, or paste a screenshot (<kbd>Ctrl/Cmd</kbd>+<kbd>V</kbd>) anywhere outside a text field to save it.</p>
                  <p><b className="text-foreground">Browser extension</b> (Chrome, Edge, Brave): save a page, a selection, a link or a screenshot in one click. Ask for the <code>extension/</code> folder in your Vinx project and load it from <code>chrome://extensions</code>; it needs the address and key above.</p>
                  <p><b className="text-foreground">Email:</b> forward anything to your private V address (Settings, "Email to V").</p>
                </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
