import { useState } from 'react';
import { ChevronLeft, CreditCard, Globe2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Link, Navigate, useSearchParams } from '@/lib/router-compat';
import { getPlan, isPaidPlan, type Gateway } from '@/lib/plans';
import { toast } from 'sonner';

const GATEWAYS: { id: Gateway; name: string; hint: string; methods: string; icon: typeof CreditCard }[] = [
  { id: 'paystack', name: 'Paystack', hint: 'Best in Africa', methods: 'Cards, bank transfer, USSD, Google Pay', icon: CreditCard },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', hint: 'Best worldwide & iPhone', methods: 'Apple Pay, Google Pay, PayPal, cards', icon: Globe2 },
];

export default function Checkout() {
  const [params] = useSearchParams();
  const plan = getPlan(params.get('plan'));
  const [gateway, setGateway] = useState<Gateway | null>(null);

  if (!plan || !isPaidPlan(plan.id)) return <Navigate to="/pricing" replace />;

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl px-5 pb-40 pt-8">
        <Link to="/pricing" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> All plans
        </Link>
        <PageHeader eyebrow="Checkout" title={<>How would you <em className="italic">like to pay?</em></>} />

        <div className="surface mb-6 flex items-center justify-between rounded-2xl border border-border p-5">
          <div>
            <p className="eyebrow">{plan.name} plan</p>
            <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
          </div>
          <p className="font-display text-3xl text-foreground">${plan.price}<span className="text-sm text-muted-foreground">/mo</span></p>
        </div>

        <div role="radiogroup" aria-label="Payment method" className="space-y-3">
          {GATEWAYS.map((g) => {
            const on = gateway === g.id;
            return (
              <button key={g.id} type="button" role="radio" aria-checked={on} onClick={() => setGateway(g.id)}
                className={`surface flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition ${on ? 'beam border-primary/60' : 'border-border'}`}>
                <span className="icon-well h-10 w-10"><g.icon className="h-5 w-5" /></span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-foreground">{g.name} <span className="eyebrow ml-2">{g.hint}</span></span>
                  <span className="block text-xs text-muted-foreground">{g.methods}</span>
                </span>
                <span className={`h-4 w-4 rounded-full border ${on ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
              </button>
            );
          })}
        </div>

        <button type="button" disabled={!gateway}
          onClick={() => toast.message('Payments open very soon', { description: "V: “Hold that card. I'll ping you the moment checkout is live.”" })}
          className="mt-6 h-12 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-40">
          {gateway ? `Continue to ${GATEWAYS.find((g) => g.id === gateway)!.name}` : 'Choose a payment method'}
        </button>
        <p className="mt-4 text-center text-xs text-muted-foreground">Billed monthly in US dollars. Cancel any time.</p>
      </div>
    </AppLayout>
  );
}
