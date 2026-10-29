import { clamp01, lerp } from './params';

export type Viseme = 'rest' | 'aa' | 'eh' | 'ee' | 'oh' | 'oo' | 'mm' | 'ff' | 'th' | 'ss' | 'ch' | 'dd';

export interface MouthShape {
  open: number; wide: number; round: number; teeth: number; tongue: number;
}

/** Mouth shapes for each speech sound group (a small, classic set of visemes). */
export const VISEMES: Record<Viseme, MouthShape> = {
  rest: { open: 0, wide: 0.5, round: 0, teeth: 0, tongue: 0 },
  aa: { open: 0.85, wide: 0.6, round: 0, teeth: 0.5, tongue: 0.15 },
  eh: { open: 0.5, wide: 0.8, round: 0, teeth: 0.7, tongue: 0.2 },
  ee: { open: 0.22, wide: 1, round: 0, teeth: 0.9, tongue: 0 },
  oh: { open: 0.62, wide: 0.15, round: 0.7, teeth: 0, tongue: 0.1 },
  oo: { open: 0.28, wide: 0, round: 1, teeth: 0, tongue: 0 },
  mm: { open: 0, wide: 0.42, round: 0, teeth: 0, tongue: 0 },
  ff: { open: 0.14, wide: 0.6, round: 0, teeth: 1, tongue: 0 },
  th: { open: 0.24, wide: 0.6, round: 0, teeth: 0.8, tongue: 1 },
  ss: { open: 0.12, wide: 0.85, round: 0, teeth: 1, tongue: 0 },
  ch: { open: 0.24, wide: 0.25, round: 0.6, teeth: 0.6, tongue: 0 },
  dd: { open: 0.3, wide: 0.6, round: 0, teeth: 0.6, tongue: 0.7 },
};

export interface MouthInput extends MouthShape {
  smile: number; // -1..1
}

export interface MouthGeometry {
  /** interior of the mouth (also used as the clip path for teeth + tongue) */
  clip: string;
  upper: string; // filled upper lip
  lower: string; // filled lower lip
  teethY: number;
  teethH: number;
  tongueCx: number;
  tongueCy: number;
  tongueRx: number;
  tongueRy: number;
  /** 1 when the interior is visible enough to bother drawing */
  interior: number;
}

const f = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Parametric mouth, drawn around (0,0). Two quadratic curves share the corners: the upper lip
 * line and the lower lip line. Opening the mouth moves the lower line down; smiling lifts the corners.
 */
export function mouthGeometry(m: MouthInput): MouthGeometry {
  const open = clamp01(m.open);
  const wide = clamp01(m.wide);
  const round = clamp01(m.round);
  const smile = Math.max(-1, Math.min(1, m.smile));
  const teeth = clamp01(m.teeth);
  const tongue = clamp01(m.tongue);

  const hw = lerp(15, 31, wide) * lerp(1, 0.58, round) + Math.max(0, smile) * 3;
  const cy = -smile * 6.5 + open * 1.2;
  const upperMid = -open * 3.5 - round * 1.2;
  const lowerMid = open * (21 - round * 4);

  // control point that puts the curve's midpoint at the requested y: Cy = 2*mid - cornerY
  const qU = 2 * upperMid - cy;
  const qL = 2 * lowerMid - cy;
  const tU = 3.1;
  const tL = 4.3 + round;

  const clip = `M${f(-hw)} ${f(cy)}Q0 ${f(qU)} ${f(hw)} ${f(cy)}Q0 ${f(qL)} ${f(-hw)} ${f(cy)}Z`;
  const upper =
    `M${f(-hw)} ${f(cy)}Q0 ${f(qU)} ${f(hw)} ${f(cy)}Q0 ${f(qU - 2 * tU)} ${f(-hw)} ${f(cy)}Z`;
  const lower =
    `M${f(-hw)} ${f(cy)}Q0 ${f(qL)} ${f(hw)} ${f(cy)}Q0 ${f(qL + 2 * tL)} ${f(-hw)} ${f(cy)}Z`;

  const teethH = teeth * (4.5 + open * 5.5);
  const teethY = upperMid - 2;
  const tongueCy = lerp(lowerMid - 2, upperMid + teethH + 2.5, tongue);

  return {
    clip, upper, lower,
    teethY, teethH: teethH + 2,
    tongueCx: 0, tongueCy,
    tongueRx: hw * 0.55, tongueRy: 4.5 + open * 2.5,
    interior: open > 0.03 ? 1 : 0,
  };
}
