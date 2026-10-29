import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, Copy, RefreshCw, Loader2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface EmailInfo { configured: boolean; address?: string; extra_senders?: string[] }

async function call(action: string, extra: Record<string, unknown> = {}): Promise<EmailInfo> {
  const { data, error } = await supabase.functions.invoke('channel-link', { body: { action, ...extra } });
  if (error || !data || data.error) throw new Error(data?.error ?? 'Something went wrong');
  return data as EmailInfo;
}

export function EmailCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newSender, setNewSender] = useState('');
  const key = ['email-address', user?.id];

  const { data, isLoading } = useQuery({ queryKey: key, enabled: !!user, staleTime: 60_000, queryFn: () => call('email_get') });
  const update = (d: EmailInfo) => qc.setQueryData(key, d);
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');

  const regenerate = useMutation({ mutationFn: () => call('email_regenerate'), onSuccess: (d) => { update(d); toast.success('New address created. The old one no longer works.'); }, onError: fail });
  const add = useMutation({ mutationFn: (email: string) => call('email_add_sender', { email }), onSuccess: (d) => { update(d); setNewSender(''); }, onError: fail });
  const remove = useMutation({ mutationFn: (email: string) => call('email_remove_sender', { email }), onSuccess: update, onError: fail });

  const copy = async () => {
    try { await navigator.clipboard.writeText(data!.address!); toast.success('Address copied'); }
    catch { toast.error('Could not copy. Select the address and copy it by hand.'); }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /> Email to V</CardTitle>
        <CardDescription>Forward any email, newsletter or receipt to your private address and V remembers it. Attach a screenshot and it reads that too.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : data && !data.configured ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-500 shrink-0" /> Email intake isn't set up on this server yet (see the README, "Email").
          </p>
        ) : data?.address ? (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm select-all" data-testid="inbound-address">{data.address}</code>
              <Button variant="outline" size="icon" aria-label="Copy address" onClick={copy}><Copy className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Create a new address" onClick={() => { if (window.confirm('Create a new address? The current one will stop working.')) regenerate.mutate(); }} disabled={regenerate.isPending}>
                <RefreshCw className={`w-4 h-4 ${regenerate.isPending ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              V only accepts mail sent <b>from your account email</b> (and the addresses you approve below), so nobody else can write to your memory, even if they learn this address. Tip: save it in your contacts as "V".
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium">Also accept mail from</p>
              {(data.extra_senders ?? []).map((s) => (
                <div key={s} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                  <span className="truncate">{s}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${s}`} onClick={() => remove.mutate(s)}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
              {(data.extra_senders?.length ?? 0) < 5 && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newSender.trim()) add.mutate(newSender.trim()); }}>
                  <Input type="email" placeholder="work@company.com" value={newSender} onChange={(e) => setNewSender(e.target.value)} aria-label="Another email address to accept" />
                  <Button type="submit" variant="outline" disabled={add.isPending || !newSender.trim()}>Add</Button>
                </form>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
