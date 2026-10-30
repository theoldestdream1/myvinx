import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import { subscribe, type AvatarEvent, type Mood } from "@/lib/avatar/bus";
import { loadPrefs, savePrefs, subscribePrefs } from "@/lib/avatar/prefs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { useCaptureMemory } from "@/hooks/useCaptureMemory";
import { line, getPersonality, PERSONALITY_EVENT, type Personality } from "@/lib/v/personality";
import { vSpeak, vHush } from "@/lib/v/voice";
import vSit from "@/assets/v-sit.png";
import vWave from "@/assets/v-wave.png";
import vHappy from "@/assets/v-happy.png";
import vThink from "@/assets/v-think.png";
import vListen from "@/assets/v-listen.png";
import vSmug from "@/assets/v-smug.png";
import { Mic, Search, Bell, X, Check, Volume2, VolumeX } from "lucide-react";

type Phase = "rest" | "menu" | "prompting" | "listening" | "transcribing" | "saving";
type Pose = "sit" | "wave" | "happy" | "think" | "listen" | "smug";
interface Bubble { text: string; key: number; quote?: boolean }

const POSES: Record<Pose, string> = { sit: vSit, wave: vWave, happy: vHappy, think: vThink, listen: vListen, smug: vSmug };
const ASPECT = 0.55;

function poseFor(mood: Mood | undefined): Pose {
  switch (mood) {
    case "happy": return "happy";
    case "excited": return "wave";
    case "thinking": case "focused": case "concerned": return "think";
    case "listening": case "curious": case "surprised": return "listen";
    case "sassy": return "smug";
    default: return "sit";
  }
}

const SPRING = { type: "spring" as const, stiffness: 170, damping: 20, mass: 0.9 };

/** V lives on every app screen: idles, wanders between corners, reacts, and takes voice notes in place. */
export function VCompanion() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("rest");
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [pose, setPose] = useState<Pose>("sit");
  const [busy, setBusy] = useState(false); // app-level thinking (e.g. answering a query)
  const [hidden, setHidden] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  const [act, setAct] = useState<null | "hop" | "look" | "poke" | "cheer" | "walk">(null);
  const [spot, setSpot] = useState(1); // 0 = left edge, 1 = right edge
  const [rise, setRise] = useState(0); // drifts up off the floor now and then
  const [lean, setLean] = useState(0);
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? innerWidth : 400));
  const [voiceOn, setVoiceOn] = useState(() => loadPrefs().voice);
  const [personality, setP] = useState<Personality>(() => getPersonality());
  const level = useMotionValue(0);
  const levelSmooth = useSpring(level, { stiffness: 300, damping: 25 });
  const ring1 = useTransform(levelSmooth, [0, 1], [1, 1.55]);
  const ring2 = useTransform(levelSmooth, [0, 1], [1, 1.9]);
  const ringOpacity = useTransform(levelSmooth, [0, 1], [0.35, 0.9]);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const poseTimer = useRef<number | undefined>(undefined);
  const lastY = useRef(0);
  const settle = useRef<number | undefined>(undefined);
  const lastActivity = useRef(Date.now());
  const lastQuip = useRef(Date.now());
  const phaseRef = useRef(phase); phaseRef.current = phase;
  // V is the product: her idle life stays on even when the phone asks for fewer animations.
  const reduced = false;

  const say = useCallback((text: string, mood?: Mood, opts: { quote?: boolean; hold?: number } = {}) => {
    setBubble({ text, key: Date.now(), quote: opts.quote });
    if (mood) setPose(poseFor(mood));
    clearTimeout(bubbleTimer.current);
    clearTimeout(poseTimer.current);
    const ms = opts.hold ?? Math.min(9000, 2600 + text.length * 45);
    if (ms > 0) {
      bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
      poseTimer.current = window.setTimeout(() => setPose("sit"), ms + 200);
    }
  }, []);

  // ---------- voice capture in place ----------
  const capture = useCaptureMemory(undefined, { silent: true });

  const finish = useCallback((text: string, mood: Mood, cheer = false) => {
    setPhase("rest");
    say(text, mood);
    if (cheer) { setAct("cheer"); window.setTimeout(() => setAct(null), 900); }
    void vSpeak(text);
  }, [say]);

  const rec = useVoiceRecording({
    maxDuration: 60,
    silenceStopMs: 2200,
    onLevel: (l) => level.set(l),
    onTranscription: async (text) => {
      setPhase("saving");
      say(text, "thinking", { quote: true, hold: 0 });
      try {
        const res = await capture.mutateAsync({ content: text, source: "voice" });
        if ("queued" in res) finish("No signal. I kept it on this phone and I'll save it when you're back online.", "concerned");
        else { const l = line("saved", personality); finish(l.text, l.mood, true); }
      } catch {
        const l = line("error", personality); finish(l.text, l.mood);
      }
    },
    onError: (err) => {
      if (/microphone/i.test(err)) finish("I can't hear you. Allow the microphone for this site, then tap me again.", "concerned");
      else { const l = line("nothingHeard", personality); finish(l.text, l.mood); }
    },
  });

  useEffect(() => { if (rec.isProcessing) setPhase("transcribing"); }, [rec.isProcessing]);
  useEffect(() => { if (rec.isRecording) setPhase("listening"); }, [rec.isRecording]);

  const startTell = useCallback(async () => {
    if (phaseRef.current !== "rest" && phaseRef.current !== "menu") return;
    setPhase("prompting");
    const l = line("listen", getPersonality());
    say(l.text, "listening", { hold: 0 });
    await vSpeak(l.text);
    if ((phaseRef.current as Phase) !== "prompting") return; // cancelled while she spoke
    await rec.startRecording();
  }, [rec, say]);

  const cancelTell = useCallback(() => {
    vHush();
    if (rec.isRecording) rec.cancelRecording();
    setPhase("rest");
    setBubble(null);
    setPose("sit");
  }, [rec]);

  // ---------- events from the rest of the app ----------
  useEffect(() => {
    const unsub = subscribe((e: AvatarEvent) => {
      lastActivity.current = Date.now();
      if (e.type === "say") { if (phaseRef.current === "rest" || phaseRef.current === "menu") { setPhase("rest"); say(e.text, e.mood); } }
      else if (e.type === "emote") { setPose(poseFor(e.mood)); clearTimeout(poseTimer.current); poseTimer.current = window.setTimeout(() => setPose("sit"), e.ms ?? 1800); }
      else if (e.type === "state") { setBusy(e.state !== "idle"); if (e.state === "thinking") setPose("think"); else if (e.state === "listening") setPose("listen"); else setPose("sit"); }
      else if (e.type === "tell") void startTell();
      else if (e.type === "hide") setHidden(true);
      else if (e.type === "show") setHidden(false);
    });
    return () => { unsub(); clearTimeout(bubbleTimer.current); clearTimeout(poseTimer.current); };
  }, [say, startTell]);

  useEffect(() => subscribePrefs((p) => setVoiceOn(p.voice)), []);
  useEffect(() => {
    const h = (e: Event) => setP((e as CustomEvent<Personality>).detail);
    addEventListener(PERSONALITY_EVENT, h);
    return () => removeEventListener(PERSONALITY_EVENT, h);
  }, []);
  useEffect(() => {
    const r = () => setVw(innerWidth);
    addEventListener("resize", r);
    return () => removeEventListener("resize", r);
  }, []);

  // ---------- scroll: she leans into it ----------
  useEffect(() => {
    lastY.current = scrollY;
    const onScroll = () => {
      lastActivity.current = Date.now();
      const dy = scrollY - lastY.current;
      lastY.current = scrollY;
      setLean(Math.max(-10, Math.min(10, dy * 0.6)));
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => setLean(0), 180);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); clearTimeout(settle.current); };
  }, []);

  // ---------- idle life: drifts around, hops, looks around, the odd remark ----------
  useEffect(() => {
    if (reduced) return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        if (phaseRef.current === "rest" && !document.hidden) {
          const r = Math.random();
          const quietFor = Date.now() - lastActivity.current;
          if (quietFor > 25000 && Date.now() - lastQuip.current > 90000) {
            lastQuip.current = Date.now();
            const l = line("idle", getPersonality()); say(l.text, l.mood);
          } else if (r < 0.5) {
            // glide somewhere new, staying near the edges so she doesn't cover content
            setSpot((s) => {
              const n = s > 0.5 ? Math.random() * 0.35 : 0.65 + Math.random() * 0.35;
              setSide(n > 0.5 ? "right" : "left");
              return n;
            });
            setAct("walk"); window.setTimeout(() => setAct(null), 2200);
          } else if (r < 0.65) { setAct("look"); window.setTimeout(() => setAct(null), 1600); }
          else if (r < 0.8) { setAct("hop"); window.setTimeout(() => setAct(null), 700); }
          else if (r < 0.9) { setRise(-30 - Math.random() * 60); window.setTimeout(() => setRise(0), 2600); }
          else { setPose("smug"); window.setTimeout(() => setPose((p) => (p === "smug" ? "sit" : p)), 1800); }
        }
        loop();
      }, 3500 + Math.random() * 4500);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduced, say]);

  if (hidden) return null;

  const focus = phase !== "rest" && phase !== "menu";
  const base = isMobile ? 88 : 116;
  const h = focus ? Math.min(260, base * 2.4) : bubble || phase === "menu" ? base * 1.3 : busy ? base * 1.15 : base;
  const w = h * ASPECT;
  const x = focus ? (vw - w) / 2 : 12 + spot * Math.max(0, vw - w - 24);
  const bottom = isMobile ? 92 : 20;
  const y = focus ? -Math.max(80, (typeof window !== "undefined" ? innerHeight : 700) * 0.18) : bubble || phase === "menu" ? 0 : rise;
  const walkDir = side === "right" ? 1 : -1;
  const shownPose: Pose = phase === "listening" || phase === "prompting" ? "listen" : phase === "transcribing" || phase === "saving" ? "think" : act === "cheer" ? "happy" : act === "poke" ? "smug" : pose;

  const tap = () => {
    lastActivity.current = Date.now();
    if (phase === "listening") { rec.stopRecording(); return; }
    if (focus) return;
    if (bubble) { setBubble(null); return; }
    if (phase === "menu") { setPhase("rest"); return; }
    setAct("poke"); window.setTimeout(() => setAct(null), 500);
    setPhase("menu");
  };
  const go = (to: string) => { setPhase("rest"); navigate(to); };
  const toggleVoice = () => { const p = { ...loadPrefs(), voice: !voiceOn }; savePrefs(p); if (!p.voice) vHush(); };

  const status = phase === "prompting" ? "V is talking" : phase === "listening" ? "Listening · tap V to finish" : phase === "transcribing" ? "Catching every word…" : phase === "saving" ? "Saving…" : "";
  const bubbleAlign = focus ? "center" : side;

  return (
    <>
      <AnimatePresence>
        {focus && (
          <motion.div
            key="dim"
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={phase === "listening" ? undefined : cancelTell}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none fixed left-0 z-50"
        style={{ bottom: `calc(env(safe-area-inset-bottom) + ${bottom}px)` }}
        initial={false}
        animate={{ x, y }}
        transition={act === "walk" ? { x: { type: "spring", stiffness: 28, damping: 11, mass: 1.2 }, y: { type: "spring", stiffness: 40, damping: 12 } } : { x: SPRING, y: { type: "spring", stiffness: 40, damping: 12 } }}
        data-testid="v-companion"
        data-phase={phase}
      >
        {/* speech bubble / menu */}
        <AnimatePresence mode="popLayout">
          {(bubble || phase === "menu") && (
            <motion.div
              key={bubble?.key ?? "menu"}
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="pointer-events-auto absolute bottom-full mb-2 w-[min(260px,80vw)] rounded-2xl border border-border/70 bg-card/95 px-3.5 py-2.5 text-sm leading-snug text-foreground shadow-xl backdrop-blur-md"
              style={{
                ...(bubbleAlign === "right" ? { right: 0 } : bubbleAlign === "left" ? { left: 0 } : { left: "50%", translateX: "-50%" }),
                transformOrigin: bubbleAlign === "right" ? "bottom right" : bubbleAlign === "left" ? "bottom left" : "bottom center",
              }}
              role="status"
              aria-live="polite"
            >
              {bubble ? (
                <p className={bubble.quote ? "font-serif italic text-muted-foreground" : ""}>{bubble.quote ? `“${bubble.text}”` : bubble.text}</p>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{line("greet", personality, () => 0).text}</p>
                    <div className="flex gap-1">
                      <button aria-label={voiceOn ? "Mute V" : "Let V speak"} onClick={toggleVoice} className="text-muted-foreground">{voiceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}</button>
                      <button aria-label="Close" onClick={() => setPhase("rest")} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => void startTell()} className="flex flex-1 items-center justify-center gap-1 rounded-full bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground"><Mic className="h-3.5 w-3.5" />Tell V</button>
                    <button onClick={() => go("/query")} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-border px-2 py-1.5 text-xs"><Search className="h-3.5 w-3.5" />Ask</button>
                    <button onClick={() => go("/intents")} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-border px-2 py-1.5 text-xs"><Bell className="h-3.5 w-3.5" />Remind</button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* V herself */}
        <motion.button
          type="button"
          aria-label={phase === "listening" ? "Stop and save" : "V, your companion. Tap her."}
          onClick={tap}
          className="pointer-events-auto relative block"
          initial={false}
          animate={{
            width: w, height: h,
            rotate: lean + (act === "look" ? -6 : act === "walk" ? walkDir * 9 : 0),
            y: act === "hop" ? [0, -26, 0, -6, 0] : act === "cheer" ? [0, -34, 0] : act === "walk" ? [0, -10, 0, -10, 0, -8, 0] : 0,
            scaleX: act === "look" ? [1, -1, -1, 1] : act === "poke" ? [1, 1.12, 0.95, 1] : 1,
            scaleY: act === "poke" ? [1, 0.86, 1.06, 1] : 1,
          }}
          transition={{
            width: SPRING, height: SPRING, rotate: { type: "spring", stiffness: 90, damping: 14 },
            y: { duration: act === "cheer" ? 0.7 : act === "walk" ? 1.9 : 0.65, ease: "easeInOut" },
            scaleX: { duration: act === "look" ? 1.5 : 0.45 },
            scaleY: { duration: 0.45 },
          }}
          whileTap={{ scale: 0.92 }}
        >
          {/* listening rings react to the voice */}
          {phase === "listening" && (
            <>
              <motion.span aria-hidden className="v-ring" style={{ scale: ring1, opacity: ringOpacity }} />
              <motion.span aria-hidden className="v-ring v-ring-2" style={{ scale: ring2, opacity: ringOpacity }} />
            </>
          )}
          {(busy || phase === "transcribing" || phase === "saving" || phase === "prompting") && <span className="v-aura v-aura-thinking" aria-hidden />}
          <span aria-hidden className="v-ground" />
          <span className={`v-life ${reduced ? "" : "v-life-on"} ${bubble || phase === "prompting" ? "v-talk" : ""}`}>
            <AnimatePresence initial={false}>
              <motion.img
                key={shownPose}
                src={POSES[shownPose]}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_8px_18px_oklch(0.88_0.01_250/0.35)]"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.04 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              />
            </AnimatePresence>
            {!reduced && <span aria-hidden className="v-glint" style={{ WebkitMaskImage: `url(${POSES[shownPose]})`, maskImage: `url(${POSES[shownPose]})` }} />}
          </span>
        </motion.button>

        {/* focus-mode controls */}
        <AnimatePresence>
          {focus && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="pointer-events-auto absolute left-1/2 top-full mt-4 flex w-64 -translate-x-1/2 flex-col items-center gap-3"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{status}{phase === "listening" ? ` · ${rec.duration}s` : ""}</p>
              {phase === "listening" && (
                <LevelBars level={levelSmooth} />
              )}
              <div className="flex gap-2">
                <button onClick={cancelTell} className="flex items-center gap-1 rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-muted-foreground"><X className="h-4 w-4" />Cancel</button>
                {phase === "listening" && (
                  <button onClick={() => rec.stopRecording()} className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Check className="h-4 w-4" />Done</button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

function Bar({ level, m }: { level: ReturnType<typeof useSpring>; m: number }) {
  const height = useTransform(level, (l) => `${Math.max(4, Math.min(24, 4 + l * 40 * m))}px`);
  return <motion.span className="w-1.5 rounded-full bg-foreground/80" style={{ height }} />;
}
function LevelBars({ level }: { level: ReturnType<typeof useSpring> }) {
  return (
    <div className="flex h-6 items-end gap-1" aria-hidden>
      {[0.6, 1, 0.8, 1, 0.6].map((m, i) => <Bar key={i} level={level} m={m} />)}
    </div>
  );
}

export default VCompanion;
