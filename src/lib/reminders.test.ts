import { describe, it, expect, vi, beforeEach } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { futureDate, changeReminder } from './reminders';
describe('reminder actions', () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: { id: 'r1' }, error: null }));
  it('requires a future custom snooze time', () => {
    expect(() => futureDate('2026-10-31T09:00:00Z', new Date('2026-10-31T10:00:00Z'))).toThrow();
    expect(futureDate('2026-10-31T11:00:00Z', new Date('2026-10-31T10:00:00Z'))).toBe('2026-10-31T11:00:00.000Z');
    expect(() => futureDate('invalid')).toThrow();
  });
  it.each(['daily', 'weekly', 'monthly', 'weekdays'] as const)('saves %s schedules through the owner action', async frequency => {
    await changeReminder('r1', 'schedule', '2099-01-01T09:00:00Z', frequency, 1, 'Africa/Lagos');
    expect(rpc).toHaveBeenCalledWith('reminder_action', { _id: 'r1', _action: 'schedule', _date: '2099-01-01T09:00:00Z', _frequency: frequency, _interval: 1, _timezone: 'Africa/Lagos' });
  });
  it('supports custom intervals and rejects non-integer or out-of-range intervals', async () => {
    await changeReminder('r1', 'schedule', '2099-01-01T09:00:00Z', 'weekly', 2);
    expect(rpc.mock.calls[0][1]._interval).toBe(2);
    for (const interval of [0, 366, 1.5]) await expect(changeReminder('r1', 'schedule', '2099-01-01T09:00:00Z', 'daily', interval)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('disables repeat without requiring a new date', async () => {
    await changeReminder('r1', 'schedule');
    expect(rpc.mock.calls[0][1]._frequency).toBe('none');
  });
  it('propagates failed updates instead of reporting success', async () => {
    rpc.mockResolvedValue({ error: { message: 'Reminder unavailable' } });
    await expect(changeReminder('r1', 'done')).rejects.toThrow('Reminder unavailable');
  });
});