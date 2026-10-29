import type { Viseme } from './mouth';

// Text -> mouth timeline. There is no audio to analyse (browser speech synthesis can't be tapped),
// so we approximate speech from spelling: letter groups map to mouth shapes, timed at a natural
// speaking rate. When the real voice reports word boundaries the speech controller re-syncs to them.

export interface VisemeEvent { t: number; d: number; v: Viseme; stress: boolean; word: number }
export interface WordSpan { start: number; end: number; charStart: number; charEnd: number }
export interface Timeline { events: VisemeEvent[]; words: WordSpan[]; duration: number; text: string }

export const MAX_SPOKEN_CHARS = 600;
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const DIGITS: Viseme[] = ['oo', 'oh', 'oo', 'ee', 'ff', 'ff', 'ss', 'ss', 'eh', 'dd'];

export function wordToVisemes(word: string): Viseme[] {
  const w = word.toLowerCase().replace(/['’]/g, '');
  const out: Viseme[] = [];
  let end = w.length;
  // silent trailing "e" after a consonant ("make", "time"), but not "the" / "be"
  if (end > 3 && w.endsWith('e') && !VOWELS.has(w[end - 2])) end--;

  const push = (v: Viseme) => { if (out[out.length - 1] !== v) out.push(v); };
  let i = 0;
  while (i < end) {
    const c = w[i];
    const two = w.slice(i, i + 2);
    if (two === 'th') { push('th'); i += 2; continue; }
    if (two === 'sh' || two === 'ch') { push('ch'); i += 2; continue; }
    if (two === 'ph') { push('ff'); i += 2; continue; }
    if (two === 'ee' || two === 'ea') { push('ee'); i += 2; continue; }
    if (two === 'oo') { push('oo'); i += 2; continue; }
    if (two === 'ou' || two === 'ow') { push('oh'); i += 2; continue; }
    if (two === 'ai' || two === 'ay' || two === 'ei' || two === 'ey') { push('eh'); i += 2; continue; }

    if (c >= '0' && c <= '9') push(DIGITS[Number(c)]);
    else if (c === 'a') push('aa');
    else if (c === 'e') push('eh');
    else if (c === 'i') push('ee');
    else if (c === 'o') push('oh');
    else if (c === 'u' || c === 'w') push('oo');
    else if (c === 'y') push('ee');
    else if (c === 'm' || c === 'b' || c === 'p') push('mm');
    else if (c === 'f' || c === 'v') push('ff');
    else if (c === 's' || c === 'z' || c === 'x') push('ss');
    else if (c === 'c') push('eiy'.includes(w[i + 1] ?? '') ? 'ss' : 'dd');
    else if (c === 'j' || c === 'q') push('ch');
    else if (c === 'h') { /* breathy: no distinct mouth shape */ }
    else if (/[a-z]/.test(c)) push('dd');
    else push(c.charCodeAt(0) % 2 === 0 ? 'aa' : 'dd'); // any other script: keep the mouth moving
    i++;
  }
  return out;
}

const isVowelViseme = (v: Viseme) => v === 'aa' || v === 'eh' || v === 'ee' || v === 'oh' || v === 'oo';

function pauseFor(punct: string): number {
  let p = 0;
  for (const ch of punct) {
    if (ch === ',') p = Math.max(p, 190);
    else if (ch === ';' || ch === ':' || ch === '—' || ch === '–') p = Math.max(p, 230);
    else if (ch === '\n') p = Math.max(p, 300);
    else p = Math.max(p, 380); // . ! ? …
  }
  return p;
}

export function buildTimeline(input: string, wpm = 165): Timeline {
  const text = (input ?? '').slice(0, MAX_SPOKEN_CHARS);
  const scale = 165 / Math.max(60, Math.min(300, wpm));
  const events: VisemeEvent[] = [];
  const words: WordSpan[] = [];
  let cursor = 0;

  const re = /([\p{L}\p{N}][\p{L}\p{N}'’]*)|([.,!?;:…—–\n]+)/gu;
  for (const m of text.matchAll(re)) {
    if (m[1]) {
      const vis = wordToVisemes(m[1]);
      const list: Viseme[] = vis.length ? vis : ['eh'];
      const start = cursor;
      const idx = words.length;
      const long = m[1].length >= 6;
      list.forEach((v, n) => {
        const d = (isVowelViseme(v) ? 96 : v === 'mm' ? 70 : 58) * scale;
        events.push({ t: cursor, d, v, stress: long && n === 0, word: idx });
        cursor += d;
      });
      words.push({ start, end: cursor, charStart: m.index!, charEnd: m.index! + m[1].length });
      cursor += 24 * scale; // tiny gap between words
    } else if (m[2]) {
      const pause = pauseFor(m[2]) * scale;
      // end-of-sentence exclamations/questions lift the last word a little
      if (/[!?]/.test(m[2]) && events.length) events[events.length - 1].stress = true;
      events.push({ t: cursor, d: pause, v: 'rest', stress: false, word: -1 });
      cursor += pause;
    }
  }
  return { events, words, duration: cursor, text };
}

export interface TimelineSample { viseme: Viseme; stress: boolean; wordIndex: number; done: boolean }

/** Stateful reader: remembers where it was so a frame loop is O(1) per sample. */
export class TimelineCursor {
  private i = 0;
  constructor(public readonly tl: Timeline) {}

  sample(t: number): TimelineSample {
    const { events, duration } = this.tl;
    if (t >= duration || !events.length) return { viseme: 'rest', stress: false, wordIndex: -1, done: true };
    if (t < 0) return { viseme: 'rest', stress: false, wordIndex: -1, done: false };
    if (this.i >= events.length || events[this.i].t > t) this.i = 0; // time moved backwards (re-sync)
    while (this.i < events.length - 1 && events[this.i + 1].t <= t) this.i++;
    const e = events[this.i];
    const inside = t < e.t + e.d;
    return {
      viseme: inside ? e.v : 'rest',
      stress: inside && e.stress && t - e.t < 90,
      wordIndex: e.word,
      done: false,
    };
  }

  /** How many characters of the text should be visible at time t (for typed-out captions). */
  revealChars(t: number): number {
    const { words, text, duration } = this.tl;
    if (t >= duration) return text.length;
    if (t <= 0 || !words.length) return 0;
    let wi = -1;
    for (let k = 0; k < words.length; k++) { if (words[k].start <= t) wi = k; else break; }
    if (wi < 0) return 0;
    const w = words[wi];
    if (t >= w.end) return words[wi + 1] ? words[wi + 1].charStart : text.length;
    const frac = (t - w.start) / Math.max(1, w.end - w.start);
    return Math.round(w.charStart + frac * (w.charEnd - w.charStart));
  }
}
