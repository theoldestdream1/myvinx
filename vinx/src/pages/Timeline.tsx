import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { Calendar, MapPin, Users, Tag } from 'lucide-react';

export default function Timeline() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const { data: events, isLoading } = useQuery({
    queryKey: ['timeline-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('structured_events')
        .select('*')
        .order('event_date', { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Memory Timeline</h1>
            <p className="text-muted-foreground mt-1">
              Your structured memories, organized chronologically
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-32 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : events?.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">No memories yet</h2>
                <p className="text-muted-foreground">
                  Capture some memories and let the AI process them to see your timeline.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-6">
                {events?.map((event) => (
                  <div key={event.id} className="relative pl-12">
                    {/* Timeline dot */}
                    <div className="absolute left-2.5 top-4 w-3 h-3 rounded-full bg-primary border-2 border-background" />

                    <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <h3 className="font-semibold text-foreground">{event.title}</h3>
                          {event.salience_score && (
                            <Badge
                              variant="outline"
                              className={
                                event.salience_score > 0.7
                                  ? 'bg-primary/10 text-primary border-primary/30'
                                  : 'bg-muted text-muted-foreground'
                              }
                            >
                              {Math.round(event.salience_score * 100)}% important
                            </Badge>
                          )}
                        </div>

                        {event.summary && (
                          <p className="text-sm text-muted-foreground mb-3">{event.summary}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          {event.event_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {format(new Date(event.event_date), 'MMM d, yyyy')} (
                                {formatDistanceToNow(new Date(event.event_date), { addSuffix: true })})
                              </span>
                            </div>
                          )}

                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>{event.location}</span>
                            </div>
                          )}

                          {event.participants && event.participants.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>{event.participants.join(', ')}</span>
                            </div>
                          )}

                          {event.topics && event.topics.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              <span>{event.topics.join(', ')}</span>
                            </div>
                          )}
                        </div>

                        {event.emotional_tone && (
                          <Badge variant="secondary" className="mt-3 text-xs">
                            {event.emotional_tone}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
