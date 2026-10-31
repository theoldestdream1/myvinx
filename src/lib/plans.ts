export type PlanId = 'free' | 'pro' | 'premium';
export type Gateway = 'paystack' | 'lemonsqueezy';

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // USD per month
  tagline: string;
  vLine: string;
  quotas: { memories: number; voiceMinutes: number; images: number; aiQueries: number };
  features: string[];
  highlight?: boolean;
}

/** Approved tiers. No free trial and no automatic Pro access for new accounts. */
export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', price: 0,
    tagline: 'A real second brain. Free for good.',
    vLine: "Free, forever. I'm generous like that.",
    quotas: { memories: 150, voiceMinutes: 15, images: 25, aiQueries: 30 },
    features: ['Unlimited keyword & tag search', 'Basic one-off reminders', 'Tell V voice capture', 'Android share & iPhone shortcuts'],
  },
  {
    id: 'pro', name: 'Pro', price: 12, highlight: true,
    tagline: 'For people who actually use their brain.',
    vLine: 'The sensible choice. I approve.',
    quotas: { memories: 1500, voiceMinutes: 120, images: 250, aiQueries: 300 },
    features: ['Everything in Free', 'Repeating reminders & custom snooze', 'Telegram companion', 'Daily brief from V'],
  },
  {
    id: 'premium', name: 'Premium', price: 20,
    tagline: 'Total recall, no ceilings in sight.',
    vLine: 'Oh, we are being serious now.',
    quotas: { memories: 5000, voiceMinutes: 600, images: 1000, aiQueries: 1000 },
    features: ['Everything in Pro', 'Email-in capture & webhooks', 'Calendar feed (iCal)', 'Priority processing'],
  },
];

export const getPlan = (id: string | null | undefined) => PLANS.find((p) => p.id === id);
export const isPaidPlan = (id: string | null | undefined) => !!getPlan(id) && getPlan(id)!.price > 0;
