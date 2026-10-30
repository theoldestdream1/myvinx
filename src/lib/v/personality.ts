import type { Mood } from '@/lib/avatar/bus';

// V's personality. Default is sassy; people can switch it in Settings.
export type Personality = 'sassy' | 'calm' | 'efficient';
export const DEFAULT_PERSONALITY: Personality = 'sassy';
export const PERSONALITIES: { id: Personality; label: string; hint: string }[] = [
  { id: 'sassy', label: 'Sassy', hint: 'Sarcastic, cheeky, still on your side' },
  { id: 'calm', label: 'Calm', hint: 'Warm, wise, unhurried' },
  { id: 'efficient', label: 'Efficient', hint: 'Short and to the point' },
];

export type LineKind = 'listen' | 'saved' | 'nothingHeard' | 'error' | 'idle' | 'poke' | 'greet' | 'search' | 'home';
export interface VLine { text: string; mood: Mood }

// Sassy V: dry wit, quiet confidence, the odd cheeky aside. Never at the cost of clarity.
const TAPPED: VLine[] = [
  { text: 'Oh? You need me? Go ahead.', mood: 'sassy' },
  { text: "I'm all ears. Well, not literally.", mood: 'listening' },
  { text: "Let's hear it. Try to make it interesting.", mood: 'sassy' },
  { text: "Yes, boss. What's on your mind?", mood: 'listening' },
  { text: 'You have my attention. Use it wisely.', mood: 'sassy' },
  { text: "Go on. I'll try not to judge.", mood: 'sassy' },
  { text: "Something to remember? A thought? A secret? I'm listening.", mood: 'listening' },
  { text: "Alright, let's get that out of your head and into mine.", mood: 'happy' },
];

const L: Record<Personality, Record<LineKind, VLine[]>> = {
  sassy: {
    listen: TAPPED,
    poke: TAPPED,
    greet: TAPPED,
    saved: [
      { text: 'Got it. You already owe me one.', mood: 'sassy' },
      { text: "Safely tucked away. You're welcome.", mood: 'happy' },
      { text: 'Saved. One less thing for that brain of yours to juggle.', mood: 'happy' },
      { text: 'Consider it remembered. I do have my uses.', mood: 'sassy' },
      { text: 'Captured. Look at us being organised.', mood: 'happy' },
      { text: "It's in. Try not to make me do all the remembering.", mood: 'sassy' },
    ],
    nothingHeard: [
      { text: "I didn't catch anything. Try again, a little louder.", mood: 'concerned' },
      { text: 'That was mostly silence. Tap me and try once more.', mood: 'sassy' },
    ],
    error: [
      { text: "That didn't save. Give it another go — I'll be ready.", mood: 'concerned' },
    ],
    idle: [
      { text: "I'm listening. Well, not literally. Yet.", mood: 'sassy' },
      { text: "You look like someone who's about to forget something.", mood: 'sassy' },
      { text: 'Go on. Give me something to do.', mood: 'curious' },
      { text: "I've been productive. You?", mood: 'sassy' },
      { text: 'Your brain called. It wants a backup.', mood: 'sassy' },
      { text: 'Just here, keeping you organised.', mood: 'happy' },
      { text: 'I could be doing something useful. Just saying.', mood: 'sassy' },
      { text: "Don't mind me. I'm simply indispensable.", mood: 'sassy' },
      { text: "Anything you'd like to stop forgetting today?", mood: 'curious' },
      { text: "I've got room for one more questionable idea.", mood: 'happy' },
    ],
    search: [
      { text: 'Let me dig through our little archive.', mood: 'thinking' },
      { text: 'One moment. I know we put that somewhere.', mood: 'thinking' },
      { text: 'Searching my memory. Unlike some people, I keep records.', mood: 'thinking' },
      { text: "On it. Let's see what past-you was thinking.", mood: 'thinking' },
      { text: 'Give me a second. I refuse to be defeated by your own notes.', mood: 'thinking' },
      { text: 'Retrieving that now. This is why you keep me around.', mood: 'thinking' },
    ],
    home: [
      { text: 'Fine. Back to my seat.', mood: 'sassy' },
      { text: 'Summoned. Sitting nicely, as requested.', mood: 'happy' },
      { text: "Right here. I wasn't wandering, I was patrolling.", mood: 'sassy' },
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
    search: [{ text: 'Let me look through your memories.', mood: 'thinking' }, { text: 'One moment, finding it.', mood: 'thinking' }],
    home: [{ text: 'Back in my spot.', mood: 'happy' }],
  },
  efficient: {
    listen: [{ text: 'Go.', mood: 'listening' }, { text: 'Listening.', mood: 'listening' }],
    saved: [{ text: 'Saved.', mood: 'happy' }, { text: 'Done.', mood: 'happy' }],
    nothingHeard: [{ text: 'Nothing heard.', mood: 'concerned' }],
    error: [{ text: 'Save failed. Retry.', mood: 'concerned' }],
    idle: [{ text: 'Ready.', mood: 'neutral' }],
    poke: [{ text: 'Yes?', mood: 'curious' }],
    greet: [{ text: 'Ready.', mood: 'neutral' }],
    search: [{ text: 'Searching.', mood: 'thinking' }],
    home: [{ text: 'Home.', mood: 'neutral' }],
  },
};

let last: Record<string, string[]> = {};
/** A line of the given kind; avoids the last few lines used for that kind (up to half the pool). */
export function line(kind: LineKind, p: Personality = getPersonality(), rng: () => number = Math.random): VLine {
  const pool = L[p][kind];
  const key = `${p}:${kind}`;
  const recent = last[key] ?? [];
  const memory = Math.min(3, Math.floor(pool.length / 2));
  const options = pool.filter((l) => !recent.slice(-memory).includes(l.text));
  const from = options.length ? options : pool;
  const chosen = from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
  last[key] = [...recent, chosen.text].slice(-5);
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
