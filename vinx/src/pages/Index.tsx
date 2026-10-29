import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { FinancialHero } from '@/components/ui/hero-section';
import { Network, Bell, Search, Layers } from 'lucide-react';
import heroPhone from '@/assets/hero-phone.jpg';
import heroNotes from '@/assets/hero-notes.jpg';

const features = [
  { icon: Layers, title: 'Structured memories', description: 'Notes, voice and screenshots become searchable memories with people, places and dates.' },
  { icon: Network, title: 'Connected context', description: 'See how the people, places and topics in your life relate.' },
  { icon: Bell, title: 'Right-moment reminders', description: 'Intentions surface when they matter, not on a fixed alarm.' },
  { icon: Search, title: 'Find it by describing it', description: '“That pricing screenshot from last month.” Search by meaning, not keywords, with the source shown.' },
];

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="font-display text-sm font-bold text-primary-foreground">M</span>
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">Vinx</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <FinancialHero
        title={
          <>
            Remember what <br />
            <span className="text-primary">actually matters.</span>
          </>
        }
        description="Save notes, voice memos and screenshots in seconds. Later, describe what you remember, even vaguely, and Vinx finds it."
        buttonText="Get started"
        buttonLink="/auth"
        imageUrl1={heroPhone}
        imageUrl2={heroNotes}
      />

      <section className="container mx-auto px-6 py-20">
        <p className="mb-10 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">How it works</p>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="bg-background p-6 transition-colors hover:bg-card">
              <f.icon className="mb-5 h-5 w-5 text-primary" />
              <h3 className="mb-2 font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container mx-auto flex items-center justify-between border-t border-border px-6 py-8 text-sm text-muted-foreground">
        <span>Vinx</span>
        <span>Your personal memory OS</span>
      </footer>
    </div>
  );
}
