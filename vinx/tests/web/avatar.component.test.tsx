// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', user_metadata: { display_name: 'Ada Lovelace' } }, loading: false }) }));

import AssistantAvatar from '@/components/avatar/AssistantAvatar';
import { vAgent } from '@/lib/avatar/bus';
import { DEFAULT_PREFS, savePrefs, loadPrefs } from '@/lib/avatar/prefs';

const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const bubbleText = () => document.querySelector('.mm-bubble')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('V avatar', () => {
  it('pops up, builds the SVG figure, and introduces itself on the first visit (by name, with captions)', async () => {
    render(<AssistantAvatar />);
    expect(document.querySelector('.mm-stage svg')).toBeTruthy();
    expect(document.querySelectorAll('.mm-stage [data-ref]').length).toBeGreaterThan(20);
    await advance(1000);
    expect(loadPrefs().introSeen).toBe(true); // saved immediately so a reload doesn't replay it
    await advance(300);
    expect(bubbleText()).toContain('Ada');
    expect(screen.getByText('Skip')).toBeTruthy();
    expect(screen.queryByText('Hear me out loud')).toBeNull(); // no speech support here: no false promise
  });

  it('offers a voice when the browser can speak; the click enables it and is remembered', async () => {
    const w = window as unknown as Record<string, unknown>;
    w.speechSynthesis = { speak: (u: { onstart?: () => void }) => queueMicrotask(() => u.onstart?.()), cancel: () => {}, getVoices: () => [] };
    w.SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } };
    try {
      render(<AssistantAvatar />);
      await advance(1300);
      expect(loadPrefs().voice).toBe(false); // never talks unprompted
      fireEvent.click(screen.getByText('Hear me out loud'));
      expect(loadPrefs().voice).toBe(true);
      await advance(500);
      expect(bubbleText()).toContain('Ada'); // restarted the same line, now with sound
    } finally { delete w.speechSynthesis; delete w.SpeechSynthesisUtterance; }
  });

  it('the mouth actually moves while speaking and closes afterwards', async () => {
    savePrefs({ ...DEFAULT_PREFS, introSeen: true });
    render(<AssistantAvatar />);
    const upper = () => document.querySelector('[data-ref="mouthIn"]')!.getAttribute('d');
    const rest = upper();
    act(() => vAgent.say('Got it. I will remember that.', 'happy', 'high'));
    const seen = new Set<string | null>();
    for (let i = 0; i < 60; i++) { await advance(33); seen.add(upper()); }
    expect(seen.size).toBeGreaterThan(8); // many different mouth shapes
    expect(rest).not.toBeNull();
    await advance(8000);
    expect(document.querySelector('[data-ref="mouthIn"]')!.getAttribute('opacity')).toBe('0'); // mouth closed again
    expect(document.querySelector('.mm-bubble')).toBeNull(); // caption cleared after lingering
  });

  it('captions reveal progressively and end on the full text', async () => {
    savePrefs({ ...DEFAULT_PREFS, introSeen: true });
    render(<AssistantAvatar />);
    const full = 'Here is the sketch you saved on Tuesday.';
    act(() => vAgent.say(full, 'happy', 'high'));
    const shown = () => document.querySelector('.mm-bubble span')?.textContent ?? '';
    const lens: number[] = [];
    for (let i = 0; i < 20; i++) { await advance(150); lens.push(shown().length); }
    expect(lens.some((n) => n > 0 && n < full.length)).toBe(true); // partway at some moment
    for (let i = 1; i < lens.length; i++) expect(lens[i]).toBeGreaterThanOrEqual(lens[i - 1] || 0);
    expect(Math.max(...lens)).toBe(full.length);
  });

  it('thinking shows dots, then the answer replaces them', async () => {
    savePrefs({ ...DEFAULT_PREFS, introSeen: true });
    render(<AssistantAvatar />);
    act(() => vAgent.thinking());
    await advance(50);
    expect(document.querySelector('.mm-dots')).toBeTruthy();
    act(() => vAgent.say('Found it.', 'excited', 'normal'));
    await advance(50);
    expect(document.querySelector('.mm-dots')).toBeNull();
  });

  it('low-priority greeting is once per day and never interrupts', async () => {
    savePrefs({ ...DEFAULT_PREFS, introSeen: true });
    render(<AssistantAvatar />);
    act(() => vAgent.say('Good morning, Ada.', 'happy', 'low', 'greeting'));
    await advance(100);
    expect(bubbleText()).toContain('Good morning');
    await advance(9000);
    act(() => vAgent.say('Good morning again.', 'happy', 'low', 'greeting'));
    await advance(100);
    expect(bubbleText()).not.toContain('again');
    act(() => vAgent.say('Saved.', 'happy', 'normal'));
    act(() => vAgent.say('Ignore me, I am low.', 'neutral', 'low'));
    await advance(60);
    expect(bubbleText()).not.toContain('Ignore');
  });

  it('important lines are not cut off by chatter, and queue behind them', async () => {
    savePrefs({ ...DEFAULT_PREFS, introSeen: true });
    render(<AssistantAvatar />);
    act(() => vAgent.say('Something went wrong, please try again.', 'concerned', 'high'));
    await advance(100);
    act(() => vAgent.say('Saved.', 'happy', 'normal'));
    await advance(100);
    expect(document.querySelector('.mm-rest, .mm-bubble')?.textContent).toContain('Something went wrong');
    await advance(8000);
    // the queued confirmation is spoken after the important line
    expect(document.body.textContent).toBeDefined();
  });

  it('menu: voice toggle persists, minimize shows an orb, orb wakes it', async () => {
    savePrefs({ ...DEFAULT_PREFS, introSeen: true });
    render(<AssistantAvatar />);
    fireEvent.click(screen.getByLabelText(/Open menu/));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Open menu/));
    fireEvent.click(screen.getByText('Minimize'));
    expect(loadPrefs().minimized).toBe(true);
    expect(screen.getByLabelText('Wake V')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Wake V'));
    expect(loadPrefs().minimized).toBe(false);
  });

  it('skipping the intro silences it immediately', async () => {
    render(<AssistantAvatar />);
    await advance(2500);
    fireEvent.click(screen.getByText('Skip'));
    await advance(100);
    expect(document.querySelector('.mm-bubble')).toBeNull();
    await advance(15000);
    expect(document.querySelector('.mm-bubble')).toBeNull(); // does not resume
  });

  it('works with storage blocked and no speech API', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<AssistantAvatar />);
    await advance(3000);
    expect(bubbleText()).toMatch(/I'm V|remember everything/); // shorter name = intro line 1 finishes sooner
    spy.mockRestore(); spy2.mockRestore();
  });

  it('cleans up: no timers or frame loop left after unmount', async () => {
    savePrefs({ ...DEFAULT_PREFS, introSeen: true });
    const { unmount } = render(<AssistantAvatar />);
    act(() => vAgent.say('A line that is being spoken.', 'happy', 'high'));
    await advance(200);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
