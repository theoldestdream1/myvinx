import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { describeRepair, repairSearch } from '@/lib/searchRepair';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Loader2, Stethoscope, Wrench } from 'lucide-react';
import { toast } from 'sonner';

interface Status {
  stats: {
    total: number; processed: number; failed: number; waiting: number;
    screenshots: number; indexed: number; with_embedding: number;
  } | null;
  ai_key_present: boolean;
  embedding: { ok: true; provider: string; model: string } | { ok: false; error: string };
  needs_reindex: number | null;
  screenshot_storage: { ok: boolean; error: string | null };
}

function Row({ ok, label, detail }: { ok: boolean | 'warn'; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok === true ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-memory-processed" />
      ) : (
        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${ok === 'warn' ? 'text-yellow-500' : 'text-destructive'}`} />
      )}
      <span>
        <span className="text-foreground">{label}</span>
        {detail && <span className="block text-xs text-muted-foreground break-words">{detail}</span>}
      </span>
    </li>
  );
}

/** Shows exactly why recall works or doesn't, with a one-tap repair. */
export function SearchHealthCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [repairing, setRepairing] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['search-status', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('search-status');
      if (error) throw error;
      return data as Status;
    },
  });

  const repair = async () => {
    setRepairing(true);
    try {
      const result = await repairSearch();
      if (result.problem) toast.error(result.problem);
      else toast.success(`Done: ${describeRepair(result)}`);
      ['recent-memories', 'dashboard-stats', 'timeline-events'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      await refetch();
    } finally {
      setRepairing(false);
    }
  };

  const s = data?.stats;
  const embeddingError = data && 'error' in data.embedding ? data.embedding.error : undefined;
  const attention = (s?.failed ?? 0) + (s?.waiting ?? 0);
  const healthy =
    !!data && data.embedding.ok && attention === 0 && (data.needs_reindex ?? 0) === 0 && data.screenshot_storage.ok;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-primary" />
          Search health
        </CardTitle>
        <CardDescription>Why finding things works, or doesn't, and a one-tap fix.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
        {isError && <p className="text-sm text-muted-foreground">Couldn't run the check. Is the search-status function deployed?</p>}

        {data && (
          <ul className="space-y-2.5">
            <Row
              ok={data.ai_key_present}
              label={data.ai_key_present ? 'AI connection is set up' : 'AI key (LOVABLE_API_KEY) is missing'}
            />
            <Row
              ok={data.embedding.ok}
              label={data.embedding.ok ? 'Search by meaning is working' : 'Search by meaning is OFF (keyword matching only)'}
              detail={embeddingError}
            />
            <Row
              ok={data.screenshot_storage.ok}
              label={data.screenshot_storage.ok ? 'Screenshot storage is ready' : 'Screenshot storage is not set up'}
              detail={data.screenshot_storage.ok ? undefined : 'Create a private Storage bucket named "memory-media".'}
            />
            {s && (
              <Row
                ok={attention === 0 ? true : 'warn'}
                label={`${s.processed} of ${s.total} memories read${s.screenshots ? ` (${s.screenshots} screenshots)` : ''}`}
                detail={attention ? `${s.failed} failed, ${s.waiting} waiting. They are retried automatically; Repair retries them now.` : undefined}
              />
            )}
            {data.needs_reindex !== null && (
              <Row
                ok={data.needs_reindex === 0 ? true : 'warn'}
                label={data.needs_reindex === 0 ? 'Everything is searchable by meaning' : `${data.needs_reindex} memories aren't searchable by meaning yet`}
              />
            )}
          </ul>
        )}

        <div className="flex gap-2">
          <Button onClick={repair} disabled={repairing || isLoading} variant={healthy ? 'outline' : 'default'}>
            {repairing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
            {repairing ? 'Repairing…' : 'Repair search'}
          </Button>
          <Button variant="ghost" onClick={() => refetch()} disabled={isFetching || repairing}>
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Re-check'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
