import { useState } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { changeReminder, futureDate, repeatChoices, repeatLabel, type Reminder, type RepeatFrequency } from '@/lib/reminders';

export function ReminderTiming({ reminder, mode, onClose, onSaved }: { reminder: Reminder; mode: 'snooze' | 'schedule'; onClose: () => void; onSaved: () => void }) {
  const initial = reminder.trigger_date && new Date(reminder.trigger_date) > new Date() ? new Date(reminder.trigger_date) : new Date(Date.now() + 3600000);
  const [date, setDate] = useState(format(initial, "yyyy-MM-dd'T'HH:mm"));
  const [frequency, setFrequency] = useState<RepeatFrequency>(repeatChoices.includes(reminder.repeat_frequency as RepeatFrequency) ? reminder.repeat_frequency as RepeatFrequency : 'none');
  const [interval, setInterval] = useState(reminder.repeat_interval);
  const [timezone, setTimezone] = useState(reminder.repeat_frequency === 'none' ? Intl.DateTimeFormat().resolvedOptions().timeZone : reminder.repeat_timezone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const when = mode === 'snooze' || frequency !== 'none' ? futureDate(date) : undefined;
      await changeReminder(reminder.id, mode, when, frequency, frequency === 'weekdays' ? 1 : interval, timezone);
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update reminder'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{mode === 'snooze' ? 'Snooze reminder' : 'Repeat reminder'}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground break-words">{reminder.intent_text}</p>
    <form onSubmit={submit} className="space-y-4">
      {mode === 'schedule' && <div className="space-y-2"><Label htmlFor="repeat-frequency">Repeat</Label><Select value={frequency} onValueChange={v => setFrequency(v as RepeatFrequency)}><SelectTrigger id="repeat-frequency"><SelectValue /></SelectTrigger><SelectContent>{repeatChoices.map(f => <SelectItem key={f} value={f}>{repeatLabel(f, 1)}</SelectItem>)}</SelectContent></Select></div>}
      {(mode === 'snooze' || frequency !== 'none') && <>
        <div className="space-y-2"><Label htmlFor="reminder-date">{mode === 'snooze' ? 'Until' : 'Next reminder'}</Label><Input id="reminder-date" type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} /><p className="text-xs text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone} time</p></div>
        {mode === 'schedule' && <><div className="space-y-2"><Label htmlFor="repeat-timezone">Repeat timezone</Label><Input id="repeat-timezone" value={timezone} onChange={e => setTimezone(e.target.value)} /></div>{frequency !== 'weekdays' && <div className="space-y-2"><Label htmlFor="repeat-interval">Every {frequency === 'daily' ? '(days)' : frequency === 'weekly' ? '(weeks)' : '(months)'}</Label><Input id="repeat-interval" type="number" min={1} max={365} required value={interval} onChange={e => setInterval(Number(e.target.value))} /></div>}</>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : mode === 'snooze' ? 'Snooze' : 'Save schedule'}</Button></div>
    </form></DialogContent></Dialog>;
}