import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Link } from "@/lib/router-compat";
import { format, isToday } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { vAgent } from '@/lib/avatar/bus';
import { greeting as memoGreeting } from '@/lib/avatar/scripts';
import { DailyBrief, type Brief } from './DailyBrief';
import { RecentMemories } from './RecentMemories';
import { UpcomingIntents } from './UpcomingIntents';
import { QuickCapture } from './QuickCapture';
import { IosInstallGuide } from './IosInstallGuide';

function greetingPart() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardContent() {
  const { user } = useAuth();

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

  const brief = data?.brief;
  const firstName = data?.display_name?.split(' ')[0];

  // V says hello once a day, and mentions what actually needs attention
  useEffect(() => {
    if (!brief) return;
    const now = new Date();
    const overdue = brief.due.filter((d) => !isToday(new Date(d.trigger_date)) && new Date(d.trigger_date) < now).length;
    const g = memoGreeting({ name: data?.display_name, hour: now.getHours(), dueToday: brief.due.length - overdue, overdue });
    vAgent.say(g.text, g.mood, 'low', 'greeting');
  }, [brief, data?.display_name]);

  const dueToday = brief?.due.length ?? 0;
  const waiting = brief?.waiting_count ?? 0;
  const savedWeek = brief?.captured_7d ?? 0;
  const total = Math.max(dueToday + (brief?.upcoming_count ?? 0) + waiting, 1);
  const pct = Math.min(Math.max((dueToday / total) * 100, 6), 94);

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 aurora opacity-60" />
      <div className="relative mx-auto max-w-3xl p-5 pt-8 lg:p-10 space-y-10">
        <IosInstallGuide />

        {/* Greeting hero */}
        <header>
          <p className="eyebrow mb-3">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            {greetingPart()},{' '}
            {firstName ? <span className="serif-accent">{firstName}</span> : <span className="serif-accent">friend</span>}
          </h1>

          {/* The week, at a glance */}
          <div className="mt-8">
            <div className="relative h-1.5 rounded-full bg-gradient-to-r from-primary via-primary/50 to-muted/50">
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] bg-primary shadow-[0_0_14px] shadow-primary"
                style={{ left: `${pct}%` }}
              />
            </div>
            <div className="eyebrow mt-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {dueToday} due today
              </span>
              <span>{savedWeek} saved this week</span>
              <span className="flex items-center gap-2">
                {waiting} waiting
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              </span>
            </div>
          </div>
        </header>

        {/* Needs attention */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Needs attention</p>
            <Link to="/intents" className="eyebrow flex items-center gap-1.5 text-primary transition-colors hover:text-foreground">
              All reminders <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <DailyBrief />
        </section>

        {/* Up next */}
        <section>
          <p className="eyebrow mb-4">Up next</p>
          <UpcomingIntents />
        </section>

        {/* Recently saved */}
        <section>
          <p className="eyebrow mb-4">Recently saved</p>
          <RecentMemories />
        </section>

        {/* Capture */}
        <section>
          <p className="eyebrow mb-4">Capture</p>
          <QuickCapture />
        </section>
      </div>
    </div>
  );
}
