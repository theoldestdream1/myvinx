import type { Mood } from './bus';

// What V says. Short, warm, specific. Variety comes from picking among a few phrasings so
// repeated actions don't sound robotic. Nothing here claims abilities the app doesn't have.

export interface Line { text: string; mood: Mood }
type Rng = () => number;
const pick = <T,>(xs: T[], rng: Rng): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function firstName(display?: string | null): string {
  const n = (display ?? '').trim().split(/\s+/)[0] ?? '';
  return n.length > 0 && n.length <= 24 ? n : '';
}

/** The one-time introduction. Kept to ~25 seconds of speech so it respects the person's time. */
export function introLines(name?: string | null): Line[] {
  const n = firstName(name);
  return [
    { text: n ? `Hi ${n}! I'm V.` : "Hi! I'm V.", mood: 'excited' },
    { text: "I'm here to remember everything for you, so you don't have to.", mood: 'happy' },
    { text: 'Send me a note, a screenshot, a voice memo, anything. I read it and file it away.', mood: 'happy' },
    { text: "Later, just describe it the way you remember it, even vaguely, and I'll find it.", mood: 'curious' },
    { text: "I'll also remind you at the right moment. Let's get started!", mood: 'excited' },
  ];
}

export interface GreetingCtx { name?: string | null; hour: number; dueToday: number; overdue: number }

/** A short "welcome back" that is actually useful: it tells you what's on today. */
export function greeting(ctx: GreetingCtx, rng: Rng = Math.random): Line {
  const n = firstName(ctx.name);
  const part = partOfDay(ctx.hour);
  const hello = pick(
    {
      morning: [`Good morning${n ? `, ${n}` : ''}.`, `Morning${n ? `, ${n}` : ''}!`],
      afternoon: [`Good afternoon${n ? `, ${n}` : ''}.`, `Hey${n ? ` ${n}` : ''}, welcome back.`],
      evening: [`Good evening${n ? `, ${n}` : ''}.`, `Hey${n ? ` ${n}` : ''}, welcome back.`],
      night: [`Working late${n ? `, ${n}` : ''}?`, `Hey${n ? ` ${n}` : ''}, still up?`],
    }[part],
    rng,
  );
  const { dueToday, overdue } = ctx;
  if (overdue > 0) {
    return { text: `${hello} ${overdue === 1 ? 'One thing is' : `${overdue} things are`} overdue.`, mood: 'concerned' };
  }
  if (dueToday > 0) {
    return { text: `${hello} You have ${dueToday === 1 ? 'one thing' : `${dueToday} things`} today.`, mood: 'focused' };
  }
  return { text: `${hello} Nothing due today.`, mood: 'happy' };
}

export const lines = {
  savedText: (rng: Rng = Math.random): Line => pick(
    [
      { text: "Got it. I'll remember that.", mood: 'happy' as Mood },
      { text: 'Saved. It is safe with me.', mood: 'happy' as Mood },
      { text: 'Noted!', mood: 'happy' as Mood },
    ], rng),
  savedScreenshot: (rng: Rng = Math.random): Line => pick(
    [
      { text: 'Got the screenshot. Reading it now.', mood: 'curious' as Mood },
      { text: "Nice, I'll take a look at that image.", mood: 'curious' as Mood },
    ], rng),
  savedVoice: (): Line => ({ text: 'Voice note saved.', mood: 'happy' }),
  reminderSet: (): Line => ({ text: "I'll remind you when it's time.", mood: 'happy' }),
  searching: (rng: Rng = Math.random): Line => pick(
    [
      { text: 'Let me look.', mood: 'thinking' as Mood },
      { text: 'Searching your memories...', mood: 'thinking' as Mood },
      { text: 'One moment.', mood: 'thinking' as Mood },
    ], rng),
  found: (rng: Rng = Math.random): Line => pick(
    [
      { text: 'Found it!', mood: 'excited' as Mood },
      { text: 'Here it is.', mood: 'happy' as Mood },
      { text: 'I think this is it.', mood: 'happy' as Mood },
    ], rng),
  notFound: (): Line => ({ text: "I couldn't find that one. Try describing it another way.", mood: 'concerned' }),
  taskDone: (rng: Rng = Math.random): Line => pick(
    [
      { text: 'Done. Nice work!', mood: 'happy' as Mood },
      { text: 'Checked off.', mood: 'happy' as Mood },
    ], rng),
  snoozed: (): Line => ({ text: "Snoozed. I'll bring it back.", mood: 'neutral' }),
  undone: (): Line => ({ text: 'Removed.', mood: 'neutral' }),
  error: (): Line => ({ text: "Sorry, something went wrong. Let's try that again.", mood: 'concerned' }),
  voiceOn: (): Line => ({ text: "Voice is on. I'll talk to you from now on.", mood: 'happy' }),
  listening: (): Line => ({ text: "I'm listening.", mood: 'listening' }),
};

/** Trim what we speak out loud from long model answers: the first sentence or two, no citations. */
export function spokenSummary(answer: string, maxChars = 220): string {
  const clean = answer
    .replace(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, '') // [1] [2][3]
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxChars) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > maxChars) break;
    out += s;
  }
  return (out || clean.slice(0, maxChars)).trim();
}
