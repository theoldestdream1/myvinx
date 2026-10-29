// Avatar engine tests (pure logic, no DOM). Run per tests/README.md.
import { describe, it, expect, vi } from 'vitest';
import { wordToVisemes, buildTimeline, TimelineCursor, MAX_SPOKEN_CHARS } from '@/lib/avatar/lipsync';
import { mouthGeometry, VISEMES } from '@/lib/avatar/mouth';
import { Rig } from '@/lib/avatar/rig';
import { NEUTRAL, PARAM_KEYS, RANGES, smoothTo, EXPRESSIONS } from '@/lib/avatar/params';
import { Speaker, pickVoice, type SynthLike, type UtteranceLike, type SpeakerDeps } from '@/lib/avatar/speech';
import { emit, subscribe, vAgent } from '@/lib/avatar/bus';
import { loadPrefs, savePrefs, DEFAULT_PREFS } from '@/lib/avatar/prefs';
import { greeting, introLines, spokenSummary, partOfDay, firstName, lines } from '@/lib/avatar/scripts';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('lip-sync', () => {
  it('maps spelling to plausible mouth shapes', () => {
    expect(wordToVisemes('moon')).toEqual(['mm', 'oo', 'dd']);
    expect(wordToVisemes('hello')[0]).toBe('eh');
    expect(wordToVisemes('the')).toContain('th');
    expect(wordToVisemes('phone')[0]).toBe('ff');
    expect(wordToVisemes('make')).not.toContain('eh'); // silent trailing e
  });
  it('never returns an unknown viseme, even for odd input', () => {
    for (const w of ['', '日本語', '😀', "don't", '12345', 'x', 'AaBb', 'ça va', '—']) {
      for (const v of wordToVisemes(w)) expect(VISEMES[v]).toBeTruthy();
    }
  });
  it('builds a monotonic, gap-free timeline and pauses at punctuation', () => {
    const tl = buildTimeline('Got it. I will remember that, always!');
    let t = 0;
    for (const e of tl.events) { expect(e.t).toBeGreaterThanOrEqual(t - 1e-6); t = e.t; }
    expect(tl.words.length).toBe(6 + 1);
    expect(tl.events.some((e) => e.v === 'rest' && e.d >= 300)).toBe(true); // full stop pause
    expect(tl.duration).toBeGreaterThan(1500);
    expect(tl.duration).toBeLessThan(6000);
  });
  it('caps very long text', () => {
    const tl = buildTimeline('word '.repeat(5000));
    expect(tl.text.length).toBe(MAX_SPOKEN_CHARS);
    expect(tl.duration).toBeLessThan(60000);
  });
  it('empty / whitespace / null-ish text is safe', () => {
    for (const t of ['', '   ', '...', undefined as unknown as string]) {
      const tl = buildTimeline(t);
      const c = new TimelineCursor(tl);
      expect(c.sample(tl.duration + 1).done).toBe(true);
      expect(Number.isFinite(tl.duration)).toBe(true);
      expect(c.revealChars(tl.duration + 1)).toBe(tl.text.length);
    }
  });
  it('cursor: rests before start, ends at the end, supports seeking backwards', () => {
    const tl = buildTimeline('hello world');
    const c = new TimelineCursor(tl);
    expect(c.sample(-50).viseme).toBe('rest');
    expect(c.sample(tl.duration + 10).done).toBe(true);
    const mid = c.sample(tl.duration / 2);
    c.sample(10); // jump back
    expect(c.sample(tl.duration / 2).viseme).toBe(mid.viseme);
  });
  it('faster speech rate shortens the timeline', () => {
    expect(buildTimeline('this is a test sentence', 220).duration).toBeLessThan(buildTimeline('this is a test sentence', 120).duration);
  });
  it('caption reveal is monotonic and reaches the full text', () => {
    const tl = buildTimeline('Send me a note, a screenshot, or a voice memo.');
    const c = new TimelineCursor(tl);
    let prev = 0;
    for (let t = 0; t <= tl.duration + 100; t += 25) {
      const n = c.revealChars(t);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(tl.text.length);
    expect(c.revealChars(0)).toBe(0);
  });
});

describe('mouth geometry', () => {
  const finite = (s: string) => !/NaN|Infinity/.test(s);
  it('closed mouth has no interior; open mouth does', () => {
    expect(mouthGeometry({ ...VISEMES.rest, smile: 0 }).interior).toBe(0);
    expect(mouthGeometry({ ...VISEMES.aa, smile: 0 }).interior).toBe(1);
  });
  it('every viseme x smile produces finite paths', () => {
    for (const v of Object.values(VISEMES)) for (const smile of [-1, -0.3, 0, 0.5, 1]) {
      const g = mouthGeometry({ ...v, smile });
      expect(finite(g.clip + g.upper + g.lower)).toBe(true);
      expect(Number.isFinite(g.tongueCy) && Number.isFinite(g.teethH)).toBe(true);
    }
  });
  it('out-of-range input is clamped, not exploded', () => {
    const g = mouthGeometry({ open: 9, wide: -4, round: 12, teeth: 5, tongue: 5, smile: 40 });
    expect(finite(g.clip)).toBe(true);
    const wide = mouthGeometry({ ...VISEMES.ee, smile: 0 }), narrow = mouthGeometry({ ...VISEMES.oo, smile: 0 });
    expect(wide.clip).not.toBe(narrow.clip);
  });
  it('wider smile lifts the corners (corner y decreases)', () => {
    const cornerY = (smile: number) => Number(mouthGeometry({ ...VISEMES.rest, smile }).clip.match(/^M-?[\d.]+ (-?[\d.]+)/)![1]);
    expect(cornerY(1)).toBeLessThan(cornerY(0));
    expect(cornerY(-1)).toBeGreaterThan(cornerY(0));
  });
});

describe('smoothing', () => {
  it('never overshoots and is frame-rate independent', () => {
    const run = (fps: number) => { let v = 0; for (let i = 0; i < fps * 0.5; i++) v = smoothTo(v, 1, 14, 1 / fps); return v; };
    for (const fps of [20, 30, 60, 144]) expect(run(fps)).toBeLessThanOrEqual(1);
    expect(Math.abs(run(30) - run(144))).toBeLessThan(1e-9);
  });
});

describe('rig', () => {
  const sim = (rig: Rig, seconds: number, fps = 60, t0 = 0) => {
    let f = rig.update(0, t0);
    for (let i = 1; i <= seconds * fps; i++) f = rig.update(1 / fps, t0 + (i * 1000) / fps);
    return f;
  };
  it('stays inside every parameter range for a long mixed session (no NaN)', () => {
    const rig = new Rig({ rng: seeded() });
    const tl = buildTimeline('Hello there, this is a fairly long test of the avatar rig with exclamations! And questions? Yes.');
    const t0 = 0;
    rig.startSpeaking(new TimelineCursor(tl), () => 0);
    let now = 0;
    const moods = Object.keys(EXPRESSIONS) as (keyof typeof EXPRESSIONS)[];
    for (let i = 0; i < 60 * 60; i++) {
      now = t0 + (i * 1000) / 60;
      if (i % 120 === 0) rig.flash(moods[(i / 120) % moods.length], 900);
      const f = rig.update(1 / 60, now);
      for (const k of PARAM_KEYS) {
        expect(Number.isFinite(f[k])).toBe(true);
        expect(f[k]).toBeGreaterThanOrEqual(RANGES[k][0] - 1e-9);
        expect(f[k]).toBeLessThanOrEqual(RANGES[k][1] + 1e-9);
      }
      expect(f.blink).toBeGreaterThanOrEqual(0); expect(f.blink).toBeLessThanOrEqual(1);
    }
  });
  it('mouth opens on vowels, closes on "mm", and rests after speech', () => {
    const rig = new Rig({ rng: seeded(), reducedMotion: true });
    let clock = 0;
    const tl = buildTimeline('ah');
    rig.startSpeaking(new TimelineCursor(tl), () => clock);
    clock = 20; const open = sim(rig, 0.25, 60, 0).mOpen;
    expect(open).toBeGreaterThan(0.5);
    rig.stopSpeaking();
    const closed = sim(rig, 0.6, 60, 300).mOpen;
    expect(closed).toBeLessThan(0.05);
  });
  it('expression transitions converge quickly and smoothly (no jumps bigger than a few %/frame)', () => {
    const rig = new Rig({ rng: seeded(), reducedMotion: true });
    rig.setExpression('happy');
    let prev = rig.update(0, 0).mSmile, maxStep = 0, f = prev;
    for (let i = 1; i <= 60; i++) { const fr = rig.update(1 / 60, (i * 1000) / 60); maxStep = Math.max(maxStep, Math.abs(fr.mSmile - prev)); prev = fr.mSmile; f = fr.mSmile; }
    expect(f).toBeGreaterThan(0.7);
    expect(maxStep).toBeLessThan(0.2); // exponential approach: biggest step is the first (~18%)
  });
  it('flash() returns to the resting expression', () => {
    const rig = new Rig({ rng: seeded(), reducedMotion: true });
    rig.flash('surprised', 500);
    expect(rig.expression).toBe('surprised');
    rig.update(0.016, 600);
    expect(rig.expression).toBe('neutral');
  });
  it('blinks happen, last ~160ms, and are fully closed at the bottom', () => {
    const rig = new Rig({ rng: seeded(3) });
    let min = 1, blinks = 0, was = 1;
    for (let i = 0; i < 60 * 30; i++) {
      const f = rig.update(1 / 60, (i * 1000) / 60);
      min = Math.min(min, f.blink);
      if (was > 0.5 && f.blink <= 0.5) blinks++;
      was = f.blink;
    }
    expect(min).toBeLessThan(0.05);
    expect(blinks).toBeGreaterThanOrEqual(4); // ~every 2-6s over 30s
    expect(blinks).toBeLessThanOrEqual(20);
  });
  it('reduced motion: no blinking, no sway, no breathing; speech still moves the mouth', () => {
    const rig = new Rig({ rng: seeded(), reducedMotion: true });
    let minBlink = 1, maxRoll = 0;
    for (let i = 0; i < 600; i++) { const f = rig.update(1 / 60, (i * 1000) / 60); minBlink = Math.min(minBlink, f.blink); maxRoll = Math.max(maxRoll, Math.abs(f.headRoll)); expect(f.breath).toBe(0); }
    expect(minBlink).toBe(1); expect(maxRoll).toBeLessThan(0.01);
    const tl = buildTimeline('hello');
    let clock = 0; rig.startSpeaking(new TimelineCursor(tl), () => clock);
    let maxOpen = 0;
    for (let i = 0; i < 90; i++) { clock = (i * 1000) / 60; maxOpen = Math.max(maxOpen, rig.update(1 / 60, 10000 + clock).mOpen); }
    expect(maxOpen).toBeGreaterThan(0.3);
  });
  it('a huge dt (backgrounded tab) is clamped instead of snapping', () => {
    const rig = new Rig({ rng: seeded(), reducedMotion: true });
    rig.setExpression('excited');
    const f = rig.update(30, 30000);
    expect(f.mSmile).toBeLessThan(1); // only 0.1s of progress was applied
    expect(Number.isFinite(f.mSmile)).toBe(true);
  });
  it('keeps the lips moving if the real voice outlasts the estimate', () => {
    const rig = new Rig({ rng: seeded(), reducedMotion: true });
    const tl = buildTimeline('hi');
    rig.startSpeaking(new TimelineCursor(tl), () => tl.duration + 5000, () => true);
    let maxOpen = 0; for (let i = 0; i < 120; i++) maxOpen = Math.max(maxOpen, rig.update(1 / 60, i * 16.7).mOpen);
    expect(rig.speaking).toBe(true);
    expect(maxOpen).toBeGreaterThan(0.15);
  });
  it('speaking ends on its own when the timeline finishes (and no voice is active)', () => {
    const rig = new Rig({ rng: seeded(), reducedMotion: true });
    const tl = buildTimeline('hi');
    rig.startSpeaking(new TimelineCursor(tl), () => tl.duration + 10);
    rig.update(0.016, 100);
    expect(rig.speaking).toBe(false);
  });
});

// ---------- speech controller with a fake synth and a fake clock ----------
function makeFake(opts: { startsVoice?: boolean } = {}) {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number; live: boolean }[] = [];
  let id = 0;
  const spoken: UtteranceLike[] = [];
  const synth: SynthLike = {
    speak: (u) => { spoken.push(u); if (opts.startsVoice !== false) queueMicrotask(() => u.onstart?.()); },
    cancel: vi.fn(),
    getVoices: () => [
      { name: 'eSpeak English', lang: 'en-US' },
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Microsoft Aria Online (Natural)', lang: 'en-US' },
      { name: 'Amelie', lang: 'fr-FR' },
    ],
  };
  const deps: SpeakerDeps = {
    synth,
    makeUtterance: (text) => ({ text, rate: 1, pitch: 1, volume: 1, lang: '', voice: null, onstart: null, onend: null, onerror: null, onboundary: null }),
    now: () => now,
    setTimeout: (fn, ms) => { const t = { at: now + ms, fn, id: ++id, live: true }; timers.push(t); return t.id; },
    clearTimeout: (i) => { const t = timers.find((x) => x.id === i); if (t) t.live = false; },
  };
  const advance = async (ms: number) => {
    const end = now + ms;
    await Promise.resolve();
    for (;;) {
      const next = timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      now = next.at; next.live = false; next.fn(); await Promise.resolve();
    }
    now = end; await Promise.resolve();
  };
  return { deps, spoken, advance, synth, setNow: (n: number) => { now = n; } };
}

describe('speech controller', () => {
  it('voice off: runs silently on a timer and finishes after the timeline', async () => {
    const f = makeFake(); const sp = new Speaker(f.deps);
    const h = sp.speak('Hello there', { voice: false });
    expect(f.spoken.length).toBe(0);
    expect(h.clock()).toBe(0);
    await f.advance(h.timeline.duration + 200);
    expect(h.isDone()).toBe(true);
    await h.done;
  });
  it('voice on: mouth clock starts when audio starts (not before) and tracks word boundaries', async () => {
    const f = makeFake({ startsVoice: false }); const sp = new Speaker(f.deps);
    const h = sp.speak('Hello wonderful world', { voice: true });
    expect(h.clock()).toBe(-1); // audio hasn't started: mouth stays shut
    await f.advance(100);
    f.spoken[0].onstart?.();
    await f.advance(50);
    expect(h.voiceActive()).toBe(true);
    // the voice reports it is already at the 3rd word: the mouth clock jumps there
    f.spoken[0].onboundary?.({ name: 'word', charIndex: 16 });
    expect(Math.abs(h.clock() - h.timeline.words[2].start)).toBeLessThan(2);
    f.spoken[0].onend?.();
    expect(h.isDone()).toBe(true);
    expect(h.voiceActive()).toBe(false);
  });
  it('voice blocked (never starts): falls back to silent lip-sync within ~2s', async () => {
    const f = makeFake({ startsVoice: false }); const sp = new Speaker(f.deps);
    const h = sp.speak('Hello', { voice: true });
    await f.advance(2000);
    expect(f.synth.cancel).toHaveBeenCalled();
    expect(h.clock()).toBeGreaterThanOrEqual(0);
    await f.advance(h.timeline.duration + 300);
    expect(h.isDone()).toBe(true);
  });
  it('a new speak() cancels the previous one', async () => {
    const f = makeFake(); const sp = new Speaker(f.deps);
    const a = sp.speak('first line', { voice: true });
    await f.advance(10);
    const b = sp.speak('second line', { voice: true });
    expect(a.isDone()).toBe(true);
    expect(b.isDone()).toBe(false);
    expect(f.synth.cancel).toHaveBeenCalled();
  });
  it('speech errors finish cleanly', async () => {
    const f = makeFake(); const sp = new Speaker(f.deps);
    const h = sp.speak('oops', { voice: true });
    await f.advance(10);
    f.spoken[0].onerror?.();
    expect(h.isDone()).toBe(true);
  });
  it('no speech API at all (old browser / SSR): still works as captions + lip-sync', async () => {
    const f = makeFake(); const sp = new Speaker({ ...f.deps, synth: null, makeUtterance: null });
    expect(sp.canSpeakAloud).toBe(false);
    const h = sp.speak('Hello', { voice: true });
    await f.advance(h.timeline.duration + 200);
    expect(h.isDone()).toBe(true);
  });
  it('picks a natural voice over robotic ones, and respects language', () => {
    const f = makeFake();
    expect(pickVoice(f.synth.getVoices(), 'en-US')?.name).toMatch(/Natural|Google/);
    expect(pickVoice(f.synth.getVoices(), 'fr-FR')?.name).toBe('Amelie');
    expect(pickVoice([], 'en')).toBeNull();
  });
});

describe('event bus', () => {
  it('delivers to subscribers and stops after unsubscribe', () => {
    const got: string[] = [];
    const off = subscribe((e) => got.push(e.type));
    vAgent.say('hi'); vAgent.thinking(); off(); vAgent.say('ignored');
    expect(got).toEqual(['say', 'state']);
  });
  it('a say sent before the avatar mounts is delivered once on mount; stale ones are dropped', async () => {
    emit({ type: 'say', text: 'early' });
    const got: string[] = [];
    const off = subscribe((e) => e.type === 'say' && got.push(e.text));
    await Promise.resolve();
    expect(got).toEqual(['early']);
    off();
    const off2 = subscribe((e) => e.type === 'say' && got.push(e.text));
    await Promise.resolve();
    expect(got).toEqual(['early']); // not replayed
    off2();
  });
  it('one throwing listener does not break the others', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const got: string[] = [];
    const a = subscribe(() => { throw new Error('boom'); });
    const b = subscribe((e) => got.push(e.type));
    vAgent.hide();
    expect(got).toEqual(['hide']);
    a(); b(); spy.mockRestore();
  });
});

describe('prefs', () => {
  it('round-trips, and survives corrupt/blocked storage', () => {
    const mem: Record<string, string> = {};
    const st = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    savePrefs({ ...DEFAULT_PREFS, voice: true, introSeen: true }, st);
    expect(loadPrefs(st)).toMatchObject({ voice: true, introSeen: true, captions: true });
    mem['vinx.avatar.v1'] = '{not json';
    expect(loadPrefs(st)).toEqual(DEFAULT_PREFS);
    mem['vinx.avatar.v1'] = JSON.stringify({ voice: 'yes', enabled: false });
    expect(loadPrefs(st)).toMatchObject({ voice: false, enabled: false });
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadPrefs(throwing)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(DEFAULT_PREFS, throwing)).not.toThrow();
  });
  it('voice defaults OFF (browsers block autoplay audio; opt-in is also less intrusive)', () => {
    expect(DEFAULT_PREFS.voice).toBe(false);
  });
});

describe('scripts', () => {
  const rng = () => 0;
  it('greeting reflects the real day: overdue > due today > nothing', () => {
    expect(greeting({ name: 'Ada Lovelace', hour: 8, dueToday: 0, overdue: 2 }, rng)).toMatchObject({ text: expect.stringContaining('2 things are overdue'), mood: 'concerned' });
    expect(greeting({ name: 'Ada', hour: 8, dueToday: 1, overdue: 0 }, rng).text).toContain('one thing today');
    expect(greeting({ name: 'Ada', hour: 8, dueToday: 3, overdue: 0 }, rng).text).toContain('3 things today');
    expect(greeting({ name: 'Ada', hour: 14, dueToday: 0, overdue: 0 }, rng).text).toMatch(/Nothing due today/);
    expect(greeting({ name: null, hour: 8, dueToday: 0, overdue: 0 }, rng).text).toMatch(/^Good morning\./);
  });
  it('part of day boundaries', () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22].map(partOfDay)).toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night']);
  });
  it('first name handling is safe', () => {
    expect(firstName('  Ada  Lovelace ')).toBe('Ada');
    expect(firstName(null)).toBe(''); expect(firstName('x'.repeat(60))).toBe('');
  });
  it('intro is short enough to respect attention (under ~30s of speech) and uses the name', () => {
    const intro = introLines('Ada');
    expect(intro[0].text).toContain('Ada');
    const total = intro.reduce((s, l) => s + buildTimeline(l.text).duration, 0);
    expect(total).toBeLessThan(30000);
    expect(introLines(null)[0].text).toBe("Hi! I'm V.");
  });
  it('spoken summary strips citations and markdown and stays short', () => {
    const s = spokenSummary("That's the **black-and-white sketch** [1]. It shows a girl [2][3]. " + 'More detail here. '.repeat(30), 120);
    expect(s).not.toMatch(/\[\d\]|\*\*/);
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s.endsWith('.')).toBe(true);
    expect(spokenSummary('Short answer.')).toBe('Short answer.');
    expect(spokenSummary('')).toBe('');
  });
  it('every canned line is speakable and mood is a real expression', () => {
    const all = [lines.savedText(rng), lines.savedScreenshot(rng), lines.savedVoice(), lines.reminderSet(), lines.searching(rng), lines.found(rng), lines.notFound(), lines.taskDone(rng), lines.snoozed(), lines.undone(), lines.error(), lines.voiceOn(), lines.listening()];
    for (const l of all) { expect(l.text.length).toBeGreaterThan(2); expect(Object.keys(EXPRESSIONS)).toContain(l.mood); }
  });
});

describe('expressions table', () => {
  it('every preset stays within parameter ranges', () => {
    for (const [name, p] of Object.entries(EXPRESSIONS)) for (const [k, v] of Object.entries(p)) {
      const [lo, hi] = RANGES[k as keyof typeof RANGES];
      expect(v, `${name}.${k}`).toBeGreaterThanOrEqual(lo); expect(v, `${name}.${k}`).toBeLessThanOrEqual(hi);
    }
    expect(NEUTRAL.eyeOpen).toBe(1);
  });
});
