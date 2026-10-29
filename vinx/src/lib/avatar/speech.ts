import { type Timeline, TimelineCursor, buildTimeline } from './lipsync';

/** The small slice of the browser speech API we use (lets tests substitute a fake). */
export interface SynthLike {
  speak(u: UtteranceLike): void;
  cancel(): void;
  getVoices(): VoiceLike[];
}
export interface VoiceLike { name: string; lang: string; localService?: boolean; default?: boolean }
export interface UtteranceLike {
  text: string; rate: number; pitch: number; volume: number; lang: string; voice: VoiceLike | null;
  onstart: ((e?: unknown) => void) | null;
  onend: ((e?: unknown) => void) | null;
  onerror: ((e?: unknown) => void) | null;
  onboundary: ((e: { name?: string; charIndex: number }) => void) | null;
}

export interface SpeakOptions {
  /** speak out loud (needs a user gesture in most browsers); otherwise captions + lip-sync only */
  voice: boolean;
  rate?: number;
  lang?: string;
}

export interface SpeechHandle {
  timeline: Timeline;
  cursor: TimelineCursor;
  /** ms since speech began (negative until the voice actually starts) */
  clock(): number;
  /** is a real voice currently producing audio? */
  voiceActive(): boolean;
  /** resolves when finished or cancelled */
  done: Promise<void>;
  cancel(): void;
  isDone(): boolean;
}

export interface SpeakerDeps {
  synth: SynthLike | null;
  makeUtterance: ((text: string) => UtteranceLike) | null;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export function browserDeps(): SpeakerDeps {
  const w = typeof window !== 'undefined' ? window : undefined;
  const synth = w && 'speechSynthesis' in w ? (w.speechSynthesis as unknown as SynthLike) : null;
  const Ctor = w && 'SpeechSynthesisUtterance' in w ? (w as unknown as { SpeechSynthesisUtterance: new (t: string) => UtteranceLike }).SpeechSynthesisUtterance : null;
  return {
    synth,
    makeUtterance: Ctor ? (t) => new Ctor(t) : null,
    now: () => performance.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
  };
}

const START_TIMEOUT_MS = 1800; // voice never started (blocked / no voices): continue silently

/** Pick the most natural-sounding voice we can find for a language. */
export function pickVoice(voices: VoiceLike[], lang = 'en'): VoiceLike | null {
  const base = lang.toLowerCase().split('-')[0];
  const same = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const pool = same.length ? same : voices;
  if (!pool.length) return null;
  const score = (v: VoiceLike) => {
    const n = v.name.toLowerCase();
    return (
      (/natural|neural|premium|enhanced|google/.test(n) ? 4 : 0) +
      (/samantha|aria|jenny|ava|zira|daniel|libby|sonia/.test(n) ? 2 : 0) +
      (v.default ? 1 : 0) -
      (/espeak|compact|novelty|whisper|bubbles|bells|zarvox/.test(n) ? 5 : 0)
    );
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

export class Speaker {
  private current: SpeechHandle | null = null;
  constructor(private deps: SpeakerDeps = browserDeps()) {}

  get canSpeakAloud(): boolean { return !!(this.deps.synth && this.deps.makeUtterance); }

  speak(text: string, opts: SpeakOptions): SpeechHandle {
    this.cancel();
    const d = this.deps;
    const rate = opts.rate ?? 1;
    const timeline = buildTimeline(text, 165 * rate);
    const cursor = new TimelineCursor(timeline);

    let started = false;
    let startedAt = d.now();
    let offset = 0; // re-sync correction from word-boundary events
    let finished = false;
    let voiceOn = false;
    let silent = false; // no real voice is driving this line (off, unavailable, or blocked)
    const useVoice = opts.voice && this.canSpeakAloud && timeline.text.trim().length > 0;
    let resolve!: () => void;
    const done = new Promise<void>((r) => { resolve = r; });
    const timers: unknown[] = [];

    const finish = () => {
      if (finished) return;
      finished = true;
      voiceOn = false;
      timers.forEach((t) => d.clearTimeout(t));
      resolve();
    };

    const begin = () => {
      if (started) return;
      started = true;
      startedAt = d.now();
      // safety net: if the voice never reports "end", don't hang forever
      timers.push(d.setTimeout(() => { d.synth?.cancel(); finish(); }, timeline.duration * 1.7 + 2500));
      if (silent) timers.push(d.setTimeout(finish, timeline.duration + 120));
    };

    if (useVoice) {
      const u = d.makeUtterance!(timeline.text);
      u.rate = rate;
      u.pitch = 1.04;
      u.volume = 1;
      u.lang = opts.lang ?? 'en-US';
      u.voice = pickVoice(d.synth!.getVoices(), u.lang);
      u.onstart = () => { if (silent) return; voiceOn = true; begin(); };
      u.onend = () => finish();
      u.onerror = () => finish();
      u.onboundary = (e) => {
        if (!started || (e.name && e.name !== 'word')) return;
        const w = timeline.words.find((x) => e.charIndex >= x.charStart && e.charIndex < x.charEnd + 1);
        if (w) offset = w.start - (d.now() - startedAt);
      };
      // if the voice never starts (autoplay policy, no voices), carry on silently
      timers.push(d.setTimeout(() => {
        if (!started) { silent = true; d.synth!.cancel(); begin(); }
      }, START_TIMEOUT_MS));
      try { d.synth!.speak(u); } catch { silent = true; begin(); }
    } else {
      silent = true;
      begin();
    }

    const handle: SpeechHandle = {
      timeline,
      cursor,
      clock: () => (started ? d.now() - startedAt + offset : -1),
      voiceActive: () => voiceOn && !finished,
      done,
      cancel: () => {
        if (finished) return;
        if (useVoice) { try { d.synth!.cancel(); } catch { /* ignore */ } }
        finish();
      },
      isDone: () => finished,
    };
    this.current = handle;
    return handle;
  }

  cancel() {
    this.current?.cancel();
    this.current = null;
  }
}
