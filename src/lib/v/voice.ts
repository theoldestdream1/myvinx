import { loadPrefs } from '@/lib/avatar/prefs';

/** V says a line out loud (if allowed). Resolves when finished, or after a safety timeout. */
export function vSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    if (!synth || !loadPrefs().voice) { resolve(); return; }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const v = voices.find((x) => /en/i.test(x.lang) && /female|samantha|google uk english female|zira|aria|jenny/i.test(x.name))
        ?? voices.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.rate = 1.05; u.pitch = 1.15;
      const done = () => { clearTimeout(t); resolve(); };
      const t = window.setTimeout(done, 1500 + text.length * 90);
      u.onend = done; u.onerror = done;
      synth.speak(u);
    } catch { resolve(); }
  });
}

export function vHush() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
