import { useEffect } from 'react';
import { useNavigate, Link } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Network, Bell, Search, Layers, ArrowUpRight, Sparkles } from 'lucide-react';
import vWave from '@/assets/v-wave.png';

const features = [
  { icon: Layers, tag: 'Capture', title: 'Structured memories', description: 'Notes, voice and screenshots become searchable memories with people, places and dates.' },
  { icon: Network, tag: 'Connect', title: 'Connected context', description: 'See how the people, places and topics in your life relate.' },
  { icon: Bell, tag: 'Surface', title: 'Right-moment reminders', description: 'Intentions surface when they matter, not on a fixed alarm.' },
  { icon: Search, tag: 'Recall', title: 'Find it by describing it', description: '“That pricing screenshot from last month.” Search by meaning, not keywords, with the source shown.' },
];

const stats = [
  { dot: 'bg-primary', label: 'Saves in seconds' },
  { dot: 'bg-memory-processed', label: 'Search by meaning' },
  { dot: 'bg-entity-person', label: 'Reminders that land' },
];

function GemMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <div className={`${className} relative flex items-center justify-center`}>
      <div className="absolute inset-0 rotate-45 rounded-[28%] bg-gradient-to-br from-primary via-primary/40 to-transparent opacity-90" />
      <div className="absolute inset-[2px] rotate-45 rounded-[26%] bg-background/80" />
      <span className="relative font-display italic text-primary text-sm leading-none translate-y-px">V</span>
    </div>
  );
}

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 aurora" />
      <div className="pointer-events-none absolute inset-0 v-grain" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <GemMark />
          <span className="text-lg font-semibold tracking-tight">
            <span className="font-display italic text-xl">V</span>inx
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#how" className="text-sm text-muted-foreground transition-colors hover:text-foreground">How it works</a>
          <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">The system</a>
        </nav>
        <Button asChild size="sm" className="rounded-full bg-foreground text-background hover:bg-foreground/90">
          <Link to="/auth">
            Open the app <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pt-14 pb-24 lg:grid-cols-2 lg:pt-20">
        <div>
          <p className="eyebrow mb-6 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            A personal memory OS · 2026
          </p>
          <h1 className="font-display text-6xl leading-[1.02] tracking-tight sm:text-7xl lg:text-[5.25rem]">
            Remember what{' '}
            <span className="serif-accent">actually</span>
            <br />
            <span className="serif-accent">matters.</span>
          </h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-muted-foreground">
            Save notes, voice memos and screenshots in seconds. Later, describe what you
            remember — even vaguely — and V finds it.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="rounded-full bg-primary px-7 text-primary-foreground shadow-[0_0_36px_-8px] shadow-primary/50 hover:bg-primary/90">
              <Link to="/auth">Start remembering</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="rounded-full text-muted-foreground hover:text-foreground">
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <div className="mt-14 flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((s) => (
              <span key={s.label} className="eyebrow flex items-center gap-2">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* V, floating */}
        <div className="relative mx-auto flex w-full max-w-sm items-center justify-center lg:max-w-none">
          <div className="absolute h-[420px] w-[420px] rounded-full bg-primary/15 blur-[110px]" />
          <img
            src={vWave}
            alt="V, your memory companion"
            className="relative w-72 animate-float drop-shadow-[0_0_60px_oklch(0.78_0.115_240/0.35)] sm:w-80 lg:w-96"
            draggable={false}
          />
          <div className="card-ghost absolute -left-2 top-10 hidden items-center gap-2 px-3.5 py-2.5 sm:flex lg:-left-6">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Found: that pricing screenshot</span>
          </div>
          <div className="card-ghost absolute -right-2 bottom-16 hidden items-center gap-2 px-3.5 py-2.5 sm:flex lg:-right-4">
            <Bell className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Call Mum — Sunday, 6pm</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <p id="how" className="eyebrow mb-4">How it works</p>
        <h2 className="font-display text-4xl tracking-tight sm:text-5xl">
          A system that <span className="serif-accent">remembers</span> with you
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="card-ghost group p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_40px_-12px] hover:shadow-primary/25"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="rounded-xl border border-border/60 bg-muted/40 p-2.5 transition-colors group-hover:border-primary/30">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="chip">{f.tag}</span>
              </div>
              <h3 className="mb-2 font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="card-lit relative overflow-hidden px-8 py-14 text-center sm:px-14">
          <div className="pointer-events-none absolute inset-0 aurora opacity-70" />
          <p className="eyebrow relative mb-4">Your guide inside</p>
          <h2 className="relative font-display text-5xl tracking-tight sm:text-6xl">
            Meet <span className="serif-accent">V.</span>
          </h2>
          <p className="relative mx-auto mt-5 max-w-md text-muted-foreground">
            She keeps track of everything you save, walks you through the app, and
            occasionally has an opinion about it.
          </p>
          <Button asChild size="lg" className="relative mt-9 rounded-full bg-primary px-8 text-primary-foreground shadow-[0_0_36px_-8px] shadow-primary/50 hover:bg-primary/90">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto flex max-w-6xl items-center justify-between border-t border-border/50 px-6 py-8">
        <div className="flex items-center gap-2.5">
          <GemMark className="h-6 w-6" />
          <span className="text-sm text-muted-foreground">Vinx</span>
        </div>
        <span className="eyebrow">Your personal memory OS</span>
      </footer>
    </div>
  );
}
