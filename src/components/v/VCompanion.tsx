import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "@/lib/router-compat";
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
  const { pathname } = useLocation();
  // On Ask, the send button lives bottom-right, so V's seat moves to the bottom-left there.
  const home = pathname.startsWith("/query") ? 0 : 1;
  const [drag, setDrag] = useState<null | { dx: number; dy: number }>(null);
  const [lift, setLift] = useState(0); // where she was dropped vertically (px, negative = up)
  const dragRef = useRef<{ sx: number; sy: number; x0: number; lift0: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [phase, setPhase] = useState<Phase>("rest");
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [pose, setPose] = useState<Pose>("sit");
  const [busy, setBusy] = useState(false); // app-level thinking (e.g. answering a query)
  const [hidden, setHidden] = useState(false);
  const [side, setSide] = useState<"right" | "left">("left");
  const [act, setAct] = useState<null | "hop" | "look" | "poke" | "cheer" | "walk" | "wave" | "point" | "stretch">(null);
  const [spot, setSpot] = useState(1); // 1 = home seat (bottom right), 0 = left edge
  const [walkMs, setWalkMs] = useState(2000);
  const [tp, setTp] = useState(false); // teleporting home
  const [menuLine, setMenuLine] = useState("");
  const stayHomeUntil = useRef(0);
  const [rise, setRise] = useState(0); // drifts up off the floor now and then
  const [lean, setLean] = useState(0);
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? innerWidth : 400));
  const [voiceOn, setVoiceOn] = useState(() => loadPrefs().voice);
  const [enabled, setEnabled] = useState(() => loadPrefs().enabled);
  const [captions, setCaptions] = useState(() => loadPrefs().captions);
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
  const reduced = useReducedMotion();

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
      if (e.type === "say") { if (phaseRef.current === "rest") say(e.text, e.mood); }
      else if (e.type === "emote") { setPose(poseFor(e.mood)); clearTimeout(poseTimer.current); poseTimer.current = window.setTimeout(() => setPose("sit"), e.ms ?? 1800); }
      else if (e.type === "state") { setBusy(e.state !== "idle"); if (e.state === "thinking") setPose("think"); else if (e.state === "listening") setPose("listen"); else setPose("sit"); }
      else if (e.type === "tell" && enabled) void startTell();
      else if (e.type === "hide") setHidden(true);
      else if (e.type === "show") setHidden(false);
    });
    return () => { unsub(); clearTimeout(bubbleTimer.current); clearTimeout(poseTimer.current); };
  }, [say, startTell, enabled]);

  useEffect(() => subscribePrefs((p) => { setVoiceOn(p.voice); setEnabled(p.enabled); setCaptions(p.captions); if (!p.enabled) { vHush(); cancelTell(); } }), [cancelTell]);
  useEffect(() => {
    const h = (e: Event) => setP((e as CustomEvent<Personality>).detail);
    addEventListener(PERSONALITY_EVENT, h);
    return () => removeEventListener(PERSONALITY_EVENT, h);
  }, []);
  useEffect(() => {
    let frame = 0;
    const r = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; setVw(innerWidth); }); };
    addEventListener("resize", r);
    return () => { removeEventListener("resize", r); cancelAnimationFrame(frame); };
  }, []);

  // ---------- scroll: she leans into it ----------
  useEffect(() => {
    lastY.current = scrollY;
    let frame = 0;
    const onScroll = () => {
      lastActivity.current = Date.now();
      if (frame || reduced || !enabled) return;
      frame = requestAnimationFrame(() => {
      frame = 0;
      const dy = scrollY - lastY.current;
      lastY.current = scrollY;
      setLean(Math.max(-10, Math.min(10, dy * 0.6)));
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => setLean(0), 180);
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); clearTimeout(settle.current); };
  }, [reduced, enabled]);

  // ---------- idle life: drifts around, hops, looks around, the odd remark ----------
  useEffect(() => {
    if (reduced || !enabled || hidden) return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        const typing = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
        if (phaseRef.current === "rest" && !document.hidden && !typing && Date.now() - lastActivity.current > 1200) {
          const r = Math.random();
          const quietFor = Date.now() - lastActivity.current;
          if (quietFor > 25000 && Date.now() - lastQuip.current > 90000) {
            lastQuip.current = Date.now();
            const l = line("idle", getPersonality()); say(l.text, l.mood);
          } else if (r < 0.5 && Date.now() > stayHomeUntil.current) {
            // stroll somewhere new at a steady walking pace, facing where she's going
            setSpot((s) => {
              const n = s > 0.5 ? Math.random() * 0.4 : 0.6 + Math.random() * 0.4;
              const ms = Math.max(1800, Math.min(5000, (Math.abs(n - s) * innerWidth / 80) * 1000));
              setSide(n > s ? "right" : "left");
              setWalkMs(ms);
              setAct("walk"); window.setTimeout(() => setAct((a) => (a === "walk" ? null : a)), ms);
              return n;
            });
          } else if (r < 0.58) { setAct("wave"); setPose("wave"); window.setTimeout(() => { setAct(null); setPose((p) => (p === "wave" ? "sit" : p)); }, 1700); }
          else if (r < 0.68) { setAct("point"); setPose("happy"); window.setTimeout(() => { setAct(null); setPose((p) => (p === "happy" ? "sit" : p)); }, 1500); }
          else if (r < 0.76) { setAct("look"); window.setTimeout(() => setAct(null), 1600); }
          else if (r < 0.83) { setAct("hop"); window.setTimeout(() => setAct(null), 700); }
          else if (r < 0.89) { setAct("stretch"); setPose("think"); window.setTimeout(() => { setAct(null); setPose((p) => (p === "think" ? "sit" : p)); }, 1400); }
          else if (r < 0.95) { setRise(-30 - Math.random() * 60); window.setTimeout(() => setRise(0), 2600); }
          else { setPose("smug"); window.setTimeout(() => setPose((p) => (p === "smug" ? "sit" : p)), 1800); }
        }
        loop();
      }, 2800 + Math.random() * 3600);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduced, say, enabled, hidden]);

  // Changing page sends her to that page's seat (unless she was just dragged somewhere).
  useEffect(() => {
    setSpot(home); setLift(0);
  }, [home]);

  if (hidden || !enabled) return null;

  const focus = phase !== "rest" && phase !== "menu";
  const base = isMobile ? 88 : 116;
  const h = focus ? Math.min(260, base * 2.4) : bubble || phase === "menu" ? base * 1.3 : busy ? base * 1.15 : base;
  const w = h * ASPECT;
  const span = Math.max(1, vw - w - 24);
  const x = focus ? (vw - w) / 2 : 12 + spot * span + (drag?.dx ?? 0);
  const bottom = isMobile ? 92 : 20;
  const y = focus ? -Math.max(80, (typeof window !== "undefined" ? innerHeight : 700) * 0.18) : lift + (drag?.dy ?? 0) + (bubble || phase === "menu" || lift ? 0 : rise);
  const walkDir = side === "right" ? 1 : -1;
  const shownPose: Pose = phase === "listening" || phase === "prompting" ? "listen" : phase === "transcribing" || phase === "saving" ? "think" : act === "cheer" ? "happy" : act === "poke" ? "smug" : pose;

  const onDown = (e: PointerEvent<HTMLElement>) => {
    if (focus || phase === "listening") return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, x0: 12 + spot * span, lift0: lift, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    if (!d.moved) { d.moved = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setPhase("rest"); setBubble(null); setAct(null); }
    const maxUp = -(innerHeight - h - (isMobile ? 92 : 20) - 70);
    const ny = Math.min(0, Math.max(maxUp, d.lift0 + dy));
    setDrag({ dx, dy: ny - d.lift0 });
  };
  const onUp = () => {
    const d = dragRef.current; dragRef.current = null;
    if (!d?.moved || !drag) return;
    justDragged.current = true; window.setTimeout(() => { justDragged.current = false; }, 0);
    const nx = Math.min(1, Math.max(0, (d.x0 + drag.dx - 12) / span));
    setSpot(nx); setLift(d.lift0 + drag.dy); setDrag(null); setRise(0);
    stayHomeUntil.current = Date.now() + 120000; lastActivity.current = Date.now();
  };

  const tap = () => {
    if (justDragged.current) return;
    lastActivity.current = Date.now();
    if (phase === "listening") { rec.stopRecording(); return; }
    if (focus) return;
    if (bubble) { setBubble(null); return; }
    if (phase === "menu") { setPhase("rest"); return; }
    setAct("poke"); window.setTimeout(() => setAct(null), 500);
    setMenuLine(line("greet", getPersonality()).text);
    setPhase("menu");
  };
  const goHome = () => {
    lastActivity.current = Date.now();
    stayHomeUntil.current = Date.now() + 45000;
    setTp(true); setAct(null); setBubble(null); setPhase("rest"); setRise(0);
    window.setTimeout(() => {
      setSpot(home); setLift(0); setSide("left"); setPose("sit");
      window.setTimeout(() => { setTp(false); const l = line("home", getPersonality()); say(l.text, l.mood); }, 60);
    }, 220);
  };
  const go = (to: string) => {
    setPhase("rest");
    if (window.location.pathname === to) { window.dispatchEvent(new Event("vinx:focus-ask")); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); return; }
    navigate(to);
  };
  const toggleVoice = () => { const p = { ...loadPrefs(), voice: !voiceOn }; savePrefs(p); if (!p.voice) vHush(); };

  const status = phase === "prompting" ? "V is talking" : phase === "listening" ? "Listening · tap V to finish" : phase === "transcribing" ? "Catching every word…" : phase === "saving" ? "Saving…" : "";
  const bubbleAlign = focus ? "center" : spot > 0.5 ? "right" : "left";
  const awayFromHome = Math.abs(spot - home) > 0.08 || lift < -4;

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

      <AnimatePresence>
        {!focus && (awayFromHome || act === "walk") && !drag && !tp && (
          <motion.button
            key="home"
            type="button"
            onClick={goHome}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className={`fixed ${home === 0 ? "left-3" : "right-3"} z-50 flex items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground shadow-md backdrop-blur-md`}
            style={{ bottom: `calc(env(safe-area-inset-bottom) + ${bottom - 4}px)` }}
            aria-label="Tap to bring V back to her seat"
            data-testid="v-home"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" aria-hidden />Tap to return
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none fixed left-0 z-50"
        style={{ bottom: `calc(env(safe-area-inset-bottom) + ${bottom}px)` }}
        initial={false}
        animate={{ x, y, opacity: tp ? 0 : 1, scale: tp ? 0.5 : 1 }}
        transition={drag ? { x: { duration: 0 }, y: { duration: 0 } } : tp ? { x: { duration: 0 }, y: { duration: 0 }, opacity: { duration: 0.2 }, scale: { duration: 0.2 } } : act === "walk" ? { x: { duration: walkMs / 1000, ease: [0.45, 0, 0.35, 1] }, y: { type: "spring", stiffness: 40, damping: 12 }, opacity: { duration: 0.25 }, scale: { type: "spring", stiffness: 260, damping: 16 } } : { x: SPRING, y: { type: "spring", stiffness: 40, damping: 12 }, opacity: { duration: 0.25 }, scale: { type: "spring", stiffness: 260, damping: 16 } }}
        data-testid="v-companion"
        data-phase={phase}
      >
        {/* speech bubble / menu */}
        <AnimatePresence mode="popLayout">
          {((bubble && (captions || !voiceOn || focus || bubble.quote)) || phase === "menu") && (
            <motion.div
              key={bubble?.key ?? "menu"}
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="pointer-events-auto absolute bottom-full mb-2 w-[min(260px,80vw)] rounded-lg border border-border/70 bg-card px-3.5 py-2.5 text-sm leading-snug text-foreground shadow-card"
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
                    <p className="text-sm">{menuLine}</p>
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
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ touchAction: "none", cursor: drag ? "grabbing" : "grab" }}
          className="pointer-events-auto relative block"
          initial={false}
          animate={{
            width: w, height: h,
            rotate: act === "walk" ? lean + walkDir * 7 : act === "wave" ? [0, -7, 6, -5, 4, 0] : act === "point" ? -9 : lean + (act === "look" ? -6 : 0),
            y: act === "hop" ? [0, -26, 0, -6, 0] : act === "cheer" ? [0, -34, 0] : act === "walk" ? [-10, -18, -10] : act === "stretch" ? [0, -8, 0] : act === "point" ? -6 : 0,
            scaleX: act === "look" ? [1, -1, -1, 1] : act === "poke" ? [1, 1.12, 0.95, 1] : act === "walk" ? walkDir : act === "point" ? -1 : 1,
            scaleY: act === "poke" ? [1, 0.86, 1.06, 1] : act === "stretch" ? [1, 1.09, 0.97, 1] : 1,
          }}
          transition={{
            width: SPRING, height: SPRING,
            rotate: act === "wave" ? { duration: 1.5, ease: "easeInOut" } : { type: "spring", stiffness: 70, damping: 12 },
            y: act === "walk" ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : act === "stretch" ? { duration: 1.3, ease: "easeInOut" } : { duration: act === "cheer" ? 0.7 : 0.65, ease: "easeInOut" },
            scaleX: { duration: act === "look" ? 1.5 : 0.35, ease: "easeInOut" },
            scaleY: { duration: act === "stretch" ? 1.3 : 0.45, ease: "easeInOut" },
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
