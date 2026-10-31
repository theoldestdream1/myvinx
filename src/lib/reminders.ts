import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Reminder = Database['public']['Tables']['pending_intents']['Row'];
export const repeatChoices = ['none', 'daily', 'weekdays', 'weekly', 'monthly'] as const;
export type RepeatFrequency = typeof repeatChoices[number];
export function futureDate(value: string, now = new Date()) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime()) || date <= now) throw new Error('Choose a future date and time');
  return date.toISOString();
}
export function repeatLabel(frequency: string, interval: number) {
  if (frequency === 'none') return 'Does not repeat';
  if (frequency === 'weekdays') return 'Weekdays';
  if (interval === 1) return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  return `Every ${interval} ${frequency === 'daily' ? 'days' : frequency === 'weekly' ? 'weeks' : 'months'}`;
}
export async function changeReminder(id: string, action: 'done' | 'snooze' | 'schedule', date?: string, frequency: RepeatFrequency = 'none', interval = 1, timezone = 'UTC') {
  if (action === 'snooze' || (action === 'schedule' && frequency !== 'none')) futureDate(date ?? '');
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) throw new Error('Repeat interval must be between 1 and 365');
  const { data, error } = await supabase.rpc('reminder_action', {
    _id: id, _action: action, ...(date ? { _date: date } : {}), _frequency: frequency, _interval: interval, _timezone: timezone,
  });
  if (error) throw new Error(error.message);
  return data;
}