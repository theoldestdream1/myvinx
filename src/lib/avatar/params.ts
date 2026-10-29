// Face/body parameters for V, the assistant avatar. Everything the character can do is a number
// in this table, so expressions are just presets and animation is just smoothing toward targets.

export interface FaceParams {
  // mouth
  mOpen: number; // 0..1 how far the lips part
  mWide: number; // 0..1 narrow -> wide (0.5 = neutral)
  mRound: number; // 0..1 pursed ("oo")
  mSmile: number; // -1..1 mouth corners down/up
  mTeeth: number; // 0..1 upper teeth showing
  mTongue: number; // 0..1 tongue raised
  // eyes
  eyeOpen: number; // 0..1.25 (above 1 = wide eyes)
  eyeArch: number; // 0..1 cheeks push the lower lids up ("smiling eyes")
  gazeX: number; // -1..1
  gazeY: number; // -1..1
  // brows
  browL: number; // -1..1 raise
  browR: number;
  browTilt: number; // -1..1: + inner ends down (focus), - inner ends up (worry)
  blush: number; // 0..1
  // head / body
  headRoll: number; // degrees
  headX: number; // viewBox units
  headY: number;
  headScale: number;
  lean: number; // body shift in viewBox units
}

export type ParamKey = keyof FaceParams;

export const NEUTRAL: FaceParams = {
  mOpen: 0, mWide: 0.5, mRound: 0, mSmile: 0.15, mTeeth: 0, mTongue: 0,
  eyeOpen: 1, eyeArch: 0, gazeX: 0, gazeY: 0,
  browL: 0, browR: 0, browTilt: 0, blush: 0.15,
  headRoll: 0, headX: 0, headY: 0, headScale: 1, lean: 0,
};

export type ExpressionName =
  | 'neutral' | 'happy' | 'excited' | 'thinking' | 'curious'
  | 'surprised' | 'concerned' | 'listening' | 'focused' | 'sassy';

export const EXPRESSIONS: Record<ExpressionName, Partial<FaceParams>> = {
  neutral: {},
  sassy: { mSmile: 0.5, eyeArch: 0.2, browL: 0.3, browR: -0.1, headRoll: 4 },
  happy: { mSmile: 0.9, mOpen: 0.1, mTeeth: 0.55, mWide: 0.7, eyeArch: 0.6, browL: 0.15, browR: 0.15, blush: 0.5, headRoll: -2 },
  excited: {
    mSmile: 1, mOpen: 0.35, mTeeth: 0.8, mWide: 0.8, eyeOpen: 1.12, eyeArch: 0.25,
    browL: 0.5, browR: 0.5, blush: 0.65, headScale: 1.02, headY: -2,
  },
  thinking: {
    mSmile: -0.05, mWide: 0.4, gazeX: 0.55, gazeY: -0.6, browL: 0.1, browR: 0.5,
    browTilt: 0.15, headRoll: 4, headX: -3,
  },
  curious: { mSmile: 0.25, browL: 0.1, browR: 0.65, headRoll: 5, eyeOpen: 1.05, gazeX: 0.15, gazeY: -0.1 },
  surprised: {
    mOpen: 0.7, mWide: 0.3, mRound: 0.55, mSmile: 0, mTeeth: 0.1, eyeOpen: 1.25,
    browL: 0.85, browR: 0.85, headScale: 1.02, headY: -2,
  },
  concerned: {
    mSmile: -0.5, mWide: 0.4, browL: 0.35, browR: 0.35, browTilt: -0.8,
    eyeOpen: 0.92, headRoll: -3, gazeY: 0.1,
  },
  listening: { mSmile: 0.25, eyeOpen: 1.1, browL: 0.3, browR: 0.3, headRoll: 3, headScale: 1.025, lean: -3 },
  focused: { mSmile: 0, browTilt: 0.5, eyeOpen: 0.88, browL: -0.1, browR: -0.1 },
};

export const PARAM_KEYS = Object.keys(NEUTRAL) as ParamKey[];

export const RANGES: Record<ParamKey, [number, number]> = {
  mOpen: [0, 1], mWide: [0, 1], mRound: [0, 1], mSmile: [-1, 1], mTeeth: [0, 1], mTongue: [0, 1],
  eyeOpen: [0, 1.25], eyeArch: [0, 1], gazeX: [-1, 1], gazeY: [-1, 1],
  browL: [-1, 1], browR: [-1, 1], browTilt: [-1, 1], blush: [0, 1],
  headRoll: [-12, 12], headX: [-10, 10], headY: [-10, 10], headScale: [0.9, 1.1], lean: [-10, 10],
};

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent exponential smoothing: never overshoots, stable for any dt. */
export function smoothTo(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

/** How fast each parameter chases its target (per second). Mouth is quick, head is lazy. */
export function rateFor(key: ParamKey, speaking: boolean): number {
  switch (key) {
    case 'mOpen': case 'mWide': case 'mRound': case 'mTeeth': case 'mTongue':
      return speaking ? 34 : 16;
    case 'mSmile': return 12;
    case 'eyeOpen': case 'eyeArch': return 18;
    case 'gazeX': case 'gazeY': return 11;
    case 'browL': case 'browR': case 'browTilt': return 14;
    case 'blush': return 4;
    default: return 9; // head + lean
  }
}

export function expressionTarget(name: ExpressionName): FaceParams {
  return { ...NEUTRAL, ...EXPRESSIONS[name] };
}

export function clampParams(p: FaceParams): FaceParams {
  const out = { ...p };
  for (const k of PARAM_KEYS) out[k] = clamp(out[k], RANGES[k][0], RANGES[k][1]);
  return out;
}
