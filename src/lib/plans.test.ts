import { describe, it, expect } from 'vitest';
import { getPlan, isPaidPlan } from './plans';

describe('plans', () => {
  it('Free is $0', () => expect(getPlan('free')?.price).toBe(0));
  it('Pro is $12/month', () => expect(getPlan('pro')?.price).toBe(12));
  it('Premium is $20/month', () => expect(getPlan('premium')?.price).toBe(20));
  it('Free quotas match approval', () => expect(getPlan('free')?.quotas).toEqual({ memories: 150, voiceMinutes: 15, images: 25, aiQueries: 30 }));
  it('only Pro and Premium go to checkout', () => {
    expect(isPaidPlan('free')).toBe(false);
    expect(isPaidPlan('pro')).toBe(true);
    expect(isPaidPlan('bogus')).toBe(false);
  });
});
