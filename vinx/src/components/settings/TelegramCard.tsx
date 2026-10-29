import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, CheckCircle2, Loader2, Pause, Play, Unplug, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { vAgent } from '@/lib/avatar/bus';

interface Health { configured: boolean; bot_username?: string | null; webhook_set?: boolean; pending_update_count?: number | null; last_error?: string | null }

const LINK_WAIT_MS = 10 * 60 * 1000; // matches the one-time code's life

export function TelegramCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [waitingSince, setWaitingSince] = useState<number | null>(null);

  const { data: link, isLoading } = useQuery({
    queryKey: ['channel-link', 'telegram', user?.id],
    enabled: !!user,
    // while someone is switching to Telegram and back, check often; otherwise leave it alone
    refetchInterval: waitingSince ? 2500 : false,
    queryFn: async () => {
      const { data, error } = await supabase.from('channel_links').select('id, display_name, paused').eq('channel', 'telegram').maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: health } = useQuery({
    queryKey: ['telegram-health', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('channel-link', { body: { action: 'telegram_health' } });
      if (error) throw error;
      return data as Health;
    },
  });

  // linked! stop polling, and let V say so
  useEffect(() => {
    if (link && waitingSince) {
      setWaitingSince(null);
      vAgent.say('Telegram is connected. Send me anything there and I will remember it.', 'excited', 'high');
      toast.success('Telegram connected');
    } else if (waitingSince && Date.now() - waitingSince > LINK_WAIT_MS) {
      setWaitingSince(null);
    }
  }, [link, waitingSince]);

  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('channel-link', { body: { action: 'telegram_start' } });
      if (error || !data?.url) throw new Error(data?.error ?? 'Could not start the connection');
      return data as { url: string };
    },
    onSuccess: (d) => {
      setWaitingSince(Date.now());
      window.open(d.url, '_blank', 'noopener'); // opens the Telegram app on phones
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start the connection'),
  });

  const setPaused = useMutation({
    mutationFn: async (paused: boolean) => {
      const { error } = await supabase.rpc('set_channel_paused', { _channel: 'telegram', _paused: paused });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channel-link', 'telegram'] }),
    onError: () => toast.error('Could not change that'),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('channel_links').delete().eq('channel', 'telegram');
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['channel-link', 'telegram'] }); toast.success('Telegram disconnected'); },
    onError: () => toast.error('Could not disconnect'),
  });

  const notReady = health && !health.configured;
  const webhookMissing = health?.configured && health.webhook_set === false;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-primary" />
          Telegram
        </CardTitle>
        <CardDescription>
          Forward messages, send screenshots or voice notes to V from any chat, and ask for things back. Reminders and your daily brief arrive there too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : link ? (
          <>
            <p className="flex items-center gap-2 text-sm text-memory-processed">
              <CheckCircle2 className="w-4 h-4" /> Connected as {link.display_name ?? 'your Telegram account'}
              {link.paused && <span className="text-muted-foreground">(paused)</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPaused.mutate(!link.paused)} disabled={setPaused.isPending}>
                {link.paused ? <><Play className="w-4 h-4 mr-1.5" /> Resume saving</> : <><Pause className="w-4 h-4 mr-1.5" /> Pause saving</>}
              </Button>
              {health?.bot_username && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://t.me/${health.bot_username}`} target="_blank" rel="noopener noreferrer">Open chat</a>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                <Unplug className="w-4 h-4 mr-1.5" /> Disconnect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Try it: send a screenshot, forward a message, or type "/ask the pricing page I saved". Passwords, card numbers and one-time codes are never saved.
            </p>
          </>
        ) : (
          <>
            <Button onClick={() => start.mutate()} disabled={start.isPending || !!notReady}>
              {start.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {waitingSince ? 'Open Telegram again' : 'Connect Telegram'}
            </Button>
            {waitingSince && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Telegram, tap <b>Start</b>. I'll notice as soon as you do.
              </p>
            )}
          </>
        )}
        {notReady && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-500 shrink-0" /> Telegram isn't set up on this server yet (see the README, "Telegram").
          </p>
        )}
        {webhookMissing && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-500 shrink-0" /> The bot is configured but its webhook isn't registered yet, so messages won't arrive. Run <code>scripts/telegram-setup.sh</code>.
          </p>
        )}
        {health?.last_error && (
          <p className="text-xs text-muted-foreground">Telegram reported: {health.last_error}</p>
        )}
      </CardContent>
    </Card>
  );
}
