import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Feed { https: string; webcal: string }

async function call(action: string): Promise<Feed> {
  const { data, error } = await supabase.functions.invoke('channel-link', { body: { action } });
  if (error || !data?.https) throw new Error(data?.error ?? 'Could not get your calendar link');
  return data as Feed;
}

export function CalendarCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['calendar-feed', user?.id];
  const { data, isLoading, isError } = useQuery({ queryKey: key, enabled: !!user, staleTime: 60_000, queryFn: () => call('calendar_get') });
  const regenerate = useMutation({
    mutationFn: () => call('calendar_regenerate'),
    onSuccess: (d) => { qc.setQueryData(key, d); toast.success('New link created. Subscribe again; the old one no longer works.'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Something went wrong'),
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(data!.https); toast.success('Link copied'); }
    catch { toast.error('Could not copy. Select the link and copy it by hand.'); }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Calendar</CardTitle>
        <CardDescription>See your V reminders in Apple Calendar, Google Calendar or Outlook, with an alert at the right time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          : isError || !data ? <p className="text-sm text-muted-foreground">Couldn't load your calendar link. Try again in a moment.</p>
          : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm"><a href={data.webcal}>Add to iPhone / Mac calendar</a></Button>
                <Button variant="outline" size="sm" onClick={copy}><Copy className="w-4 h-4 mr-1.5" /> Copy link</Button>
                <Button variant="ghost" size="sm" onClick={() => { if (window.confirm('Create a new link? Calendars using the current one will stop updating.')) regenerate.mutate(); }} disabled={regenerate.isPending}>
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${regenerate.isPending ? 'animate-spin' : ''}`} /> New link
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Google Calendar: <b>Other calendars → From URL</b>, paste the copied link. It refreshes every few hours (Google decides how often). Anyone with this link can read your reminders, so keep it private.
              </p>
            </>
          )}
      </CardContent>
    </Card>
  );
}
