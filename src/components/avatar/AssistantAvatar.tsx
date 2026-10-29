import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Captions, ChevronDown, EyeOff, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_PALETTE, FigureRenderer, bindFigure, figureMarkup } from '@/lib/avatar/figure';
import { Rig } from '@/lib/avatar/rig';
import { Speaker, type SpeechHandle } from '@/lib/avatar/speech';
import { subscribe, type AvatarEvent, type Mood, type Priority } from '@/lib/avatar/bus';
import { dayKey, loadPrefs, savePrefs, subscribePrefs, type AvatarPrefs } from '@/lib/avatar/prefs';
import { introLines, lines, type Line } from '@/lib/avatar/scripts';
import './avatar.css';

const RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2 };
const IDLE_FRAME_MS = 32; // ~30 fps while nothing is being said: blinking and breathing don't need more

interface Current { handle: SpeechHandle; priority: Priority; text: string; shown: number }
interface BubbleState { key: number; text: string; dots?: boolean; offerVoice?: boolean; skippable?: boolean }

export default function AssistantAvatar() {
  const { user } = useAuth();
  const name = (user?.user_metadata?.display_name ?? user?.user_metadata?.full_name ?? null) as string | null;

  const [prefs, setPrefsState] = useState<AvatarPrefs>(() => loadPrefs());
  const prefsRef = useRef(prefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);

  const stageRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef<HTMLSpanElement>(null);
  const restRef = useRef<HTMLSpanElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const currentRef = useRef<Current | null>(null);
  const queueRef = useRef<{ line: Line; priority: Priority }[]>([]);
  const baseMoodRef = useRef<Mood>('neutral');
  const bubbleTimer = useRef<number | undefined>(undefined);
  const keyRef = useRef(0);
  const introToken = useRef(0);
  const introIndex = useRef(0);
  const minimizedRef = useRef(prefs.minimized);

  const updatePrefs = useCallback((patch: Partial<AvatarPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefsState(next);
    minimizedRef.current = next.minimized;
    savePrefs(next);
  }, []);

  // ---- speaking ------------------------------------------------------------------------------
  const clearBubbleTimer = () => { if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current); bubbleTimer.current = undefined; };

  const finishLine = useCallback(() => {
    const cur = currentRef.current;
    if (!cur) return;
    currentRef.current = null;
    rigRef.current?.stopSpeaking();
    rigRef.current?.setExpression(baseMoodRef.current);
    const next = queueRef.current.shift();
    if (next) { startLine(next.line, next.priority); return; }
    // keep the words on screen long enough to read
    const linger = Math.min(1600 + cur.text.length * 22, 5200);
    clearBubbleTimer();
    bubbleTimer.current = window.setTimeout(() => setBubble((b) => (b && !b.dots ? null : b)), linger);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLine = useCallback((line: Line, priority: Priority, extra?: Partial<BubbleState>): SpeechHandle | null => {
    const rig = rigRef.current, speaker = speakerRef.current;
    if (!rig || !speaker) return null;
    clearBubbleTimer();
    const handle = speaker.speak(line.text, { voice: prefsRef.current.voice });
    currentRef.current = { handle, priority, text: handle.timeline.text, shown: 0 };
    baseMoodRef.current = 'neutral';
    rig.setExpression(line.mood ?? 'neutral');
    rig.startSpeaking(handle.cursor, handle.clock, handle.voiceActive);
    setBubble({ key: ++keyRef.current, text: handle.timeline.text, ...extra });
    return handle;
  }, []);

  const stopAll = useCallback(() => {
    introToken.current++;
    queueRef.current = [];
    speakerRef.current?.cancel();
    currentRef.current = null;
    rigRef.current?.stopSpeaking();
    rigRef.current?.setExpression('neutral');
    baseMoodRef.current = 'neutral';
    clearBubbleTimer();
    setBubble(null);
  }, []);

  // ---- introduction ----------------------------------------------------------------------------
  const runIntro = useCallback(async (fromIndex = 0) => {
    const token = ++introToken.current;
    const script = introLines(name);
    for (let i = fromIndex; i < script.length; i++) {
      if (token !== introToken.current) return;
      introIndex.current = i;
      const first = i === fromIndex;
      const handle = startLine(script[i], 'normal', {
        skippable: true,
        offerVoice: first && !prefsRef.current.voice && !!speakerRef.current?.canSpeakAloud,
      });
      if (!handle) return;
      await handle.done;
      if (token !== introToken.current) return;
      await new Promise((r) => window.setTimeout(r, 420));
    }
    if (token === introToken.current) {
      introToken.current++;
      setBubble((b) => (b?.skippable ? null : b));
    }
  }, [name, startLine]);

  const bubbleHasSkip = useRef(false);
  useEffect(() => { bubbleHasSkip.current = !!bubble?.skippable; }, [bubble]);

  const handleSay = useCallback((e: Extract<AvatarEvent, { type: 'say' }>) => {
    const p = prefsRef.current;
    if (!p.enabled || p.minimized) return;
    const priority = e.priority ?? 'normal';
    const line: Line = { text: e.text, mood: e.mood ?? 'neutral' };
    const busy = !!currentRef.current;
    const introActive = introToken.current > 0 && bubbleHasSkip.current;
    if (e.id === 'greeting') {
      const today = dayKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (p.lastGreetingDay === today || busy || introActive || !p.introSeen) return;
      updatePrefs({ lastGreetingDay: today });
    } else if (priority === 'low' && (busy || introActive)) {
      return;
    }
    const cur = currentRef.current;
    if (cur && RANK[priority] < RANK[cur.priority]) {
      if (queueRef.current.length < 2) queueRef.current.push({ line, priority });
      return;
    }
    if (introActive) introToken.current++; // a real event outranks the tour
    startLine(line, priority);
  }, [startLine, updatePrefs]);

  // ---- mount: figure, rig, frame loop -------------------------------------------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.innerHTML = figureMarkup(DEFAULT_PALETTE, 'mm');
    const svg = stage.querySelector('svg')!;
    const renderer = new FigureRenderer(bindFigure(svg));
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const rig = new Rig({ reducedMotion: !!mq?.matches });
    const speaker = new Speaker();
    rigRef.current = rig;
    speakerRef.current = speaker;
    setCanSpeak(speaker.canSpeakAloud);
    const onMq = () => { rig.reducedMotion = !!mq?.matches; };
    mq?.addEventListener?.('change', onMq);

    let raf = 0;
    let last = performance.now();
    renderer.apply(rig.update(0, last));

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || minimizedRef.current) { last = t; return; }
      const speaking = rig.speaking || !!currentRef.current;
      if (!speaking && t - last < IDLE_FRAME_MS) return;
      const dt = (t - last) / 1000;
      last = t;

      const cur = currentRef.current;
      if (cur) {
        const clock = cur.handle.clock();
        if (clock >= 0) {
          const n = cur.handle.cursor.revealChars(clock);
          if (n !== cur.shown && shownRef.current && restRef.current) {
            cur.shown = n;
            shownRef.current.textContent = cur.text.slice(0, n);
            restRef.current.textContent = cur.text.slice(n);
          }
        }
        if (cur.handle.isDone()) {
          if (shownRef.current && restRef.current) { shownRef.current.textContent = cur.text; restRef.current.textContent = ''; }
          finishLine();
        }
      }
      renderer.apply(rig.update(dt, t));
    };
    raf = requestAnimationFrame(tick);

    // eyes follow the pointer a little (mouse only)
    let lastLook = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - lastLook < 90) return;
      lastLook = now;
      const r = stage.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.38;
      rig.lookAt((e.clientX - cx) / (window.innerWidth * 0.5), (e.clientY - cy) / (window.innerHeight * 0.5));
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const onVis = () => { if (document.hidden) speaker.cancel(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener?.('change', onMq);
      speaker.cancel();
      introToken.current++; // eslint-disable-line react-hooks/exhaustive-deps
      clearBubbleTimer();
      rigRef.current = null;
      speakerRef.current = null;
      currentRef.current = null;
    };
  }, [finishLine]);

  // fill caption text for each new line (kept out of React state so the reveal doesn't re-render per word)
  useLayoutEffect(() => {
    if (!bubble || bubble.dots) return;
    if (shownRef.current && restRef.current) {
      const cur = currentRef.current;
      shownRef.current.textContent = cur ? cur.text.slice(0, cur.shown) : bubble.text;
      restRef.current.textContent = cur ? cur.text.slice(cur.shown) : '';
    }
  }, [bubble?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- app events + preference changes -------------------------------------------------------------
  useEffect(() => {
    const off = subscribe((e) => {
      const rig = rigRef.current;
      if (!rig) return;
      switch (e.type) {
        case 'say': handleSay(e); break;
        case 'emote': rig.flash(e.mood, e.ms ?? 1600); break;
        case 'state':
          if (e.state === 'thinking') {
            baseMoodRef.current = 'thinking'; rig.setExpression('thinking');
            if (!currentRef.current && !prefsRef.current.minimized) { clearBubbleTimer(); setBubble({ key: ++keyRef.current, text: '', dots: true }); }
          } else if (e.state === 'listening') {
            baseMoodRef.current = 'listening'; rig.setExpression('listening');
          } else {
            baseMoodRef.current = 'neutral';
            if (!currentRef.current) { rig.setExpression('neutral'); setBubble((b) => (b?.dots ? null : b)); }
          }
          break;
        case 'hide': updatePrefs({ minimized: true }); stopAll(); break;
        case 'show': updatePrefs({ minimized: false, enabled: true }); break;
      }
    });
    const offPrefs = subscribePrefs((p) => { prefsRef.current = p; setPrefsState(p); minimizedRef.current = p.minimized; });
    return () => { off(); offPrefs(); };
  }, [handleSay, stopAll, updatePrefs]);

  // ---- first-visit introduction ---------------------------------------------------------------------
  useEffect(() => {
    if (prefsRef.current.introSeen || prefsRef.current.minimized) return;
    const t = window.setTimeout(() => {
      if (!rigRef.current) return;
      updatePrefs({ introSeen: true });
      rigRef.current.flash('happy', 900);
      void runIntro(0);
    }, 900); // let the pop-in land first
    return () => window.clearTimeout(t);
  }, [runIntro, updatePrefs]);

  // Escape closes the menu
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [menuOpen]);

  // ---- UI actions -------------------------------------------------------------------------------------
  const toggleVoice = () => {
    const on = !prefs.voice;
    updatePrefs({ voice: on });
    setMenuOpen(false);
    if (on) { // this click is the user gesture browsers require before they allow speech
      const l = lines.voiceOn();
      window.setTimeout(() => startLine(l, 'high'), 0);
    } else {
      speakerRef.current?.cancel();
    }
  };
  const enableVoiceFromIntro = () => {
    updatePrefs({ voice: true });
    void runIntro(introIndex.current); // restart this line, now with sound (the click allows audio)
  };
  const skipIntro = () => { stopAll(); rigRef.current?.flash('happy', 700); };

  const showCaptions = prefs.captions || !prefs.voice;

  return (
    <>
    {prefs.minimized && (
      <div className="mm-root">
        <button className="mm-orb" aria-label="Wake V" onClick={() => { updatePrefs({ minimized: false }); rigRef.current?.flash('happy', 900); }} />
      </div>
    )}
    <div className="mm-root" data-testid="v-avatar" hidden={prefs.minimized}>
      {bubble && (showCaptions || bubble.dots) && (
        <div className="mm-bubble" key={bubble.key} role="status" aria-live="polite" onClick={() => { if (!bubble.skippable) stopAll(); }}>
          {bubble.dots ? (
            <span className="mm-dots" aria-label="Thinking"><i /><i /><i /></span>
          ) : (
            <>
              <span ref={shownRef} />
              <span ref={restRef} className="mm-rest" aria-hidden="true" />
            </>
          )}
          {(bubble.skippable || bubble.offerVoice) && (
            <div className="mm-actions">
              {bubble.offerVoice && <button className="mm-chip mm-primary" onClick={(e) => { e.stopPropagation(); enableVoiceFromIntro(); }}>Hear me out loud</button>}
              {bubble.skippable && <button className="mm-chip" onClick={(e) => { e.stopPropagation(); skipIntro(); }}>Skip</button>}
            </div>
          )}
        </div>
      )}

      {menuOpen && (
        <div className="mm-menu" role="menu" aria-label="V settings">
          <button role="menuitem" onClick={toggleVoice} disabled={!canSpeak && !prefs.voice}>
            {prefs.voice ? <Volume2 size={16} /> : <VolumeX size={16} />} Voice
            <span className="mm-on">{canSpeak ? (prefs.voice ? 'On' : 'Off') : 'Unavailable'}</span>
          </button>
          <button role="menuitem" onClick={() => updatePrefs({ captions: !prefs.captions })} disabled={!prefs.voice}>
            <Captions size={16} /> Captions <span className="mm-on">{showCaptions ? 'On' : 'Off'}</span>
          </button>
          <button role="menuitem" onClick={() => { setMenuOpen(false); void runIntro(0); }}>
            <RotateCcw size={16} /> Replay introduction
          </button>
          <button role="menuitem" onClick={() => { setMenuOpen(false); stopAll(); updatePrefs({ minimized: true }); }}>
            <ChevronDown size={16} /> Minimize
          </button>
          <button role="menuitem" onClick={() => { setMenuOpen(false); stopAll(); updatePrefs({ enabled: false }); }}>
            <EyeOff size={16} /> Hide V (turn back on in Settings)
          </button>
        </div>
      )}

      <div className="mm-pop">
        <button
          className="mm-stage"
          aria-label="V, your assistant. Open menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen((o) => !o); rigRef.current?.flash('curious', 1100); }}
        >
          <span ref={stageRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </button>
      </div>
    </div>
    </>
  );
}
