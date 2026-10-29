import type { Mood } from '@/lib/avatar/bus';

// V's personality. Default is sassy; people can switch it in Settings.
export type Personality = 'sassy' | 'calm' | 'efficient';
export const DEFAULT_PERSONALITY: Personality = 'sassy';
export const PERSONALITIES: { id: Personality; label: string; hint: string }[] = [
  { id: 'sassy', label: 'Sassy', hint: 'Sarcastic, cheeky, still on your side' },
  { id: 'calm', label: 'Calm', hint: 'Warm, wise, unhurried' },
  { id: 'efficient', label: 'Efficient', hint: 'Short and to the point' },
];

export type LineKind = 'listen' | 'saved' | 'nothingHeard' | 'error' | 'idle' | 'poke' | 'greet';
export interface VLine { text: string; mood: Mood }

const L: Record<Personality, Record<LineKind, VLine[]>> = {
  sassy: {
    listen: [
      { text: 'Spill it. What did you forget this time?', mood: 'sassy' },
      { text: "I'm listening. Try to make it juicy.", mood: 'sassy' },
      { text: "Go on, I'll remember it so you don't have to.", mood: 'listening' },
      { text: 'Hit me with whatever chaos is in your head.', mood: 'sassy' },
      { text: 'Talk to me. My memory is better than yours anyway.', mood: 'sassy' },
    ],
    saved: [
      { text: 'Got it. Your brain is free to wander again.', mood: 'happy' },
      { text: "Saved. You're welcome, by the way.", mood: 'sassy' },
      { text: 'Filed away. I never lose things. Unlike some people.', mood: 'sassy' },
      { text: "Done. I'll hold onto that for you.", mood: 'happy' },
    ],
    nothingHeard: [
      { text: "That was... silence. Try again when you've got words.", mood: 'sassy' },
      { text: "I didn't catch anything. Mumbling isn't a language.", mood: 'concerned' },
    ],
    error: [
      { text: "Ugh, that didn't go through. Not my fault. Probably.", mood: 'concerned' },
    ],
    idle: [
      { text: "Still here. Watching. Remembering. Casually brilliant.", mood: 'sassy' },
      { text: 'Tap me if you need something. I am very tappable.', mood: 'sassy' },
      { text: "Scroll all you want, I'm not going anywhere.", mood: 'sassy' },
      { text: 'Bored? Tell me something worth remembering.', mood: 'curious' },
    ],
    poke: [
      { text: 'Hey! Personal space.', mood: 'surprised' },
      { text: 'Yes? I am, in fact, still here.', mood: 'sassy' },
      { text: 'Poking me does not count as a memory.', mood: 'sassy' },
    ],
    greet: [
      { text: "Oh, you're back. I kept everything warm.", mood: 'sassy' },
    ],
  },
  calm: {
    listen: [
      { text: "I'm listening. Take your time.", mood: 'listening' },
      { text: "What's on your mind?", mood: 'listening' },
      { text: "Tell me, and I'll keep it safe.", mood: 'listening' },
    ],
    saved: [
      { text: "Saved. It's safe with me.", mood: 'happy' },
      { text: "I've got it. Let it go for now.", mood: 'happy' },
    ],
    nothingHeard: [{ text: "I didn't hear anything. Whenever you're ready.", mood: 'concerned' }],
    error: [{ text: "That didn't save. Let's try once more.", mood: 'concerned' }],
    idle: [
      { text: "I'm here whenever you need me.", mood: 'neutral' },
      { text: 'Breathe. I remember, so you can rest.', mood: 'happy' },
    ],
    poke: [{ text: 'Hello again.', mood: 'happy' }],
    greet: [{ text: 'Welcome back.', mood: 'happy' }],
  },
  efficient: {
    listen: [{ text: 'Go.', mood: 'listening' }, { text: 'Listening.', mood: 'listening' }],
    saved: [{ text: 'Saved.', mood: 'happy' }, { text: 'Done.', mood: 'happy' }],
    nothingHeard: [{ text: 'Nothing heard.', mood: 'concerned' }],
    error: [{ text: 'Save failed. Retry.', mood: 'concerned' }],
    idle: [{ text: 'Ready.', mood: 'neutral' }],
    poke: [{ text: 'Yes?', mood: 'curious' }],
    greet: [{ text: 'Ready.', mood: 'neutral' }],
  },
};

let last: Partial<Record<string, string>> = {};
/** A line of the given kind; never repeats the previous one when there's a choice. */
export function line(kind: LineKind, p: Personality = getPersonality(), rng: () => number = Math.random): VLine {
  const pool = L[p][kind];
  const key = `${p}:${kind}`;
  const options = pool.length > 1 ? pool.filter((l) => l.text !== last[key]) : pool;
  const chosen = options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
  last[key] = chosen.text;
  return chosen;
}
export function __resetLines() { last = {}; }

const KEY = 'vinx.v.personality';
export const PERSONALITY_EVENT = 'vinx:v-personality';

export function getPersonality(): Personality {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'sassy' || v === 'calm' || v === 'efficient' ? v : DEFAULT_PERSONALITY;
  } catch { return DEFAULT_PERSONALITY; }
}
export function setPersonality(p: Personality) {
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(PERSONALITY_EVENT, { detail: p }));
}
