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

describe('V line variety', () => {
  beforeEach(() => { localStorage.clear(); __resetLines(); });

  it('does not repeat any of the last 3 idle lines', () => {
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) seen.push(line('idle', 'sassy').text);
    for (let i = 3; i < seen.length; i++) expect(seen.slice(i - 3, i)).not.toContain(seen[i]);
  });

  it('uses the user-written search, saved, and tapped lines for sassy V', () => {
    expect(line('search', 'sassy', () => 0).text).toBe('Let me dig through our little archive.');
    expect(line('saved', 'sassy', () => 0).text).toBe('Got it. You already owe me one.');
    expect(line('listen', 'sassy', () => 0).text).toBe('Oh? You need me? Go ahead.');
  });
});
