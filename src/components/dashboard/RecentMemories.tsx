import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Mail, Calendar, FileText, Mic, Image, Globe, BellRing, PenLine } from 'lucide-react';
import { TaskCard } from './TaskCard';

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

const chipTone: Record<string, 'primary' | 'destructive' | 'muted'> = {
  pending: 'muted',
  processing: 'primary',
  processed: 'muted',
  failed: 'destructive',
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 card-ghost animate-pulse" />
        ))}
      </div>
    );
  }

  if (!memories?.length) {
    return (
      <p className="font-display italic text-xl text-muted-foreground">
        Nothing saved yet — your first memory is one tap away.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {memories.map((memory) => {
        const Icon = sourceIcons[memory.source] || PenLine;
        return (
          <TaskCard
            key={memory.id}
            title={memory.raw_content}
            chip={{ label: memory.status, tone: chipTone[memory.status] ?? 'muted' }}
            meta={
              <>
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-muted/40">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                </span>
                <span className="text-sm text-muted-foreground capitalize">{memory.source}</span>
                <span className="text-sm text-muted-foreground/60">
                  · {formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })}
                </span>
              </>
            }
            status={
              memory.status === 'failed' ? (
                <>
                  V couldn't read this —{' '}
                  <button
                    type="button"
                    onClick={() => retry(memory.id)}
                    className="font-semibold text-primary hover:underline"
                  >
                    try again
                  </button>
                </>
              ) : memory.status === 'processed' ? (
                <>
                  V understood this — <strong className="text-foreground">people, places and dates</strong> pulled out
                </>
              ) : (
                <>
                  V is <strong className="text-foreground">reading this</strong> right now…
                </>
              )
            }
          />
        );
      })}
    </div>
  );
}
