import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your personal memory command center</p>
      </div>

      <IosInstallGuide />

      {/* Today */}
      <DailyBrief />

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Quick Capture */}
      <QuickCapture />

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentMemories />
        <UpcomingIntents />
      </div>
    </div>
  );
}
