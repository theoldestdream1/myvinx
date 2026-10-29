import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, MessageSquare, Mail, Calendar, FileText, Mic, Image, Globe, BellRing, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';

const sourceIcons: Record<string, typeof MessageSquare> = {
  whatsapp: MessageSquare,
  sms: MessageSquare,
  email: Mail,
  calendar: Calendar,
  notes: FileText,
  voice: Mic,
  image: Image,
  browser: Globe,
  notification: BellRing,
  manual: PenLine,
};

const statusColors: Record<string, string> = {
  pending: 'bg-memory-pending/20 text-memory-pending',
  processing: 'bg-memory-processing/20 text-memory-processing',
  processed: 'bg-memory-processed/20 text-memory-processed',
  failed: 'bg-memory-failed/20 text-memory-failed',
};

export function RecentMemories() {
  const queryClient = useQueryClient();

  const retry = async (memoryId: string) => {
    const { error } = await supabase.functions.invoke('process-memory', { body: { memoryId } });
    if (error) toast.error('Still could not process this memory. Try again in a moment.');
    else toast.success('Memory processed');
    queryClient.invalidateQueries({ queryKey: ['recent-memories'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const { data: memories, isLoading } = useQuery({
    queryKey: ['recent-memories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_memories')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Recent Memories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : memories?.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No memories yet. Start capturing!
          </p>
        ) : (
          memories?.map((memory) => {
            const Icon = sourceIcons[memory.source] || PenLine;
            return (
              <div
                key={memory.id}
                className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{memory.raw_content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className={cn('text-xs', statusColors[memory.status])}>
                        {memory.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })}
                      </span>
                      {memory.status === 'failed' && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => retry(memory.id)}>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
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
