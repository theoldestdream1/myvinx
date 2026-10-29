import { Archive, Calendar, Users, Bell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  stats?: {
    memories: number;
    events: number;
    entities: number;
    pendingIntents: number;
  };
}

const statItems = [
  { key: 'memories' as const, label: 'Raw Memories', icon: Archive, color: 'text-primary' },
  { key: 'events' as const, label: 'Structured Events', icon: Calendar, color: 'text-memory-processed' },
  { key: 'entities' as const, label: 'Entities', icon: Users, color: 'text-entity-person' },
  { key: 'pendingIntents' as const, label: 'Pending Intents', icon: Bell, color: 'text-accent' },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statItems.map((item) => (
        <Card key={item.key} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {stats?.[item.key] ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
