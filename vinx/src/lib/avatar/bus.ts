import type { ExpressionName } from './params';

// A tiny event bus so any part of the app can talk to V without importing the avatar itself
// (the avatar code is lazy-loaded). Events sent before the avatar mounts are dropped on purpose,
// except the latest "say", which is kept briefly so a message sent during startup isn't lost.

export type Mood = ExpressionName;
export type Priority = 'low' | 'normal' | 'high';

export type AvatarEvent =
  | { type: 'say'; text: string; mood?: Mood; priority?: Priority; id?: string }
  | { type: 'emote'; mood: Mood; ms?: number }
  | { type: 'state'; state: 'idle' | 'listening' | 'thinking' }
  | { type: 'hide' }
  | { type: 'show' };

type Listener = (e: AvatarEvent) => void;
const listeners = new Set<Listener>();
let pendingSay: { e: AvatarEvent; at: number } | null = null;
const PENDING_TTL_MS = 8000;

export function emit(e: AvatarEvent) {
  if (listeners.size === 0) {
    if (e.type === 'say') pendingSay = { e, at: Date.now() };
    return;
  }
  listeners.forEach((l) => {
    try { l(e); } catch (err) { console.error('avatar listener failed', err); }
  });
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  if (pendingSay && Date.now() - pendingSay.at < PENDING_TTL_MS) {
    const e = pendingSay.e;
    pendingSay = null;
    queueMicrotask(() => l(e));
  } else {
    pendingSay = null;
  }
  return () => { listeners.delete(l); };
}

/** App-facing helpers: `vAgent.say("Got it")`, `vAgent.thinking()`, ... */
export const vAgent = {
  say: (text: string, mood?: Mood, priority: Priority = 'normal', id?: string) => emit({ type: 'say', text, mood, priority, id }),
  emote: (mood: Mood, ms?: number) => emit({ type: 'emote', mood, ms }),
  thinking: () => emit({ type: 'state', state: 'thinking' }),
  listening: () => emit({ type: 'state', state: 'listening' }),
  idle: () => emit({ type: 'state', state: 'idle' }),
  hide: () => emit({ type: 'hide' }),
  show: () => emit({ type: 'show' }),
};
