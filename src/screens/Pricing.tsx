import { Check } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useNavigate } from '@/lib/router-compat';
import { PLANS } from '@/lib/plans';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function Pricing() {
  const navigate = useNavigate();
  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-5 pb-40 pt-8">
        <PageHeader eyebrow="Plans" title={<>Pick your <em className="italic">brain size.</em></>}
          sub="Start free, stay free if you like. Upgrade only when you want more room." />
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <article key={p.id} style={{ animationDelay: `${i * 60}ms` }}
              className={`rise surface relative flex flex-col rounded-3xl border p-6 ${p.highlight ? 'beam border-primary/40' : 'border-border'}`}>
              {p.highlight && <span className="eyebrow absolute right-5 top-5 text-primary">Most picked</span>}
              <p className="eyebrow">{p.name}</p>
              <p className="mt-3 font-display text-5xl text-foreground">
                ${p.price}<span className="text-base text-muted-foreground">/month</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-3 text-xs italic text-foreground/80">V: “{p.vLine}”</p>

              <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-background/40 p-4 font-mono text-xs">
                {[['Memories', p.quotas.memories], ['Voice min', p.quotas.voiceMinutes], ['Images', p.quotas.images], ['Ask V', p.quotas.aiQueries]].map(([k, v]) => (
                  <div key={k as string}><dt className="text-muted-foreground">{k}</dt><dd className="text-foreground">{fmt(v as number)}/mo</dd></div>
                ))}
              </dl>

              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-foreground/90"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
                ))}
              </ul>

              <button type="button"
                onClick={() => navigate(p.price === 0 ? '/' : `/checkout?plan=${p.id}`)}
                className={`mt-6 h-11 rounded-full text-sm font-medium transition active:scale-[0.98] ${p.highlight ? 'bg-primary text-primary-foreground' : 'border border-border bg-secondary text-secondary-foreground'}`}>
                {p.price === 0 ? 'Keep using Free' : `Get ${p.name}`}
              </button>
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">No free trial tricks. Cancel any time. Prices in US dollars.</p>
      </div>
    </AppLayout>
  );
}
