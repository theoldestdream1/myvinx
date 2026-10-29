import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, formatDistanceToNowStrict, isToday } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { vAgent } from '@/lib/avatar/bus';
import { lines } from '@/lib/avatar/scripts';
import { TaskCard } from './TaskCard';

export interface Brief {
  due: { id: string; intent_text: string; trigger_date: string; status: string }[];
  upcoming_count: number;
  waiting_count: number;
  captured_7d: number;
  resurfaced: { event_id: string; title: string; summary: string | null; saved_at: string } | null;
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

  if (!data?.brief) return null;
  const { brief } = data;

  return (
    <div className="space-y-4">
      {brief.due.length === 0 ? (
        <p className="font-display italic text-xl text-muted-foreground">
          Nothing due today — V is keeping watch.
          {brief.upcoming_count > 0 && (
            <span className="not-italic font-sans text-sm">
              {' '}{brief.upcoming_count} coming up in the next 3 days.
            </span>
          )}
        </p>
      ) : (
        brief.due.map((d) => {
          const when = new Date(d.trigger_date);
          const overdue = !isToday(when) && when < new Date();
          return (
            <TaskCard
              key={d.id}
              lit
              title={d.intent_text}
              chip={{ label: overdue ? 'Overdue' : 'Due today', tone: overdue ? 'destructive' : 'primary' }}
              status={
                <>
                  Reminder {overdue ? 'was due' : 'lands'}{' '}
                  <strong className="text-foreground">
                    {overdue ? format(when, 'MMM d') : `today at ${format(when, 'h:mm a')}`}
                  </strong>
                </>
              }
              footer={overdue ? 'V is still holding this for you' : 'waiting on you'}
              onToggle={() => markDone.mutate(d.id)}
            />
          );
        })
      )}

      {brief.resurfaced && (
        <div className="card-ghost p-5">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            From {formatDistanceToNowStrict(new Date(brief.resurfaced.saved_at))} ago
          </p>
          <p className="font-display text-xl tracking-tight text-foreground">{brief.resurfaced.title}</p>
          {brief.resurfaced.summary && (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{brief.resurfaced.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}
