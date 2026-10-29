import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { subscribe, type AvatarEvent, type Mood } from "@/lib/avatar/bus";
import { useIsMobile } from "@/hooks/use-mobile";
import vSit from "@/assets/v-sit.png";
import vWave from "@/assets/v-wave.png";
import { Mic, Search, Bell, X } from "lucide-react";

type State = "idle" | "listening" | "thinking";
interface Bubble { text: string; mood?: Mood; key: number }

const ASPECT = 530 / 974;
const GREETINGS = [
  "I'm here. Tell me anything — I'll remember it.",
  "Need something? Ask me, I probably saved it.",
  "Still watching your back. Quietly.",
];

/** V lives on every app screen: rests above the nav, reacts to the app, grows when she talks. */
export function VCompanion() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("idle");
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [mood, setMood] = useState<Mood>("neutral");
  const [hidden, setHidden] = useState(false);
  const [menu, setMenu] = useState(false);
  const [lean, setLean] = useState(0);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const moodTimer = useRef<number | undefined>(undefined);
  const lastY = useRef(0);
  const settle = useRef<number | undefined>(undefined);

  useEffect(() => {
    const unsub = subscribe((e: AvatarEvent) => {
      if (e.type === "say") {
        setMenu(false);
        setBubble({ text: e.text, mood: e.mood, key: Date.now() });
        if (e.mood) setMood(e.mood);
        setState("idle");
        clearTimeout(bubbleTimer.current);
        const ms = Math.min(9000, 2600 + e.text.length * 45);
        bubbleTimer.current = window.setTimeout(() => { setBubble(null); setMood("neutral"); }, ms);
      } else if (e.type === "emote") {
        setMood(e.mood);
        clearTimeout(moodTimer.current);
        moodTimer.current = window.setTimeout(() => setMood("neutral"), e.ms ?? 1800);
      } else if (e.type === "state") {
        setState(e.state);
      } else if (e.type === "hide") setHidden(true);
      else if (e.type === "show") setHidden(false);
    });
    return () => { unsub(); clearTimeout(bubbleTimer.current); clearTimeout(moodTimer.current); };
  }, []);

  useEffect(() => {
    lastY.current = scrollY;
    const onScroll = () => {
      const dy = scrollY - lastY.current;
      lastY.current = scrollY;
      setLean(Math.max(-9, Math.min(9, dy * 0.5)));
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => setLean(0), 160);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); clearTimeout(settle.current); };
  }, []);

  if (hidden) return null;

  const speaking = !!bubble;
  const base = isMobile ? 84 : 112;
  const h = speaking || menu ? base * 1.35 : state === "idle" ? base : base * 1.15;
  const img = speaking && (mood === "happy" || mood === "excited") ? vWave : vSit;
  const go = (to: string) => { setMenu(false); navigate(to); };

  const tap = () => {
    if (bubble) { setBubble(null); return; }
    setMenu((m) => !m);
  };

  return (
    <div
      className="pointer-events-none fixed right-3 z-40 flex flex-col items-end"
      style={{ bottom: isMobile ? "calc(env(safe-area-inset-bottom) + 88px)" : 20 }}
    >
      {(bubble || menu) && (
        <div
          key={bubble?.key ?? "menu"}
          className="v-bubble pointer-events-auto mb-2 max-w-[240px] rounded-2xl border border-border/70 bg-card/95 px-3.5 py-2.5 text-sm leading-snug text-foreground shadow-xl backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          {bubble ? bubble.text : (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm">{GREETINGS[new Date().getMinutes() % GREETINGS.length]}</p>
                <button aria-label="Close" onClick={() => setMenu(false)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => go("/capture")} className="flex flex-1 items-center justify-center gap-1 rounded-full bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground"><Mic className="h-3.5 w-3.5" />Tell</button>
                <button onClick={() => go("/query")} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-border px-2 py-1.5 text-xs"><Search className="h-3.5 w-3.5" />Ask</button>
                <button onClick={() => go("/intents")} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-border px-2 py-1.5 text-xs"><Bell className="h-3.5 w-3.5" />Remind</button>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        aria-label="V, your guide. Tap for quick actions."
        onClick={tap}
        className="pointer-events-auto relative"
        style={{
          height: h,
          width: h * ASPECT,
          transform: `rotate(${lean}deg) translateY(${Math.abs(lean) * -0.6}px)`,
          transition: "height 420ms cubic-bezier(.34,1.56,.64,1), width 420ms cubic-bezier(.34,1.56,.64,1), transform 380ms cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        {state !== "idle" && <span className={`v-aura v-aura-${state}`} aria-hidden />}
        <img
          src={img}
          alt=""
          className={`v-rest-bob relative h-full w-full object-contain drop-shadow-[0_6px_16px_oklch(0.85_0.01_250/0.35)] ${mood === "concerned" ? "v-mood-tilt" : ""}`}
        />
      </button>
    </div>
  );
}

export default VCompanion;
