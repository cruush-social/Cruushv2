import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { completeTestCheckoutSession, getCheckoutSession, type CheckoutSession } from '../lib/billingApi';

export default function CruushPlusCheckout() {
  const navigate = useNavigate();
  const { sessionId = '' } = useParams();
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getCheckoutSession(sessionId)
      .then((payload) => {
        if (active) {
          setSession(payload);
        }
      })
      .catch((error) => {
        if (active) {
          setError(error instanceof Error ? error.message : 'Unable to load checkout.');
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
  }, [sessionId]);

  const handleComplete = async () => {
    setSaving(true);
    setError(null);

    try {
      await completeTestCheckoutSession(sessionId);
      navigate('/checkout/success');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to complete checkout.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/85 p-4 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Checkout</h1>
      </header>

      <section className="mx-auto max-w-xl px-5 py-8">
        {loading ? <p className="text-sm text-muted-foreground">Loading checkout...</p> : null}
        {error ? (
          <div className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {session ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">TEST CHECKOUT</p>
            <h2 className="mt-2 text-2xl font-semibold">{session.plan.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{session.testWarning}</p>
            <Button type="button" className="mt-6 w-full" disabled={saving} onClick={handleComplete}>
              {saving ? 'Completing...' : 'Complete test checkout'}
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
