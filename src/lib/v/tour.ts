export const TOUR_EVENT = 'vinx:tour-start';
export const tourKey = (userId: string) => `vinx.tour.v1.${userId}`;
export const TOUR_STOPS = [
  { path: '/dashboard', title: 'Welcome to my house.', text: "I'm V. Give me the things your brain refuses to hold onto. I'll keep them here. You're welcome.", target: 'header' },
  { path: '/capture', title: 'Leave it with me.', text: 'Write a thought, attach a screenshot, or record a voice note here. Tap me anywhere for Tell V — your voice, saved without leaving the page.', target: 'textarea' },
  { path: '/timeline', title: 'Nothing gets lost in here.', text: 'Your memories live in Timeline. Open one to edit it, or move it to Trash when you no longer need it.', target: 'h1' },
  { path: '/intents', title: 'I keep an eye on the clock.', text: 'Enable notifications on this device here. Set dates, repeats and snoozes for reminders. On iPhone, open Vinx from your Home Screen first — a Siri shortcut alone does not enable alerts.', target: '[data-tour="notifications"]' },
  { path: '/query', title: 'Ask. Even vaguely.', text: "Describe what you remember and I'll search your archive. No need to recall the exact words. That's rather the point of me.", target: 'textarea, input' },
  { path: '/settings', title: 'Make yourself comfortable.', text: 'Choose light or dark, and connect Telegram or phone shortcuts here. Replay this tour whenever you need. I shall try not to look offended.', target: 'h1' },
] as const;
export function tourSeen(userId: string): boolean {
  try { return localStorage.getItem(tourKey(userId)) === 'done'; } catch { return false; }
}
export function finishTour(userId: string) {
  try { localStorage.setItem(tourKey(userId), 'done'); } catch { /* current session still closes */ }
}
export function startTour() { window.dispatchEvent(new Event(TOUR_EVENT)); }