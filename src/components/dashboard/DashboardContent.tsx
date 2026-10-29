import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { StatsCards } from './StatsCards';
import { RecentMemories } from './RecentMemories';
import { UpcomingIntents } from './UpcomingIntents';
import { QuickCapture } from './QuickCapture';
import { DailyBrief } from './DailyBrief';
import { IosInstallGuide } from './IosInstallGuide';

export function DashboardContent() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [memoriesRes, eventsRes, entitiesRes, intentsRes] = await Promise.all([
        supabase.from('raw_memories').select('id', { count: 'exact', head: true }),
        supabase.from('structured_events').select('id', { count: 'exact', head: true }),
        supabase.from('entities').select('id', { count: 'exact', head: true }),
        supabase.from('pending_intents').select('id', { count: 'exact', head: true }).in('status', ['pending', 'reminded']),
      ]);

      return {
        memories: memoriesRes.count ?? 0,
        events: eventsRes.count ?? 0,
        entities: entitiesRes.count ?? 0,
        pendingIntents: intentsRes.count ?? 0,
      };
    },
  });

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 aurora opacity-60" />
      <div className="relative p-6 lg:p-10 space-y-10 max-w-6xl">
        {/* Header */}
        <div>
          <p className="eyebrow mb-2">Overview — {format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
            Your memory, <span className="serif-accent">at a glance.</span>
          </h1>
        </div>

        <IosInstallGuide />

        {/* Today */}
        <section>
          <p className="eyebrow mb-3">Today</p>
          <DailyBrief />
        </section>

        {/* Stats */}
        <section>
          <p className="eyebrow mb-3">The numbers</p>
          <StatsCards stats={stats} />
        </section>

        {/* Quick Capture */}
        <section>
          <p className="eyebrow mb-3">Capture</p>
          <QuickCapture />
        </section>

        {/* Two column layout */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentMemories />
          <UpcomingIntents />
        </section>
      </div>
    </div>
  );
}
