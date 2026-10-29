import { useEffect } from 'react';
import { useNavigate, Link } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { GemMark } from '@/components/layout/GemMark';
import { Network, Bell, Search, Layers, ArrowUpRight, Sparkles, Home, Clock, Plus, Settings } from 'lucide-react';

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

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[330px]">
      <div className="absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[110px]" />
      <div className="relative rounded-[2.6rem] border border-border/70 bg-card/50 p-2 shadow-[0_50px_100px_-40px] shadow-black backdrop-blur-sm">
        <div className="overflow-hidden rounded-[2.1rem] border border-border/40 bg-background px-5 pb-5 pt-4">
          {/* status bar */}
          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span>9:41</span>
            <span className="tracking-[0.25em]">VINX</span>
          </div>
          {/* mini header */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GemMark className="h-6 w-6" textClass="text-[10px]" />
              <span className="text-sm font-semibold"><span className="font-display italic text-base">V</span>inx</span>
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60">
              <Bell className="h-3 w-3 text-muted-foreground" />
            </span>
          </div>
          {/* greeting */}
          <p className="mt-5 font-display text-[1.65rem] leading-[1.1]">
            Good morning, <span className="serif-accent">Ada</span>
          </p>
          {/* week bar */}
          <div className="relative mt-4 h-1.5 rounded-full bg-gradient-to-r from-primary via-primary/50 to-muted/50">
            <span className="absolute left-[35%] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] bg-primary shadow-[0_0_12px] shadow-silver" />
          </div>
          <div className="mt-2.5 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-primary" />2 due today</span>
            <span>9 saved</span>
            <span>3 waiting</span>
          </div>
          {/* needs attention */}
          <p className="mt-6 font-mono text-[8.5px] uppercase tracking-[0.18em] text-muted-foreground">Needs attention</p>
          <div className="mt-2.5 rounded-2xl border border-primary/30 bg-card/70 p-3.5 shadow-[0_0_28px_-10px] shadow-silver/40">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-md border-2 border-muted-foreground/40" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold leading-snug">Call the dentist back</p>
                  <span className="flex-shrink-0 rounded-full border border-primary/40 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-primary">Due today</span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 flex-shrink-0 text-primary" />
                  <span>Number found in <strong className="font-semibold text-foreground/80">Tuesday's note</strong></span>
                </p>
                <p className="mt-1.5 font-display italic text-[12px] text-primary/75">waiting on you</p>
              </div>
            </div>
          </div>
          {/* up next */}
          <p className="mt-5 font-mono text-[8.5px] uppercase tracking-[0.18em] text-muted-foreground">Up next</p>
          <div className="mt-2.5 rounded-2xl border border-border/50 bg-card/40 p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-md border-2 border-muted-foreground/40" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug">Renew the passport</p>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 flex-shrink-0 text-primary" />
                  <span>Reminder lands <strong className="font-semibold text-foreground/80">Friday</strong></span>
                </p>
              </div>
            </div>
          </div>
          {/* bottom nav hint */}
          <div className="mt-5 flex items-center justify-around border-t border-border/40 pt-3.5 text-muted-foreground">
            <Home className="h-4 w-4 text-primary" />
            <Clock className="h-4 w-4" />
            <span className="-mt-7 flex h-11 w-11 items-center justify-center rounded-full bg-primary shadow-[0_0_24px_-2px] shadow-silver/70 ring-4 ring-background">
              <Plus className="h-5 w-5 text-primary-foreground" />
            </span>
            <Search className="h-4 w-4" />
            <Settings className="h-4 w-4" />
          </div>
        </div>
      </div>
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
            remember — even vaguely — and Vinx finds it.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="rounded-full bg-primary px-7 text-primary-foreground hover:bg-primary/90">
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

        {/* The app, framed */}
        <PhoneMock />
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
              className="card-ghost group p-6 transition-all duration-300 hover:border-silver/25 hover:shadow-[0_0_40px_-12px] hover:shadow-silver/25"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="rounded-xl border border-border/60 bg-muted/40 p-2.5 transition-colors group-hover:border-silver/25">
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
          <p className="eyebrow relative mb-4">Your second brain</p>
          <h2 className="relative font-display text-5xl tracking-tight sm:text-6xl">
            Your life, <span className="serif-accent">remembered.</span>
          </h2>
          <p className="relative mx-auto mt-5 max-w-md text-muted-foreground">
            Save it in seconds. Find it by describing it. Get reminded the moment it matters.
          </p>
          <Button asChild size="lg" className="relative mt-9 rounded-full bg-primary px-8 text-primary-foreground hover:bg-primary/90">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto flex max-w-6xl items-center justify-between border-t border-border/50 px-6 py-8">
        <div className="flex items-center gap-2.5">
          <GemMark className="h-6 w-6" textClass="text-[10px]" />
          <span className="text-sm text-muted-foreground">Vinx</span>
        </div>
        <span className="eyebrow">Your personal memory OS</span>
      </footer>
    </div>
  );
}
