// V's body: an SVG bust that floats above the page. The markup is built once; each frame the
// renderer only touches a handful of attributes (and skips any that did not change), so it stays
// cheap. Swap `Palette` to recolour the character, or replace this file's markup with your own art
// as long as the data-ref names are kept (see REFS).

import { mouthGeometry } from './mouth';
import type { RigFrame } from './rig';
import { clamp } from './params';

export interface Palette {
  skin: string; skinShade: string; lip: string; hair: string; hairHi: string;
  suit: string; suitHi: string; accent: string; accentSoft: string; iris: string; irisDeep: string;
  brow: string; mouthInside: string;
}

export const DEFAULT_PALETTE: Palette = {
  skin: '#f3c9a8', skinShade: '#dba584', lip: '#c9605f', hair: '#1e2340', hairHi: '#4a5694',
  suit: '#141a33', suitHi: '#2a3566', accent: '#38d5ff', accentSoft: '#8fe8ff', iris: '#2fb4e6',
  irisDeep: '#0f4f86', brow: '#1e2340', mouthInside: '#4a1a26',
};

export const REFS = [
  'figure', 'head', 'halo', 'core', 'coreGlow', 'blushL', 'blushR',
  'clipL', 'clipR', 'scleraL', 'scleraR', 'irisL', 'irisR', 'pupilL', 'pupilR', 'hiL', 'hiR',
  'lidL', 'lidR', 'archL', 'archR', 'browL', 'browR',
  'mouthClip', 'mouthIn', 'teeth', 'tongue', 'upper', 'lower',
] as const;
export type RefName = (typeof REFS)[number];
export type FigureRefs = Record<RefName, SVGElement>;

const EYE = { lx: 82, rx: 118, y: 99, rx_: 9.4, ry: 10 };
const MOUTH = { x: 100, y: 127 };
const PIVOT = { x: 100, y: 150 };

/** Build the figure's SVG (a string, so it can be inserted once with innerHTML). `uid` keeps clip/gradient ids unique. */
export function figureMarkup(p: Palette = DEFAULT_PALETTE, uid = 'mm'): string {
  const id = (n: string) => `${uid}-${n}`;
  const eyeMarkup = (side: 'L' | 'R', cx: number) => `
    <clipPath id="${id('clip' + side)}"><ellipse data-ref="clip${side}" cx="${cx}" cy="${EYE.y}" rx="${EYE.rx_}" ry="${EYE.ry}"/></clipPath>
    <ellipse data-ref="sclera${side}" cx="${cx}" cy="${EYE.y}" rx="${EYE.rx_}" ry="${EYE.ry}" fill="#fbfdff"/>
    <g clip-path="url(#${id('clip' + side)})">
      <circle data-ref="iris${side}" cx="${cx}" cy="${EYE.y}" r="6.2" fill="url(#${id('iris')})"/>
      <circle data-ref="pupil${side}" cx="${cx}" cy="${EYE.y}" r="2.7" fill="#08142b"/>
      <circle data-ref="hi${side}" cx="${cx + 2}" cy="${EYE.y - 2.4}" r="1.7" fill="#fff" opacity=".95"/>
      <ellipse cx="${cx}" cy="${EYE.y - 7.5}" rx="9" ry="4" fill="#000" opacity=".10"/>
    </g>
    <ellipse data-ref="arch${side}" cx="${cx}" cy="${EYE.y + 15}" rx="12" ry="5" fill="${p.skin}"/>
    <path data-ref="lid${side}" d="M${cx - EYE.rx_} ${EYE.y}A${EYE.rx_} ${EYE.ry} 0 0 1 ${cx + EYE.rx_} ${EYE.y}" fill="none" stroke="${p.brow}" stroke-width="2.6" stroke-linecap="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="100%" height="100%" role="img" aria-label="V, your assistant" shape-rendering="geometricPrecision" overflow="visible">
  <defs>
    <radialGradient id="${id('glow')}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${p.accent}" stop-opacity=".55"/><stop offset=".6" stop-color="${p.accent}" stop-opacity=".12"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id('suit')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.suitHi}"/><stop offset="1" stop-color="${p.suit}"/>
    </linearGradient>
    <linearGradient id="${id('fade')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="${id('mask')}"><rect x="-20" y="0" width="240" height="262" fill="url(#${id('fade')})"/></mask>
    <linearGradient id="${id('skin')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.skin}"/><stop offset="1" stop-color="${p.skinShade}"/>
    </linearGradient>
    <linearGradient id="${id('hair')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.hairHi}"/><stop offset=".55" stop-color="${p.hair}"/>
    </linearGradient>
    <radialGradient id="${id('iris')}" cx="50%" cy="38%" r="65%">
      <stop offset="0" stop-color="${p.accentSoft}"/><stop offset=".55" stop-color="${p.iris}"/><stop offset="1" stop-color="${p.irisDeep}"/>
    </radialGradient>
    <radialGradient id="${id('blush')}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ff7d8a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7d8a" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${id('mouth')}"><path data-ref="mouthClip" d="M-15 0Q0 0 15 0Q0 0 -15 0Z"/></clipPath>
  </defs>

  <g data-ref="figure">
    <!-- soft halo + ring -->
    <circle cx="100" cy="112" r="104" fill="url(#${id('glow')})" data-ref="coreGlow"/>
    <g data-ref="halo" opacity=".55">
      <circle cx="100" cy="112" r="92" fill="none" stroke="${p.accent}" stroke-width=".9" stroke-dasharray="2 7 26 7" stroke-linecap="round"/>
      <circle cx="100" cy="112" r="99" fill="none" stroke="${p.accentSoft}" stroke-width=".5" stroke-dasharray="1 5" opacity=".7"/>
    </g>

    <g mask="url(#${id('mask')})">
      <!-- shoulders -->
      <path d="M14 262C16 214 40 184 76 176L100 194 124 176C160 184 184 214 186 262Z" fill="url(#${id('suit')})"/>
      <path d="M76 176L100 196 124 176" fill="none" stroke="${p.accent}" stroke-width="1.8" stroke-linejoin="round" opacity=".9"/>
      <path d="M46 194C36 212 30 236 30 262M154 194C164 212 170 236 170 262" fill="none" stroke="${p.accent}" stroke-width=".9" opacity=".45"/>
      <!-- neck -->
      <path d="M84 138L84 172C84 182 92 192 100 195 108 192 116 182 116 172L116 138Z" fill="${p.skinShade}"/>
      <path d="M84 150Q100 166 116 150L116 138 84 138Z" fill="#000" opacity=".16"/>
    </g>
    <!-- chest core -->
    <circle cx="100" cy="228" r="15" fill="${p.suit}" stroke="${p.accent}" stroke-width="1.4" opacity=".9"/>
    <circle data-ref="core" cx="100" cy="228" r="8" fill="${p.accentSoft}"/>
    <circle cx="100" cy="228" r="11" fill="none" stroke="${p.accent}" stroke-width=".8" stroke-dasharray="3 3" opacity=".8"/>

    <!-- head -->
    <g data-ref="head">
      <!-- back hair -->
      <path d="M56 98C50 58 74 32 102 32C132 32 152 58 144 100C142 118 136 128 132 134L68 134C64 128 58 118 56 98Z" fill="url(#${id('hair')})"/>
      <!-- ears -->
      <ellipse cx="59" cy="104" rx="5.5" ry="9" fill="${p.skinShade}"/>
      <ellipse cx="141" cy="104" rx="5.5" ry="9" fill="${p.skinShade}"/>
      <circle cx="140" cy="106" r="2.1" fill="${p.accent}"/>
      <!-- face -->
      <path d="M61 94C61 64 78 50 100 50C122 50 139 64 139 94C139 120 124 146 100 150C76 146 61 120 61 94Z" fill="url(#${id('skin')})"/>
      <!-- cheek shading / blush -->
      <ellipse data-ref="blushL" cx="72" cy="117" rx="11" ry="7" fill="url(#${id('blush')})"/>
      <ellipse data-ref="blushR" cx="128" cy="117" rx="11" ry="7" fill="url(#${id('blush')})"/>
      <!-- nose -->
      <path d="M97.5 111Q100 115 102.5 111" fill="none" stroke="${p.skinShade}" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>
      <!-- eyes -->
      ${eyeMarkup('L', EYE.lx)}
      ${eyeMarkup('R', EYE.rx)}
      <!-- brows -->
      <path data-ref="browL" d="M-11 1Q0 -3.5 11 0" transform="translate(${EYE.lx} 82)" fill="none" stroke="${p.brow}" stroke-width="3" stroke-linecap="round"/>
      <path data-ref="browR" d="M-11 0Q0 -3.5 11 1" transform="translate(${EYE.rx} 82)" fill="none" stroke="${p.brow}" stroke-width="3" stroke-linecap="round"/>
      <!-- mouth -->
      <g transform="translate(${MOUTH.x} ${MOUTH.y})">
        <path data-ref="mouthIn" d="M0 0" fill="${p.mouthInside}"/>
        <g clip-path="url(#${id('mouth')})">
          <rect data-ref="teeth" x="-26" y="-3" width="52" height="6" rx="2.5" fill="#fff"/>
          <ellipse data-ref="tongue" cx="0" cy="3" rx="10" ry="4.5" fill="#e0707a"/>
        </g>
        <path data-ref="upper" d="M0 0" fill="${p.lip}"/>
        <path data-ref="lower" d="M0 0" fill="${p.lip}"/>
      </g>
      <!-- front hair -->
      <path d="M55 96C46 54 72 26 104 28C136 30 154 58 145 98C142 82 134 72 122 66C112 74 90 76 74 70C66 76 60 84 55 96Z" fill="url(#${id('hair')})"/>
      <path d="M78 44C90 36 108 35 122 42" fill="none" stroke="${p.hairHi}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    </g>
  </g>
</svg>`;
}

/** Find every animated element once (so the frame loop never queries the DOM). */
export function bindFigure(root: ParentNode): FigureRefs {
  const out = {} as FigureRefs;
  for (const name of REFS) {
    const el = root.querySelector(`[data-ref="${name}"]`);
    if (!el) throw new Error(`figure: missing data-ref="${name}"`);
    out[name] = el as SVGElement;
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pushes one frame of numbers into the SVG. Remembers what it last wrote per attribute so that
 * still parts of the face cost nothing.
 */
export class FigureRenderer {
  private last = new Map<SVGElement, Map<string, string>>();
  constructor(private refs: FigureRefs) {}

  private set(name: RefName, attr: string, value: string | number) {
    const el = this.refs[name];
    const v = String(value);
    let m = this.last.get(el);
    if (!m) { m = new Map(); this.last.set(el, m); }
    if (m.get(attr) === v) return;
    m.set(attr, v);
    el.setAttribute(attr, v);
  }

  apply(f: RigFrame) {
    const R = this.set.bind(this);
    // body + head
    R('figure', 'transform', `translate(${r2(f.lean)} ${r2(f.breath * 0.7)})`);
    R('head', 'transform',
      `translate(${r2(f.headX)} ${r2(f.headY + f.breath * 0.5)}) translate(${PIVOT.x} ${PIVOT.y}) rotate(${r2(f.headRoll)}) scale(${r2(f.headScale * 1000) / 1000}) translate(${-PIVOT.x} ${-PIVOT.y})`);
    R('coreGlow', 'opacity', r2(0.35 + f.glow * 0.65));
    R('core', 'opacity', r2(0.55 + f.glow * 0.45));
    R('halo', 'opacity', r2(0.3 + f.glow * 0.45));

    // eyes
    const open = clamp(f.eyeOpen * f.blink, 0, 1.3);
    const ry = Math.max(0.15, EYE.ry * open);
    const gx = f.gazeX * 3.4;
    const gy = f.gazeY * 2.6;
    const wide = 1 + Math.max(0, f.eyeOpen - 1) * 0.5;
    for (const side of ['L', 'R'] as const) {
      const cx = side === 'L' ? EYE.lx : EYE.rx;
      R(`sclera${side}` as RefName, 'ry', r2(ry));
      R(`clip${side}` as RefName, 'ry', r2(ry));
      R(`iris${side}` as RefName, 'cx', r2(cx + gx));
      R(`iris${side}` as RefName, 'cy', r2(EYE.y + gy));
      R(`pupil${side}` as RefName, 'cx', r2(cx + gx));
      R(`pupil${side}` as RefName, 'cy', r2(EYE.y + gy));
      R(`pupil${side}` as RefName, 'r', r2(2.7 * wide));
      R(`hi${side}` as RefName, 'cx', r2(cx + gx + 2));
      R(`hi${side}` as RefName, 'cy', r2(EYE.y + gy - 2.4));
      R(`lid${side}` as RefName, 'd', `M${r2(cx - EYE.rx_)} ${EYE.y}A${EYE.rx_} ${r2(ry)} 0 0 1 ${r2(cx + EYE.rx_)} ${EYE.y}`);
      R(`arch${side}` as RefName, 'cy', r2(EYE.y + 15 - f.eyeArch * 7));
      R(`blush${side}` as RefName, 'opacity', r2(clamp(f.blush, 0, 1)));
    }

    // brows: raise + inner-end tilt
    const tilt = f.browTilt * 14;
    R('browL', 'transform', `translate(${EYE.lx} ${r2(82 - f.browL * 6.5)}) rotate(${r2(tilt)})`);
    R('browR', 'transform', `translate(${EYE.rx} ${r2(82 - f.browR * 6.5)}) rotate(${r2(-tilt)})`);

    // mouth
    const g = mouthGeometry({ open: f.mOpen, wide: f.mWide, round: f.mRound, teeth: f.mTeeth, tongue: f.mTongue, smile: f.mSmile });
    R('mouthClip', 'd', g.clip);
    R('mouthIn', 'd', g.clip);
    R('mouthIn', 'opacity', g.interior);
    R('upper', 'd', g.upper);
    R('lower', 'd', g.lower);
    R('teeth', 'y', r2(g.teethY));
    R('teeth', 'height', r2(g.teethH));
    R('teeth', 'opacity', f.mTeeth > 0.04 ? 1 : 0);
    R('tongue', 'cx', r2(g.tongueCx));
    R('tongue', 'cy', r2(g.tongueCy));
    R('tongue', 'rx', r2(g.tongueRx));
    R('tongue', 'ry', r2(g.tongueRy));
    R('tongue', 'opacity', g.interior);
  }
}
