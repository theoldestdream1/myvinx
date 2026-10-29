import { useEffect } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { vAgent } from '@/lib/avatar/bus';
import { lines } from '@/lib/avatar/scripts';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { addHours, addDays, format, isAfter, nextMonday, setHours, setMinutes, startOfDay } from 'date-fns';
import { Calendar, MapPin, MessageCircle, User, CheckCircle, Bell, Clock, AlarmClock } from 'lucide-react';

const triggerIcons: Record<string, typeof Calendar> = {
  date: Calendar,
  location: MapPin,
  context: MessageCircle,
  person: User,
};

const statusColors: Record<string, string> = {
  pending: 'bg-memory-pending/20 text-memory-pending border-memory-pending/30',
  reminded: 'bg-memory-processing/20 text-memory-processing border-memory-processing/30',
  resolved: 'bg-memory-processed/20 text-memory-processed border-memory-processed/30',
  expired: 'bg-muted text-muted-foreground border-border',
};

/** Snooze choices, computed in the user's local time. Options already in the past are hidden. */
function snoozeOptions(now = new Date()) {
  const at = (d: Date, h: number) => setMinutes(setHours(startOfDay(d), h), 0);
  const options = [
    { label: 'In 1 hour', date: addHours(now, 1) },
    { label: 'This evening (6 PM)', date: at(now, 18) },
    { label: 'Tomorrow morning (9 AM)', date: at(addDays(now, 1), 9) },
    { label: 'Next Monday (9 AM)', date: at(nextMonday(now), 9) },
  ];
  return options.filter((o) => isAfter(o.date, addHours(now, 0.5)) || o.label === 'In 1 hour');
}

export default function Intents() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const { data: intents, isLoading } = useQuery({
    queryKey: ['all-intents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_intents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const refreshAll = () => {
    ['all-intents', 'upcoming-intents', 'dashboard-stats', 'daily-brief'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
  };

  const snoozeIntent = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: Date }) => {
      const { error } = await supabase
        .from('pending_intents')
        .update({ status: 'pending', reminded_at: null, trigger_date: date.toISOString() })
        .eq('id', id);
      if (error) throw error;
      return date;
    },
    onSuccess: (date) => {
      refreshAll();
      toast.success(`Snoozed until ${format(date, 'EEE, MMM d, h:mm a')}`);
      vAgent.say(lines.snoozed().text, 'neutral');
    },
    onError: () => toast.error('Could not snooze that reminder'),
  });

  const resolveIntent = useMutation({
    mutationFn: async (intentId: string) => {
      const { error } = await supabase
        .from('pending_intents')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', intentId);

      if (error) throw error;
    },
    onSuccess: () => {
      refreshAll();
      toast.success('Marked as done');
      const l = lines.taskDone(); vAgent.say(l.text, l.mood);
    },
    onError: () => {
      toast.error('Failed to update intent');
    },
  });

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // "reminded" = the alert fired but it isn't done yet: keep it front and centre
  const pendingIntents = (intents?.filter((i) => i.status === 'pending' || i.status === 'reminded') || []).sort((a, b) => {
    if ((a.status === 'reminded') !== (b.status === 'reminded')) return a.status === 'reminded' ? -1 : 1;
    const ad = a.trigger_date ? new Date(a.trigger_date).getTime() : Infinity;
    const bd = b.trigger_date ? new Date(b.trigger_date).getTime() : Infinity;
    return ad - bd;
  });
  const otherIntents = intents?.filter((i) => i.status !== 'pending' && i.status !== 'reminded') || [];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Intents & Reminders</h1>
            <p className="text-muted-foreground mt-1">
              Future actions detected from your memories
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : intents?.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Bell className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">No intents yet</h2>
                <p className="text-muted-foreground">
                  The AI will detect future intentions from your memories like "remind me", "I should", etc.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {/* Pending */}
              {pendingIntents.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-memory-pending" />
                    Open ({pendingIntents.length})
                  </h2>
                  <div className="space-y-3">
                    {pendingIntents.map((intent) => {
                      const Icon = triggerIcons[intent.trigger_type] || Calendar;
                      return (
                        <Card key={intent.id} className="bg-card/50 border-border/50 hover:border-accent/30 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-accent/10 flex-shrink-0">
                                <Icon className="w-5 h-5 text-accent" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-foreground font-medium">{intent.intent_text}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <Badge variant="outline" className={statusColors[intent.status]}>
                                    {intent.status === 'reminded' ? 'due now' : intent.status}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {intent.trigger_type}
                                    {intent.trigger_value && `: ${intent.trigger_value}`}
                                  </Badge>
                                  {intent.trigger_date && (
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(intent.trigger_date), 'MMM d, h:mm a')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                                    <AlarmClock className="w-4 h-4 mr-1" />
                                    Snooze
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {snoozeOptions().map((o) => (
                                    <DropdownMenuItem
                                      key={o.label}
                                      onClick={() => snoozeIntent.mutate({ id: intent.id, date: o.date })}
                                    >
                                      {o.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => resolveIntent.mutate(intent.id)}
                                className="text-memory-processed hover:text-memory-processed hover:bg-memory-processed/10"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Done
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Resolved/Other */}
              {otherIntents.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-memory-processed" />
                    History ({otherIntents.length})
                  </h2>
                  <div className="space-y-3">
                    {otherIntents.map((intent) => {
                      const Icon = triggerIcons[intent.trigger_type] || Calendar;
                      return (
                        <Card key={intent.id} className="bg-card/30 border-border/30 opacity-70">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-muted flex-shrink-0">
                                <Icon className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-foreground">{intent.intent_text}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <Badge variant="outline" className={statusColors[intent.status]}>
                                    {intent.status}
                                  </Badge>
                                  {intent.resolved_at && (
                                    <span className="text-xs text-muted-foreground">
                                      Resolved {format(new Date(intent.resolved_at), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
