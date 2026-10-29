import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Smartphone, Plus, Copy, Trash2, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DeviceToken {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function DeviceKeys() {
  const [tokens, setTokens] = useState<DeviceToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('device_tokens')
      .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load device keys', description: error.message, variant: 'destructive' });
    } else {
      setTokens(data as DeviceToken[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('generate-device-token', {
      body: { name: name.trim() },
    });
    setCreating(false);
    if (error || !data?.token) {
      toast({ title: 'Could not create key', description: error?.message || 'Unknown error', variant: 'destructive' });
      return;
    }
    setRevealed(data.token);
    setName('');
    load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from('device_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to revoke', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Device key revoked' });
      load();
    }
  };

  const copy = async (val: string) => {
    await navigator.clipboard.writeText(val);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Device Keys
          </CardTitle>
          <CardDescription>
            Long-lived bearer tokens used by the Vinx Android client to push perception events.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Generate
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No device keys yet. Generate one to pair the Android client.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {t.token_prefix}… · created {new Date(t.created_at).toLocaleDateString()} ·{' '}
                    {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleString()}` : 'never used'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke(t.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setRevealed(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              {revealed ? 'Your Device Key' : 'Generate Device Key'}
            </DialogTitle>
            <DialogDescription>
              {revealed
                ? 'Copy this now — it will not be shown again. Paste it into your Android client as the Bearer token.'
                : 'Give this device a recognizable name (e.g. "Pixel 9 Pro").'}
            </DialogDescription>
          </DialogHeader>

          {revealed ? (
            <div className="space-y-3">
              <div className="rounded border border-border bg-muted/40 p-3 font-mono text-xs break-all">
                {revealed}
              </div>
              <Button className="w-full" onClick={() => copy(revealed)}>
                <Copy className="w-4 h-4 mr-2" /> Copy token
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="device-name">Device name</Label>
              <Input
                id="device-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pixel 9 Pro"
                maxLength={80}
              />
            </div>
          )}

          <DialogFooter>
            {revealed ? (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
            ) : (
              <Button disabled={creating || !name.trim()} onClick={create}>
                {creating ? 'Generating…' : 'Generate'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}