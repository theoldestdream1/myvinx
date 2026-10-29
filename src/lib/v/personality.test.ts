import { beforeEach, describe, expect, it } from 'vitest';
import { getPersonality, line, setPersonality, __resetLines } from './personality';

describe('V personality', () => {
  beforeEach(() => { localStorage.clear(); __resetLines(); });

  it('defaults to sassy', () => {
    expect(getPersonality()).toBe('sassy');
  });

  it('remembers the chosen personality', () => {
    setPersonality('calm');
    expect(getPersonality()).toBe('calm');
  });

  it('never repeats the same listening prompt twice in a row', () => {
    const a = line('listen', 'sassy', () => 0);
    const b = line('listen', 'sassy', () => 0);
    expect(a.text).not.toBe(b.text);
  });
});
