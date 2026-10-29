import { useCallback, useEffect, useRef, useState } from "react";
import vWave from "@/assets/v-wave.png";

/**
 * First-visit opener: press and hold, a single point of light unfolds
 * into a line, a V, a crystal, and finally V herself.
 * Shown once per browser (remembered in localStorage).
 */
export const OPENER_KEY = "vinx.opener.v1";
const HOLD_MS = 2000; // time to fully form while holding
const DECAY = 0.7; // release rewinds at 70% of hold speed

type Vec3 = [number, number, number];

// Gem: top apex, 6-point girdle, long bottom apex (reads as a V from the front)
const N = 6;
const gem: Vec3[] = [
  [0, -1.15, 0],
  ...Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2;
    return [Math.cos(a) * 0.85, -0.35, Math.sin(a) * 0.85] as Vec3;
  }),
  [0, 1.45, 0],
];
const edges: [number, number][] = [];
for (let i = 0; i < N; i++) {
  edges.push([0, 1 + i], [1 + i, 1 + ((i + 1) % N)], [1 + i, N + 1]);
}
// Keyframes per vertex
const kPoint: Vec3[] = gem.map(() => [0, 0, 0]);
const kLine: Vec3[] = gem.map((_, i) => {
  const t = i / (gem.length - 1);
  return [-1.1 + 2.2 * t, 0, 0];
});
const kV: Vec3[] = gem.map((_, i) => {
  if (i === 0 || i === N + 1) return [0, 1.1, 0];
  const k = i - 1; // 0..5
  const left = k < 3;
  const s = left ? (k + 1) / 3 : (k - 2) / 3; // 1/3..1
  return [(left ? -1 : 1) * 0.95 * s, 1.1 - 2.1 * s, 0];
});
const frames = [kPoint, kLine, kV, gem];
const stops = [0, 0.22, 0.48, 0.78];
const captions = [
  { at: 0, text: "A point, moved, draws a line." },
  { at: 0.22, text: "A line, folded, makes a V." },
  { at: 0.48, text: "A V, turned, becomes a crystal." },
  { at: 0.78, text: "And a crystal, remembering…" },
];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function shapeAt(p: number): Vec3[] {
  let seg = stops.length - 2;
  for (let i = 0; i < stops.length - 1; i++) if (p < stops[i + 1]) { seg = i; break; }
  const t = ease(Math.min(1, Math.max(0, (p - stops[seg]) / (stops[seg + 1] - stops[seg]))));
  const A = frames[seg], B = frames[seg + 1];
  return A.map((a, i) => [lerp(a[0], B[i][0], t), lerp(a[1], B[i][1], t), lerp(a[2], B[i][2], t)]);
}

export function shouldShowOpener() {
  try {
    if (localStorage.getItem(OPENER_KEY)) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  } catch {
    return false;
  }
}

export function VOpener({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holding = useRef(false);
  const progress = useRef(0);
  const [p, setP] = useState(0); // throttled copy for UI
  const [phase, setPhase] = useState<"idle" | "forming" | "reveal" | "rest" | "gone">("idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const finish = useCallback(() => {
    try { localStorage.setItem(OPENER_KEY, "1"); } catch { /* ignore */ }
  }, []);

  const skip = useCallback(() => {
    finish();
    setPhase("gone");
    onDone();
  }, [finish, onDone]);

  // Input: pointer + space bar
  useEffect(() => {
    const down = () => { if (phaseRef.current === "idle" || phaseRef.current === "forming") { holding.current = true; setPhase("forming"); } };
    const up = () => { holding.current = false; };
    const kd = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); down(); } if (e.key === "Escape") skip(); };
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") up(); };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    (window as unknown as { __vOpenerDown?: () => void }).__vOpenerDown = down;
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
  }, [skip]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let rot = 0;
    let flash = 0;
    let lastUi = 0;
    const dust = Array.from({ length: 90 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.6 + Math.random() * 1.6,
      s: 0.3 + Math.random() * 0.9,
      z: Math.random(),
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener("resize", resize);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ph = phaseRef.current;
      if (ph === "idle" || ph === "forming") {
        const rate = 1000 / HOLD_MS;
        progress.current = holding.current
          ? Math.min(1, progress.current + dt * rate)
          : Math.max(0, progress.current - dt * rate * DECAY);
        if (progress.current >= 1) {
          holding.current = false;
          flash = 1;
          finish();
          setPhase("reveal");
        }
      }
      const pr = ph === "reveal" || ph === "rest" ? 1 : progress.current;
      if (now - lastUi > 50) { setP(pr); lastUi = now; }

      const w = innerWidth, h = innerHeight;
      const cx = w / 2, cy = h / 2;
      const scale = Math.min(w, h) * 0.17;
      ctx.clearRect(0, 0, w, h);

      // spin grows as it becomes a crystal
      const spinW = Math.max(0, (pr - 0.4) / 0.6);
      rot += dt * (0.25 + spinW * 2.4 + (ph === "reveal" ? 3 : 0));
      const tilt = 0.32 * spinW;
      const breathe = 1 + Math.sin(now / 600) * 0.03 * (1 - pr);

      const fade = ph === "reveal" ? Math.max(0, 1 - flash * 0 - (1 - flash) * 1.4) : 1;
      const pts = shapeAt(pr).map(([x, y, z]) => {
        const cr = Math.cos(rot * spinW), sr = Math.sin(rot * spinW);
        let X = x * cr - z * sr, Z = x * sr + z * cr;
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const Y = y * ct - Z * st; Z = y * st + Z * ct;
        const persp = 3.2 / (3.2 + Z);
        return { x: cx + X * scale * persp * breathe, y: cy + Y * scale * persp * breathe, z: Z };
      });

      ctx.globalCompositeOperation = "lighter";
      // converging dust near the end
      const dustA = Math.max(0, (pr - 0.55) / 0.45) * fade;
      if (dustA > 0) {
        for (const d of dust) {
          d.a += dt * d.s * 0.6;
          const r = d.r * (1.2 - pr * 0.9) * scale * 1.4;
          const x = cx + Math.cos(d.a) * r, y = cy + Math.sin(d.a) * r * 0.8;
          ctx.fillStyle = `rgba(190,225,255,${0.5 * dustA * d.z})`;
          ctx.beginPath(); ctx.arc(x, y, 0.6 + d.z, 0, Math.PI * 2); ctx.fill();
        }
      }

      // faint glass faces once it's a crystal
      const faceA = Math.max(0, (pr - 0.6) / 0.4) * 0.07 * fade;
      if (faceA > 0) {
        for (let i = 0; i < N; i++) {
          const a = pts[1 + i], b = pts[1 + ((i + 1) % N)];
          for (const apex of [pts[0], pts[N + 1]]) {
            ctx.fillStyle = `rgba(150,200,255,${faceA * (0.6 + 0.4 * Math.sin(i + rot))})`;
            ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.closePath(); ctx.fill();
          }
        }
      }

      // edges
      const glow = 8 + pr * 14;
      ctx.lineCap = "round";
      for (const [i, j] of edges) {
        const a = pts[i], b = pts[j];
        const depth = 0.55 + 0.45 * (1 - (a.z + b.z + 2) / 4);
        ctx.strokeStyle = `rgba(220,238,255,${0.85 * depth * fade})`;
        ctx.shadowColor = "rgba(140,200,255,0.9)";
        ctx.shadowBlur = glow;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // vertices
      for (const v of pts) {
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.shadowColor = "rgba(170,215,255,1)";
        ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(v.x, v.y, pr < 0.05 ? 5 : 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;

      // flash on formation
      if (flash > 0) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
        g.addColorStop(0, `rgba(230,244,255,${flash * 0.9})`);
        g.addColorStop(0.3, `rgba(150,200,255,${flash * 0.35})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        flash = Math.max(0, flash - dt * 1.1);
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, [finish]);

  // Reveal → V rests in the corner → overlay leaves
  useEffect(() => {
    if (phase === "reveal") {
      const t = setTimeout(() => setPhase("rest"), 2600);
      return () => clearTimeout(t);
    }
    if (phase === "rest") {
      const t = setTimeout(() => { setPhase("gone"); onDone(); }, 1100);
      return () => clearTimeout(t);
    }
  }, [phase, onDone]);

  const caption = [...captions].reverse().find((c) => p >= c.at)!;
  const ring = 2 * Math.PI * 11;

  return (
    <div
      className={`fixed inset-0 z-[100] select-none touch-none overflow-hidden transition-opacity duration-1000 ${phase === "rest" ? "opacity-0" : "opacity-100"} bg-background`}
      style={{ background: "radial-gradient(ellipse at center, oklch(0.16 0.01 250) 0%, oklch(0.07 0.005 250) 70%)" }}
      onPointerDown={() => (window as unknown as { __vOpenerDown?: () => void }).__vOpenerDown?.()}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-label="Vinx intro: press and hold to meet V"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="v-opener-grain pointer-events-none absolute inset-0" />

      {/* V appears */}
      {(phase === "reveal" || phase === "rest") && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <img
            src={vWave}
            alt="V, the Vinx guide, waving hello"
            className="v-opener-reveal h-[52vh] max-h-[520px] w-auto drop-shadow-[0_0_40px_oklch(0.8_0.1_240/0.45)]"
          />
          <p className="v-opener-hello mt-6 font-display text-xl text-foreground md:text-2xl">Hi, I'm V.</p>
          <p className="v-opener-hello mt-1 font-mono text-xs text-muted-foreground" style={{ animationDelay: "0.5s" }}>
            I'll remember, so you don't have to.
          </p>
        </div>
      )}

      {/* caption + progress, bottom left like a quiet subtitle */}
      {(phase === "idle" || phase === "forming") && (
        <div className="pointer-events-none absolute bottom-8 left-6 flex items-center gap-3 md:left-8">
          <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
            <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeOpacity="0.2" className="text-foreground" />
            <circle
              cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeDasharray={ring} strokeDashoffset={ring * (1 - p)} transform="rotate(-90 14 14)"
              className="text-primary"
            />
            <circle cx="14" cy="14" r="1.5" className="fill-foreground" />
          </svg>
          <div>
            {phase === "idle" && p === 0 ? (
              <>
                <p className="text-lg text-foreground">Press and hold</p>
                <p className="font-mono text-[11px] text-muted-foreground">or hold the space bar</p>
              </>
            ) : (
              <p key={caption.text} className="v-opener-caption text-lg text-foreground">{caption.text}</p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={skip}
        className="absolute right-5 top-5 rounded-full border border-border/60 px-3 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        skip
      </button>
    </div>
  );
}

export default VOpener;
