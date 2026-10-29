import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Calendar, MapPin, MessageCircle, User } from 'lucide-react';
import { TaskCard } from './TaskCard';

const triggerIcons: Record<string, typeof Calendar> = {
  date: Calendar,
  location: MapPin,
  context: MessageCircle,
  person: User,
};

export function UpcomingIntents() {
  const { data: intents, isLoading } = useQuery({
    queryKey: ['upcoming-intents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_intents')
        .select('*')
        .in('status', ['pending', 'reminded'])
        .order('trigger_date', { ascending: true, nullsFirst: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 card-ghost animate-pulse" />
        ))}
      </div>
    );
  }

  if (!intents?.length) {
    return (
      <p className="font-display italic text-xl text-muted-foreground">
        Nothing on the horizon yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {intents.map((intent) => {
        const Icon = triggerIcons[intent.trigger_type] || Calendar;
        return (
          <TaskCard
            key={intent.id}
            title={intent.intent_text}
            chip={{ label: intent.trigger_type }}
            meta={
              <>
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/25 bg-primary/15">
                  <Icon className="h-3 w-3 text-primary" />
                </span>
                <span className="text-sm text-muted-foreground">
                  {intent.trigger_date ? format(new Date(intent.trigger_date), 'MMM d, yyyy') : 'When the moment comes'}
                </span>
              </>
            }
            status={
              <>
                V will bring this up <strong className="text-foreground">when it matters</strong>
              </>
            }
          />
        );
      })}
    </div>
  );
}
