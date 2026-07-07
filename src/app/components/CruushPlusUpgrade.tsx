import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { createCheckoutSession, getBillingPlans, type CruushPlusPlan } from '../lib/billingApi';

function formatPrice(plan: CruushPlusPlan) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency,
  }).format(plan.amountCents / 100);
}

export default function CruushPlusUpgrade() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<CruushPlusPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getBillingPlans()
      .then((payload) => {
        if (active) {
          setPlans(payload.plans);
        }
      })
      .catch((error) => {
        if (active) {
          setError(error instanceof Error ? error.message : 'Unable to load cruush+.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCheckout = async (plan: CruushPlusPlan) => {
    setSavingPlanId(plan.id);
    setError(null);

    try {
      const session = await createCheckoutSession(plan.id);
      navigate(`/checkout/${session.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to start checkout.');
    } finally {
      setSavingPlanId(null);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/85 p-4 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">cruush+</h1>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">Open beta checkout is fake until payment processing is approved.</p>
        </div>

        {error ? (
          <div className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading plans...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => (
              <article key={plan.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{plan.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  </div>
                  {plan.isFounder ? <Badge variant="secondary">Founder</Badge> : null}
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-2xl font-semibold">{formatPrice(plan)}</p>
                  <Button
                    type="button"
                    disabled={savingPlanId === plan.id}
                    onClick={() => void handleCheckout(plan)}
                  >
                    {savingPlanId === plan.id ? 'Starting...' : 'Choose'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
