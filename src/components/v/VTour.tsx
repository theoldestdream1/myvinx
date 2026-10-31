import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation, useNavigate } from '@/lib/router-compat';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { TOUR_EVENT, TOUR_STOPS, finishTour, tourSeen } from '@/lib/v/tour';
import { vAgent } from '@/lib/avatar/bus';
import vWave from '@/assets/v-wave.png';

export function VTour() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<number | null>(null);
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !user) { if (!loading) { checked.current = null; setStep(null); } return; }
    if (checked.current === user.id) return;
    checked.current = user.id;
    if (!tourSeen(user.id)) { setStep(0); navigate('/dashboard'); }
  }, [user, loading, navigate]);
  useEffect(() => {
    const start = () => { if (user) { setStep(0); navigate('/dashboard'); } };
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [user, navigate]);
  useEffect(() => {
    if (step === null) return;
    const stop = TOUR_STOPS[step];
    vAgent.emote('excited', 2500);
    const timer = window.setTimeout(() => document.querySelector(stop.target)?.classList.add('tour-highlight'), 350);
    return () => { clearTimeout(timer); document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight')); };
  }, [step, location.pathname]);
  if (step === null || !user) return null;
  const stop = TOUR_STOPS[step];
  const close = () => { finishTour(user.id); setStep(null); };
  const move = (next: number) => { setStep(next); navigate(TOUR_STOPS[next].path); };
  return <aside role="dialog" aria-label="V's welcome tour" aria-describedby="v-tour-description" className="tour-guide fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-xl rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-card sm:bottom-6">
    <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-3 items-start">
      <img src={vWave} alt="V welcomes you" className="h-28 w-16 object-contain" />
      <div className="min-w-0"><p className="text-xs text-muted-foreground mb-1">V’s tour · {step + 1} / {TOUR_STOPS.length}</p><h2 className="font-display text-2xl">{stop.title}</h2><p id="v-tour-description" className="mt-2 text-sm leading-relaxed">{stop.text}</p></div>
      <Button variant="ghost" size="icon" aria-label="Skip tour" title="Skip tour" onClick={close}><X /></Button>
    </div>
    <div className="mt-3 flex justify-between gap-2"><Button variant="ghost" onClick={close}>Skip tour</Button><div className="flex gap-2">{step > 0 && <Button variant="outline" onClick={() => move(step - 1)} aria-label="Previous tour stop"><ArrowLeft /></Button>}<Button onClick={() => step === TOUR_STOPS.length - 1 ? close() : move(step + 1)}>{step === TOUR_STOPS.length - 1 ? 'All settled' : 'Next'}<ArrowRight /></Button></div></div>
  </aside>;
}