import { useCallback, useEffect, useRef, useState } from "react";
import vWave from "@/assets/v-wave.webp";
import vSit from "@/assets/v-sit.webp";
import { REST, restRect } from "./restingV";

/**
 * First-visit opener. Hold to wake V: scattered crystal glints gather into
 * her silhouette (feet first), her glass body fills in, her eyes light up,
 * she says hi, then flies down to sit in the corner of the page.
 */
export const OPENER_KEY = "vinx.opener.v2";
const HOLD_MS = 2400;
const DECAY = 0.65;

// Eye centres in the original-size wave pose (495x990).
const IMG_W = 495, IMG_H = 990;
const EYES: [number, number][] = [[189, 247], [319, 247]];

type P = { tx: number; ty: number; sx: number; sy: number; cx: number; cy: number; d: number; c: string; s: number };

export function shouldShowOpener() {
  try {
    if (localStorage.getItem(OPENER_KEY)) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  } catch {
    return false;
  }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function figureBox() {
  const H = Math.min(innerHeight * 0.56, 540);
  const W = H * (IMG_W / IMG_H);
  return { W, H, left: innerWidth / 2 - W / 2, top: innerHeight * 0.46 - H / 2 };
}

export function VOpener({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holding = useRef(false);
  const progress = useRef(0);
  const [p, setP] = useState(0);
  const [phase, setPhase] = useState<"idle" | "forming" | "hello" | "move" | "done">("idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const remember = useCallback(() => {
    try { localStorage.setItem(OPENER_KEY, "1"); } catch { /* ignore */ }
  }, []);
  const skip = useCallback(() => { remember(); setPhase("done"); onDone(); }, [remember, onDone]);

  const press = useCallback(() => {
    if (phaseRef.current === "idle" || phaseRef.current === "forming") {
      holding.current = true;
      setPhase("forming");
    }
  }, []);

  useEffect(() => {
    const up = () => { holding.current = false; };
    const kd = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); press(); }
      if (e.key === "Escape") skip();
    };
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") up(); };
    addEventListener("keydown", kd); addEventListener("keyup", ku);
    addEventListener("pointerup", up); addEventListener("pointercancel", up); addEventListener("blur", up);
    return () => {
      removeEventListener("keydown", kd); removeEventListener("keyup", ku);
      removeEventListener("pointerup", up); removeEventListener("pointercancel", up); removeEventListener("blur", up);
    };
  }, [press, skip]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.src = vWave;
    let parts: P[] = [];
    let fb = figureBox();
    let raf = 0, last = performance.now(), lastUi = 0, burst = 0, burstT = 0;
    const glints = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.01, ph: Math.random() * 6, s: 0.6 + Math.random() * 1.6,
    }));

    const build = () => {
      fb = figureBox();
      const off = document.createElement("canvas");
      const w = Math.round(fb.W), h = Math.round(fb.H);
      off.width = w; off.height = h;
      const o = off.getContext("2d")!;
      o.drawImage(img, 0, 0, w, h);
      const data = o.getImageData(0, 0, w, h).data;
      const step = Math.max(3, Math.round(Math.sqrt((w * h) / 2600)));
      const out: P[] = [];
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 140) continue;
        const r = Math.min(255, data[i] + 40), g = Math.min(255, data[i + 1] + 50), b = Math.min(255, data[i + 2] + 70);
        const tx = fb.left + x, ty = fb.top + y;
        const a = Math.random() * Math.PI * 2;
        const R = Math.max(innerWidth, innerHeight) * (0.45 + Math.random() * 0.4);
        const sx = innerWidth / 2 + Math.cos(a) * R, sy = innerHeight / 2 + Math.sin(a) * R;
        // curve control point swirls around the figure
        const ca = a + 1.4;
        const cR = R * 0.45;
        out.push({
          tx, ty, sx, sy,
          cx: innerWidth / 2 + Math.cos(ca) * cR, cy: innerHeight / 2 + Math.sin(ca) * cR,
          d: 0.42 * (y / h) * -1 + 0.42 + Math.random() * 0.12, // feet arrive first, head last
          c: `rgb(${r},${g},${b})`, s: 1 + Math.random() * 1.4,
        });
      }
      parts = out;
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (img.complete && img.naturalWidth) build();
    };
    img.onload = build;
    resize();
    addEventListener("resize", resize);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const ph = phaseRef.current;
      if ((ph === "idle" || ph === "forming") && parts.length) {
        const rate = 1000 / HOLD_MS;
        progress.current = holding.current ? clamp(progress.current + dt * rate) : clamp(progress.current - dt * rate * DECAY);
        if (progress.current >= 1) {
          holding.current = false; burst = 1; burstT = 0; remember();
          setBox({ left: fb.left, top: fb.top, width: fb.W, height: fb.H });
          setPhase("hello");
        }
      }
      const pr = ph === "idle" || ph === "forming" ? progress.current : 1;
      if (now - lastUi > 50) { setP(pr); lastUi = now; }

      const W = innerWidth, H = innerHeight;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      // ambient drifting glints (little diamonds)
      for (const g of glints) {
        g.y -= g.v * dt * (1 + pr * 3); if (g.y < -0.02) g.y = 1.02;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(now / 900 + g.ph));
        const x = g.x * W, y = g.y * H, s = g.s * (1 + pr);
        ctx.fillStyle = `rgba(180,215,255,${0.35 * tw * (ph === "move" ? 0 : 1)})`;
        ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill();
      }

      const handedOff = ph === "hello" || ph === "move";
      if (!handedOff) {
        // idle heart: a small faceted shard pulsing where V will stand
        const f = pr / 0.62; // formation window
        if (pr < 0.08) {
          const pulse = 0.6 + 0.4 * Math.sin(now / 420);
          const cx = W / 2, cy = fb.top + fb.H * 0.55, s = 7 + pulse * 3;
          ctx.shadowColor = "rgba(150,205,255,1)"; ctx.shadowBlur = 24;
          ctx.fillStyle = `rgba(225,240,255,${0.9 * (1 - pr / 0.08)})`;
          ctx.beginPath(); ctx.moveTo(cx, cy - s * 1.8); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s * 1.8); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
        }
        // body fill reveal (rises from feet), eyes ignite last
        const reveal = easeInOut(clamp((pr - 0.5) / 0.32));
        for (const q of parts) {
          const t = easeOut(clamp((f * 1.55 - q.d) / 1));
          if (t <= 0) continue;
          const u = 1 - t;
          const x = u * u * q.sx + 2 * u * t * q.cx + t * t * q.tx;
          const y = u * u * q.sy + 2 * u * t * q.cy + t * t * q.ty;
          const shimmer = 0.75 + 0.25 * Math.sin(now / 200 + q.tx * 0.05);
          ctx.globalAlpha = Math.min(1, t * 1.4) * (1 - reveal * 0.9) * shimmer;
          ctx.fillStyle = q.c;
          const s = q.s * (1 + u * 1.5);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        if (reveal > 0 && img.complete) {
          ctx.globalCompositeOperation = "source-over";
          const cut = fb.top + fb.H * (1 - reveal);
          ctx.save();
          ctx.beginPath(); ctx.rect(fb.left - 20, cut, fb.W + 40, fb.H - (cut - fb.top) + 4); ctx.clip();
          ctx.globalAlpha = 0.25 + 0.75 * reveal;
          ctx.drawImage(img, fb.left, fb.top, fb.W, fb.H);
          ctx.restore();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "lighter";
          if (reveal < 1) {
            const g = ctx.createLinearGradient(0, cut - 18, 0, cut + 18);
            g.addColorStop(0, "rgba(160,210,255,0)"); g.addColorStop(0.5, "rgba(200,230,255,0.75)"); g.addColorStop(1, "rgba(160,210,255,0)");
            ctx.fillStyle = g; ctx.fillRect(fb.left - 30, cut - 18, fb.W + 60, 36);
          }
        }
        const eyes = clamp((pr - 0.84) / 0.16);
        if (eyes > 0) {
          for (const [ex, ey] of EYES) {
            const x = fb.left + (ex / IMG_W) * fb.W, y = fb.top + (ey / IMG_H) * fb.H;
            const r = fb.W * 0.16 * (0.6 + eyes * 0.6);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(200,235,255,${0.9 * eyes})`); g.addColorStop(1, "rgba(120,190,255,0)");
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      // burst: a crystal shockwave ring + flash
      if (burst > 0) {
        burstT += dt;
        const cx = W / 2, cy = fb.top + fb.H * 0.45;
        const r = burstT * Math.max(W, H) * 1.1;
        ctx.strokeStyle = `rgba(200,230,255,${burst * 0.8})`; ctx.lineWidth = 2 + burst * 4;
        ctx.shadowColor = "rgba(150,205,255,1)"; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
        g.addColorStop(0, `rgba(220,240,255,${burst * 0.55})`); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        burst = Math.max(0, burst - dt * 1.3);
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, [remember]);

  // hello → fly to the corner and sit → hand over to the resting V
  useEffect(() => {
    if (phase === "hello") {
      const t = setTimeout(() => { setBox(restRect()); setPhase("move"); }, 2800);
      return () => clearTimeout(t);
    }
    if (phase === "move") {
      const t = setTimeout(() => { setPhase("done"); onDone(); }, REST.flyMs + 450);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, onDone]);

  const label = p < 0.01 ? "" : p < 0.5 ? "Gathering the pieces" : p < 0.84 ? "Taking shape" : "Waking up";
  const sat = phase === "move";

  return (
    <div
      className="fixed inset-0 z-[100] select-none touch-none overflow-hidden"
      onPointerDown={press}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-label="Vinx intro: press and hold to wake V"
      style={{ pointerEvents: sat ? "none" : "auto" }}
    >
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: sat ? 0 : 1,
          background: "radial-gradient(ellipse at 50% 46%, oklch(0.17 0.02 250) 0%, oklch(0.06 0.01 250) 72%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* V herself once formed (DOM so she can fly to the corner) */}
      {box && (
        <div
          className="absolute"
          style={{
            left: box.left, top: box.top, width: box.width, height: box.height,
            transition: sat
              ? `left ${REST.flyMs}ms cubic-bezier(.5,-0.25,.3,1.2), top ${REST.flyMs}ms cubic-bezier(.65,0,.35,1), width ${REST.flyMs}ms cubic-bezier(.65,0,.35,1), height ${REST.flyMs}ms cubic-bezier(.65,0,.35,1)`
              : "none",
          }}
        >
          <img src={vWave} alt="V waving hello" className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${sat ? "opacity-0 delay-[700ms]" : "v-hello-bob"}`} />
          <img src={vSit} alt="" aria-hidden className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${sat ? "opacity-100 delay-[700ms]" : "opacity-0"}`} />
        </div>
      )}

      {phase === "hello" && box && (
        <div className="pointer-events-none absolute inset-x-0 text-center" style={{ top: box.top + box.height + 18 }}>
          <p className="v-opener-hello font-display text-2xl text-foreground">Hi, I'm V.</p>
          <p className="v-opener-hello mt-1 text-sm text-muted-foreground" style={{ animationDelay: "1.2s" }}>
            I'll keep track of everything. I'll be right over here.
          </p>
        </div>
      )}

      {(phase === "idle" || phase === "forming") && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-3">
          <p className="font-display text-base tracking-wide text-foreground">
            {label ? <span key={label} className="v-opener-caption inline-block">{label}</span> : "Hold to wake V"}
          </p>
          <div className="h-px w-40 overflow-hidden bg-border">
            <div className="h-full bg-primary" style={{ width: `${p * 100}%` }} />
          </div>
          {!label && <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">press and hold anywhere</p>}
        </div>
      )}

      {!sat && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={skip}
          className="absolute right-5 top-5 rounded-full border border-border bg-card/70 px-4 py-2 font-mono text-xs text-foreground transition-colors hover:bg-card"
        >
          Skip intro →
        </button>
      )}
    </div>
  );
}

export default VOpener;
