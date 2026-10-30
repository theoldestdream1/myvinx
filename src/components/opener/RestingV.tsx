import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import vSit from "@/assets/v-sit.png";
import vWave from "@/assets/v-wave.png";
import vHappy from "@/assets/v-happy.png";
import vThink from "@/assets/v-think.png";
import vListen from "@/assets/v-listen.png";
import vSmug from "@/assets/v-smug.png";
import { REST, restHeight } from "./restingV";

type Pose = "sit" | "wave" | "happy" | "think" | "listen" | "smug";
const POSES: Record<Pose, string> = { sit: vSit, wave: vWave, happy: vHappy, think: vThink, listen: vListen, smug: vSmug };

const QUIPS: { text: string; pose: Pose }[] = [
  { text: "Still here. Still judging your scroll speed.", pose: "smug" },
  { text: "Save it once, describe it badly later. I'll find it.", pose: "happy" },
  { text: "Voice notes, screenshots, random thoughts. Toss them at me.", pose: "wave" },
  { text: "I remember things so you don't have to. You're welcome.", pose: "smug" },
  { text: "Thinking about signing up? I'll wait. Dramatically.", pose: "think" },
  { text: "Tap me. I don't bite. Usually.", pose: "listen" },
];
const TAPS: { text: string; pose: Pose }[] = [
  { text: "Hi. I'm V. Sign in and I'll start remembering for you.", pose: "wave" },
  { text: "Poking the glass? Bold.", pose: "smug" },
  { text: "Tell me something once. Ask me about it months later.", pose: "happy" },
  { text: "I set reminders too. Nag-free. Mostly.", pose: "think" },
];

const SPRING = { type: "spring" as const, stiffness: 120, damping: 18, mass: 1 };
const pick = <T,>(a: T[], not?: T) => { let x = a[Math.floor(Math.random() * a.length)]; if (x === not && a.length > 1) x = a[(a.indexOf(x) + 1) % a.length]; return x; };

/** V living on the landing page: breathes, roams, reacts to scroll and taps, grows when she talks. */
export function RestingV() {
  const [h, setH] = useState(restHeight());
  const [vw, setVw] = useState(innerWidth);
  const [vh, setVh] = useState(innerHeight);
  const [spot, setSpot] = useState(1); // 0 left .. 1 right
  const [rise, setRise] = useState(0);
  const [lean, setLean] = useState(0);
  const [pose, setPose] = useState<Pose>("sit");
  const [bubble, setBubble] = useState<{ text: string; k: number } | null>(null);
  const [act, setAct] = useState<null | "hop" | "look" | "walk" | "poke">(null);
  const lastY = useRef(scrollY);
  const settle = useRef<number | undefined>(undefined);
  const timers = useRef<number[]>([]);
  const lastLine = useRef<unknown>(null);
  const busy = useRef(false);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const say = useCallback((l: { text: string; pose: Pose }) => {
    lastLine.current = l;
    busy.current = true;
    setBubble({ text: l.text, k: Date.now() });
    setPose(l.pose);
    const ms = Math.min(7000, 2400 + l.text.length * 45);
    later(() => { setBubble(null); setPose("sit"); busy.current = false; }, ms);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const dy = scrollY - lastY.current;
      lastY.current = scrollY;
      setLean(Math.max(-12, Math.min(12, dy * 0.6)));
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => setLean(0), 180);
    };
    const onResize = () => { setH(restHeight()); setVw(innerWidth); setVh(innerHeight); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    // greet shortly after arriving
    later(() => say({ text: "There you are. I saved you a seat.", pose: "wave" }), 1400);
    return () => {
      removeEventListener("scroll", onScroll); removeEventListener("resize", onResize);
      clearTimeout(settle.current); timers.current.forEach(clearTimeout);
    };
  }, [say]);

  // idle life loop: every 4–8s she does something
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      if (!busy.current) {
        const r = Math.random();
        if (r < 0.35) {
          setAct("walk");
          setSpot((s) => (s > 0.5 ? Math.random() * 0.45 : 0.55 + Math.random() * 0.45));
          later(() => setAct(null), 1900);
        } else if (r < 0.5) {
          setRise(Math.random() < 0.5 ? 0 : 40 + Math.random() * Math.min(160, innerHeight * 0.2));
        } else if (r < 0.65) { setAct("hop"); later(() => setAct(null), 700); }
        else if (r < 0.8) { setAct("look"); later(() => setAct(null), 1500); }
        else say(pick(QUIPS, lastLine.current as never));
      }
      later(tick, 4000 + Math.random() * 4000);
    };
    later(tick, 5000);
    return () => { alive = false; };
  }, [say]);

  const talking = !!bubble;
  const scale = talking ? 1.45 : 1;
  const w = h * REST.aspect;
  const x = REST.margin + spot * Math.max(0, vw - w - REST.margin * 2) - (vw - REST.margin - w);
  const walkDir = 0;

  return (
    <motion.div
      className="pointer-events-none fixed z-40"
      style={{ right: REST.margin, bottom: REST.margin, height: h, width: w }}
      animate={{ x, y: -rise - (talking ? 20 : 0) }}
      transition={act === "walk" ? { x: { type: "spring", stiffness: 26, damping: 10, mass: 1.2 }, y: SPRING } : SPRING}
    >
      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble.k}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="absolute bottom-full mb-10 w-52 rounded-2xl border border-border bg-card/95 px-3 py-2 text-[13px] leading-snug text-foreground shadow-lg"
            style={spot > 0.5 ? { right: 0 } : { left: 0 }}
          >
            {bubble.text}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        className="v-ground absolute -bottom-1 left-1/2 h-2 w-3/4 -translate-x-1/2 rounded-full"
        animate={{ opacity: rise > 0 ? 0.15 : 0.5, scaleX: rise > 0 ? 0.6 : 1 }}
        style={{ background: "radial-gradient(closest-side, oklch(0.8 0.01 250 / 0.5), transparent)" }}
      />
      <motion.button
        type="button"
        aria-label="V, your Vinx guide"
        onClick={() => { setAct("poke"); later(() => setAct(null), 500); say(pick(TAPS, lastLine.current as never)); }}
        className="pointer-events-auto relative h-full w-full origin-bottom"
        animate={{
          scale,
          rotate: lean + (act === "look" ? -7 : act === "walk" ? (spot > 0.5 ? 6 : -6) + walkDir : 0),
          y: act === "hop" ? [0, -24, 0, -5, 0] : act === "walk" ? [0, -9, 0, -9, 0, -7, 0] : 0,
          scaleX: act === "look" ? [1, -1, -1, 1] : act === "poke" ? [1, 1.12, 0.95, 1] : 1,
          scaleY: act === "poke" ? [1, 0.86, 1.06, 1] : 1,
        }}
        transition={{
          scale: { type: "spring", stiffness: 180, damping: 14 },
          rotate: { type: "spring", stiffness: 140, damping: 12 },
          y: { duration: act === "walk" ? 1.9 : 0.65, ease: "easeInOut" },
          scaleX: { duration: act === "look" ? 1.5 : 0.45 },
          scaleY: { duration: 0.45 },
        }}
      >
        <div className="v-life v-life-on absolute inset-0">
          {(Object.keys(POSES) as Pose[]).map((p) => (
            <img
              key={p}
              src={POSES[p]}
              alt={p === pose ? "V" : ""}
              aria-hidden={p !== pose}
              className="absolute inset-0 h-full w-full object-contain transition-[opacity,transform] duration-300 ease-out drop-shadow-[0_6px_18px_oklch(0.85_0.01_250/0.35)]"
              style={{ opacity: p === pose ? 1 : 0, transform: p === pose ? "translateY(0)" : "translateY(3px)" }}
            />
          ))}
        </div>
      </motion.button>
    </motion.div>
  );
}

export default RestingV;
