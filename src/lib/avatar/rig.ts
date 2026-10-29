import {
  type ExpressionName, type FaceParams, NEUTRAL, PARAM_KEYS, clamp, clampParams,
  expressionTarget, rateFor, smoothTo,
} from './params';
import { VISEMES } from './mouth';
import type { TimelineCursor } from './lipsync';

/** One rendered frame: the face plus a few extras the renderer needs. */
export interface RigFrame extends FaceParams {
  /** 0 = eyes shut by a blink, 1 = open (multiplies eyeOpen) */
  blink: number;
  /** -1..1 slow breathing wave */
  breath: number;
  /** 0..1 intensity of the chest core / halo glow */
  glow: number;
}

export interface RigOptions {
  rng?: () => number;
  reducedMotion?: boolean;
}

const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/**
 * The character's "brain" for motion. It owns no drawing: each frame you give it dt and it returns
 * numbers. Everything is smoothed toward targets with frame-rate independent easing, so it looks the
 * same at 30, 60 or 144 fps and can never overshoot or jitter.
 */
export class Rig {
  readonly params: FaceParams = { ...NEUTRAL };
  private rng: () => number;
  reducedMotion: boolean;

  private base: ExpressionName = 'neutral';
  private overlay: { name: ExpressionName; until: number } | null = null;

  private cursor: TimelineCursor | null = null;
  private clock: (() => number) | null = null;
  private voiceActive = false;
  private lastWord = -2;
  private nodUntil = 0;

  private blinkAt = 0;
  private blinkStart = -1;
  private doubleBlink = false;
  private gazeAt = 0;
  private gx = 0;
  private gy = 0;
  private glowTarget = 0.5;
  private glowCur = 0.5;
  private clockMs = 0;
  /** true while mouth movement is being driven by speech */
  speaking = false;

  constructor(opts: RigOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.reducedMotion = !!opts.reducedMotion;
    this.blinkAt = 1200 + this.rng() * 1500;
  }

  private look: { x: number; y: number; until: number } | null = null;

  /** Glance toward a point (-1..1 on each axis, 0,0 = straight ahead). Holds for ~2.5s, then drifts back. */
  lookAt(x: number, y: number) {
    this.look = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), until: this.clockMs + 2500 };
  }

  get expression(): ExpressionName { return this.overlay?.name ?? this.base; }

  /** Set the resting expression. */
  setExpression(name: ExpressionName) { this.base = name; }

  /** Show an expression briefly, then return to the resting one. */
  flash(name: ExpressionName, ms = 1600) {
    this.overlay = { name, until: this.clockMs + ms };
  }

  startSpeaking(cursor: TimelineCursor, clock: () => number, voiceActive: () => boolean = () => false) {
    this.cursor = cursor;
    this.clock = clock;
    this.speaking = true;
    this.lastWord = -2;
    this.voiceActiveFn = voiceActive;
  }
  private voiceActiveFn: () => boolean = () => false;

  stopSpeaking() {
    this.cursor = null;
    this.clock = null;
    this.speaking = false;
    this.voiceActive = false;
  }

  glowTo(v: number) { this.glowTarget = clamp(v, 0, 1); }

  /** Advance by dt seconds. `nowMs` is a monotonic clock (ms). */
  update(dt: number, nowMs: number): RigFrame {
    dt = clamp(dt, 0, 0.1); // a backgrounded tab must not cause a giant jump
    this.clockMs = nowMs;
    if (this.overlay && nowMs >= this.overlay.until) this.overlay = null;

    const target: FaceParams = { ...expressionTarget(this.expression) };

    // ---------- speech: mouth, stress nods, brow lifts ----------
    let stress = false;
    if (this.speaking && this.cursor && this.clock) {
      const t = this.clock();
      const s = this.cursor.sample(t);
      if (s.done) {
        if (this.voiceActiveFn()) this.babble(target, nowMs); // the voice is still going: keep the lips alive
        else this.speaking = false;
      } else {
        const v = VISEMES[s.viseme];
        target.mOpen = clamp(v.open + target.mOpen * 0.25 + (s.stress ? 0.12 : 0), 0, 1);
        target.mWide = v.wide;
        target.mRound = v.round;
        target.mTeeth = v.teeth;
        target.mTongue = v.tongue;
        stress = s.stress;
        if (s.wordIndex >= 0 && s.wordIndex !== this.lastWord) {
          this.lastWord = s.wordIndex;
          if (stress) this.nodUntil = nowMs + 180;
        }
      }
    }
    const nodding = nowMs < this.nodUntil;

    if (this.speaking) {
      const w = this.lastWord;
      target.headRoll += Math.sin(w * 1.7) * 1.6;
      target.headX += Math.sin(w * 0.9) * 1.2;
      if (nodding) target.headY += 2.6;
      if (stress) { target.browL += 0.2; target.browR += 0.2; }
    }

    // ---------- idle life: sway, gaze, blink ----------
    const sec = nowMs / 1000;
    if (!this.reducedMotion) {
      target.headRoll += Math.sin(sec * 0.62) * 0.7;
      target.headX += Math.sin(sec * 0.43 + 1) * 1.1;
      target.headY += Math.sin(sec * 0.81 + 2) * 0.8;

      if (nowMs >= this.gazeAt) {
        const calm = this.speaking ? 0.2 : 0.5;
        const atCamera = this.speaking && this.rng() < 0.7;
        this.gx = atCamera ? 0 : (this.rng() * 2 - 1) * calm;
        this.gy = atCamera ? 0 : (this.rng() * 2 - 1) * calm * 0.6;
        this.gazeAt = nowMs + 1200 + this.rng() * 2600;
      }
      if (this.look && this.clockMs < this.look.until) {
        target.gazeX += this.look.x * 0.9;
        target.gazeY += this.look.y * 0.7;
        target.headRoll += this.look.x * 1.6;
        target.headX += this.look.x * 2.2;
      } else {
        this.look = null;
        target.gazeX += this.gx;
        target.gazeY += this.gy;
      }
    }

    // ---------- smooth every parameter toward its target ----------
    for (const k of PARAM_KEYS) {
      this.params[k] = smoothTo(this.params[k], target[k], rateFor(k, this.speaking), dt);
    }
    const p = clampParams(this.params);
    Object.assign(this.params, p);

    // ---------- blink ----------
    let blink = 1;
    if (!this.reducedMotion) {
      if (this.blinkStart < 0 && nowMs >= this.blinkAt) {
        this.blinkStart = nowMs;
        this.doubleBlink = this.rng() < 0.15;
      }
      if (this.blinkStart >= 0) {
        const t = nowMs - this.blinkStart;
        if (t < 70) blink = 1 - smooth(t / 70);
        else if (t < 160) blink = smooth((t - 70) / 90);
        else {
          if (this.doubleBlink) { this.doubleBlink = false; this.blinkStart = nowMs - 20; } // second blink right away
          else { this.blinkStart = -1; this.blinkAt = nowMs + 2200 + this.rng() * 3400; }
        }
      }
    }

    this.glowCur = smoothTo(this.glowCur, this.speaking ? Math.max(this.glowTarget, 0.8) : this.glowTarget, 6, dt);

    return {
      ...p,
      blink: clamp(blink, 0, 1),
      breath: this.reducedMotion ? 0 : Math.sin((sec * Math.PI * 2) / 4.2),
      glow: this.glowCur,
    };
  }

  /** Lips keep moving softly when the real voice outlasts our estimate. */
  private babble(target: FaceParams, nowMs: number) {
    const s = nowMs / 1000;
    target.mOpen = clamp(0.28 + 0.2 * Math.sin(s * 13) * Math.sin(s * 5.1), 0, 1);
    target.mWide = 0.5 + 0.25 * Math.sin(s * 7.3);
    target.mRound = clamp(0.25 * Math.sin(s * 4.1 + 1), 0, 1);
    target.mTeeth = 0.35;
  }
}
