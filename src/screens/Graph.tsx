import { useEffect } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Network, User, MapPin, Tag, Building } from 'lucide-react';
import { cn } from '@/lib/utils';

const entityIcons: Record<string, typeof User> = {
  person: User,
  place: MapPin,
  topic: Tag,
  organization: Building,
};

const entityColors: Record<string, string> = {
  person: 'bg-entity-person/20 text-entity-person border-entity-person/30',
  place: 'bg-entity-place/20 text-entity-place border-entity-place/30',
  topic: 'bg-entity-topic/20 text-entity-topic border-entity-topic/30',
  organization: 'bg-entity-organization/20 text-entity-organization border-entity-organization/30',
};

export default function Graph() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const { data: entities, isLoading } = useQuery({
    queryKey: ['entities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .order('mention_count', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: relationships } = useQuery({
    queryKey: ['relationships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entity_relationships')
        .select(`
          *,
          entity_a:entities!entity_a_id(name, entity_type),
          entity_b:entities!entity_b_id(name, entity_type)
        `)
        .order('strength', { ascending: false })
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

  // Group entities by type
  const entityGroups = entities?.reduce((acc, entity) => {
    const type = entity.entity_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(entity);
    return acc;
  }, {} as Record<string, typeof entities>);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Knowledge Graph</h1>
            <p className="text-muted-foreground mt-1">
              Entities and relationships extracted from your memories
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !entities?.length ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Network className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">No entities yet</h2>
                <p className="text-muted-foreground">
                  As you capture memories, the AI will extract people, places, and topics to build your knowledge graph.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {/* Entity Groups */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(entityGroups || {}).map(([type, typeEntities]) => {
                  const Icon = entityIcons[type] || Tag;
                  return (
                    <Card key={type} className="bg-card/50 border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg capitalize">
                          <Icon className={cn('w-5 h-5', `text-entity-${type}`)} />
                          {type}s ({typeEntities?.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {typeEntities?.slice(0, 15).map((entity) => (
                            <Badge
                              key={entity.id}
                              variant="outline"
                              className={cn('text-sm', entityColors[type] || entityColors.topic)}
                            >
                              {entity.name}
                              {entity.mention_count > 1 && (
                                <span className="ml-1 opacity-70">({entity.mention_count})</span>
                              )}
                            </Badge>
                          ))}
                          {typeEntities && typeEntities.length > 15 && (
                            <Badge variant="secondary" className="text-sm">
                              +{typeEntities.length - 15} more
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Relationships */}
              {relationships && relationships.length > 0 && (
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Network className="w-5 h-5 text-primary" />
                      Relationships
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {relationships.slice(0, 10).map((rel) => (
                        <div
                          key={rel.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                        >
                          <Badge
                            variant="outline"
                            className={entityColors[rel.entity_a?.entity_type || 'topic']}
                          >
                            {rel.entity_a?.name}
                          </Badge>
                          <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                            {rel.relationship_type}
                          </span>
                          <Badge
                            variant="outline"
                            className={entityColors[rel.entity_b?.entity_type || 'topic']}
                          >
                            {rel.entity_b?.name}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
