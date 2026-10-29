import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Sun, Sparkles, ArrowRight } from 'lucide-react';
import { format, formatDistanceToNowStrict, isToday } from 'date-fns';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { vAgent } from '@/lib/avatar/bus';
import { greeting as memoGreeting, lines } from '@/lib/avatar/scripts';

interface Brief {
  due: { id: string; intent_text: string; trigger_date: string; status: string }[];
  upcoming_count: number;
  waiting_count: number;
  captured_7d: number;
  resurfaced: { event_id: string; title: string; summary: string | null; saved_at: string } | null;
}

function greeting(name?: string | null) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}

export function DailyBrief() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['daily-brief', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('daily-brief');
      if (error) throw error;
      return data as { brief: Brief; display_name: string | null };
    },
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pending_intents')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      const l = lines.taskDone(); vAgent.say(l.text, l.mood);
      ['daily-brief', 'all-intents', 'upcoming-intents', 'dashboard-stats'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      );
    },
    onError: () => toast.error('Could not update that reminder'),
  });

  // V says hello once a day, and mentions what actually needs attention
  const brief0 = data?.brief;
  const nameForMemo = data?.display_name;
  useEffect(() => {
    if (!brief0) return;
    const now = new Date();
    const overdue = brief0.due.filter((d) => !isToday(new Date(d.trigger_date)) && new Date(d.trigger_date) < now).length;
    const g = memoGreeting({ name: nameForMemo, hour: now.getHours(), dueToday: brief0.due.length - overdue, overdue });
    vAgent.say(g.text, g.mood, 'low', 'greeting');
  }, [brief0, nameForMemo]);

  // The brief is a bonus: if it fails to load, the dashboard simply doesn't show it
  if (!data?.brief) return null;
  const { brief } = data;
  const nothingToDo = brief.due.length === 0;

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-card/60 to-card/40 border-primary/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/15">
              <Sun className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{greeting(data.display_name)}</h2>
              <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/intents">
              All reminders <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {nothingToDo ? (
          <p className="text-sm text-muted-foreground">
            Nothing due today.
            {brief.upcoming_count > 0 && ` ${brief.upcoming_count} coming up in the next 3 days.`}
            {brief.captured_7d > 0 && ` You've saved ${brief.captured_7d} ${brief.captured_7d === 1 ? 'memory' : 'memories'} this week.`}
          </p>
        ) : (
          <ul className="space-y-2">
            {brief.due.map((d) => {
              const when = new Date(d.trigger_date);
              const overdue = !isToday(when) && when < new Date();
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-lg bg-background/40 px-3 py-2">
                  <button
                    type="button"
                    aria-label="Mark done"
                    onClick={() => markDone.mutate(d.id)}
                    className="text-muted-foreground hover:text-memory-processed transition-colors"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  <span className="flex-1 min-w-0 truncate text-sm text-foreground">{d.intent_text}</span>
                  {overdue ? (
                    <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                      overdue
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{format(when, 'h:mm a')}</span>
                  )}
                </li>
              );
            })}
            {(brief.upcoming_count > 0 || brief.waiting_count > 0) && (
              <p className="text-xs text-muted-foreground pt-1">
                {[
                  brief.upcoming_count > 0 && `${brief.upcoming_count} coming up soon`,
                  brief.waiting_count > 0 && `${brief.waiting_count} waiting on a person, place or moment`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </ul>
        )}

        {brief.resurfaced && (
          <div className="rounded-lg border border-border/50 bg-background/30 p-3">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground mb-1">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              From {formatDistanceToNowStrict(new Date(brief.resurfaced.saved_at))} ago
            </p>
            <p className="text-sm font-medium text-foreground">{brief.resurfaced.title}</p>
            {brief.resurfaced.summary && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{brief.resurfaced.summary}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
