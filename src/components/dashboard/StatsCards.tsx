import { Archive, Calendar, Users, Bell } from 'lucide-react';

interface StatsCardsProps {
  stats?: {
    memories: number;
    events: number;
    entities: number;
    pendingIntents: number;
  };
}

const statItems = [
  { key: 'memories' as const, label: 'Memories', icon: Archive, color: 'text-primary' },
  { key: 'events' as const, label: 'Events', icon: Calendar, color: 'text-memory-processed' },
  { key: 'entities' as const, label: 'People & places', icon: Users, color: 'text-entity-person' },
  { key: 'pendingIntents' as const, label: 'Reminders', icon: Bell, color: 'text-accent' },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statItems.map((item) => (
        <div
          key={item.key}
          className="card-ghost p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_32px_-12px] hover:shadow-primary/25"
        >
          <div className="flex items-center justify-between mb-4">
            <item.icon className={`w-4.5 h-4.5 ${item.color}`} />
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
          </div>
          <p className="font-display text-4xl tracking-tight text-foreground">
            {stats?.[item.key] ?? '—'}
          </p>
          <p className="eyebrow mt-2">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
