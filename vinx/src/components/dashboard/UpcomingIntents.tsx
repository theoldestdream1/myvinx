import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Calendar, MapPin, MessageCircle, User } from 'lucide-react';

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

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Upcoming Intents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : intents?.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No pending intents. Your AI will detect them from memories.
          </p>
        ) : (
          intents?.map((intent) => {
            const Icon = triggerIcons[intent.trigger_type] || Calendar;
            return (
              <div
                key={intent.id}
                className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Icon className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{intent.intent_text}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs bg-accent/10 text-accent border-accent/30">
                        {intent.trigger_type}
                      </Badge>
                      {intent.trigger_date && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(intent.trigger_date), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
