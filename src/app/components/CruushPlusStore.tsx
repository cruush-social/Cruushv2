import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, Copy, Shield, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import CruushPlusWord from './CruushPlusWord';
import { getBillingPlans, type CruushPlusPlan } from '../lib/billingApi';
import {
  createCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
  isOpenCryptoPayment,
  type CryptoPaymentIntent,
  type CryptoPaymentRailId,
  type CryptoProcessorStatus,
} from '../lib/cryptoCheckoutApi';

const PLUS_BENEFITS = [
  'See your full incoming cruush and profile-view lists.',
  'Send up to 3 Pings every 24 hours, with 4 hours between sends.',
  'Create posts on the local feed.',
  'Spin through nearby profiles with the cruise carousel.',
  'Use every seeking filter and visibility control together.',
  'Browse the map without appearing on it with Stealth Mode.',
] as const;

const PAYMENT_STATUS_COPY: Record<CryptoPaymentIntent['status'], string> = {
  pending: 'Setting up your payment.',
  awaiting_payment: 'Waiting for your payment to arrive.',
  confirming: 'Payment seen. Waiting for network confirmation.',
  paid: 'Payment confirmed. Your cruush+ time is active.',
  expired: 'This payment window expired. Do not send another payment if you already sent funds.',
  failed: 'Payment was not confirmed. No cruush+ time was added.',
  cancelled: 'This payment was cancelled.',
  // cruush does not refund cruush+, so nothing reaches this state on its own.
  // The entry stays because the status map must cover every status, and
  // because it reads correctly if an exceptional refund is ever recorded by
  // hand. It is not an offer of refunds.
  refunded: 'This payment was refunded.',
};

function formatPrice(amountCents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountCents / 100);
}

function termLabel(plan: CruushPlusPlan) {
  switch (plan.interval) {
    case 'week':
      return '7 days';
    case 'month':
      return '1 month';
    case '3_months':
      return '3 months';
    case '6_months':
      return '6 months';
    case 'year':
      return '1 year';
    case 'lifetime':
      return 'Lifetime';
    default:
      return '';
  }
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `key-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function formatUsdcAtomic(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const atomic = BigInt(value);
  const whole = atomic / 1_000_000n;
  const fraction = (atomic % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export default function CruushPlusStore() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<CruushPlusPlan[]>([]);
  const [processor, setProcessor] = useState<CryptoProcessorStatus | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [intent, setIntent] = useState<CryptoPaymentIntent | null>(null);
  const [selectedRail, setSelectedRail] = useState<CryptoPaymentRailId>('usdc_base');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentAttemptRef = useRef<{ planId: string; rail: CryptoPaymentRailId; idempotencyKey: string } | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([getBillingPlans(), getCryptoProcessorStatus().catch(() => null)])
      .then(([billing, cryptoStatus]) => {
        if (!active) {
          return;
        }

        setPlans(billing.plans);
        setProcessor(cryptoStatus);
        setSelectedPlanId((current) => current ?? billing.plans[0]?.id ?? null);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load cruush+.');
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

  // The browser polls for display only. A payment is never treated as settled from this side.
  useEffect(() => {
    if (!intent || !isOpenCryptoPayment(intent.status)) {
      return;
    }

    let active = true;
    const timer = window.setInterval(() => {
      getCryptoPaymentIntent(intent.id)
        .then((next) => {
          if (active) {
            setIntent(next);
            if (!isOpenCryptoPayment(next.status)) {
              paymentAttemptRef.current = null;
            }
          }
        })
        .catch(() => undefined);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intent]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const processorReady = processor?.ready === true;
  const paymentOpen = intent ? isOpenCryptoPayment(intent.status) : false;

  const handleStartPayment = useCallback(async () => {
    if (!selectedPlan) {
      return;
    }

    setStarting(true);
    setError(null);
    setCopied(false);

    try {
      const attempt = paymentAttemptRef.current?.planId === selectedPlan.id && paymentAttemptRef.current.rail === selectedRail
        ? paymentAttemptRef.current
        : {
            planId: selectedPlan.id,
            rail: selectedRail,
            idempotencyKey: createIdempotencyKey(),
          };
      paymentAttemptRef.current = attempt;
      const nextIntent = await createCryptoPaymentIntent({
        planId: selectedPlan.id,
        idempotencyKey: attempt.idempotencyKey,
        rail: selectedRail,
      });
      setIntent(nextIntent);
      if (!isOpenCryptoPayment(nextIntent.status)) {
        paymentAttemptRef.current = null;
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start this payment.');
    } finally {
      setStarting(false);
    }
  }, [selectedPlan, selectedRail]);

  const handleCopyAddress = useCallback(async () => {
    if (!intent?.paymentAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(intent.paymentAddress);
      setCopied(true);
    } catch {
      setError('Unable to copy the payment address.');
    }
  }, [intent]);

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/85 p-4 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Get <CruushPlusWord /></h1>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              What <CruushPlusWord /> unlocks
            </CardTitle>
            <CardDescription>
              Viewing the map and messaging stay free for everyone, always.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul aria-label="cruush+ benefits" className="grid gap-2 sm:grid-cols-2">
              {PLUS_BENEFITS.map((benefit) => (
                <li className="flex items-start gap-2 text-sm leading-5" key={benefit}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <Accordion collapsible type="single">
            <AccordionItem className="border-0" value="why-crypto">
              <AccordionTrigger className="px-6 py-5 text-base hover:no-underline">
                <span className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span>Why cruush takes crypto</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 px-6 pb-6 text-sm leading-6 text-muted-foreground">
                <p>
                  Crypto lets cruush offer one-time payments while keeping the app built for the whole
                  queer community.
                </p>
                <p>
                  Checkout supports USDC on Base and PYUSD on Ethereum. You pay once for the cruush+ time you choose. Nothing
                  renews automatically.
                </p>
                <p>
                  Each checkout gives you a fresh payment address and clear payment status.
                </p>
                <p>cruush never asks for your wallet private key or seed phrase.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        {error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading plans…
          </div>
        ) : null}

        {!loading && plans.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Choose your time</CardTitle>
              <CardDescription>
                Every option below is a single payment for a fixed amount of time. Crypto payments do
                not renew on their own and nothing is billed to you again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul aria-label="cruush+ prices" className="grid gap-3 sm:grid-cols-2">
                {plans.map((plan) => {
                  const selected = plan.id === selectedPlanId;
                  const soldOut = plan.supplyRemaining === 0;

                  return (
                    <li key={plan.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={soldOut}
                        onClick={() => {
                          if (plan.id === selectedPlanId) {
                            return;
                          }

                          setSelectedPlanId(plan.id);
                          setIntent(null);
                          setCopied(false);
                          paymentAttemptRef.current = null;
                        }}
                        className={`w-full rounded-xl border p-4 text-left transition ${
                          selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                        } ${soldOut ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{termLabel(plan)}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                          </div>
                          {plan.isFounder ? <Badge variant="secondary">Founder</Badge> : null}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-2xl font-semibold">
                            {formatPrice(plan.amountCents, plan.currency)}
                          </span>
                          {plan.supplyRemaining !== null ? (
                            <span className="text-xs text-muted-foreground">
                              {soldOut ? 'Sold out' : `${plan.supplyRemaining} left`}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {!loading && selectedPlan ? (
          <Card>
            <CardHeader>
              <CardTitle>Pay with crypto</CardTitle>
              <CardDescription>
                {formatPrice(selectedPlan.amountCents, selectedPlan.currency)} for {termLabel(selectedPlan)}.
                One payment, no renewal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2 sm:grid-cols-2" aria-label="Payment network">
                <button type="button" className={`rounded-lg border p-3 text-left text-sm ${selectedRail === 'usdc_base' ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => { setSelectedRail('usdc_base'); setIntent(null); }}>
                  <span className="font-medium">USDC on Base</span>
                  <span className="block text-xs text-muted-foreground">Use a wallet that supports Base.</span>
                </button>
                <button type="button" className={`rounded-lg border p-3 text-left text-sm ${selectedRail === 'pyusd_ethereum' ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => { setSelectedRail('pyusd_ethereum'); setIntent(null); }}>
                  <span className="font-medium">PYUSD on Ethereum</span>
                  <span className="block text-xs text-muted-foreground">Venmo and PayPal can send PYUSD here.</span>
                </button>
              </div>
              {!processorReady ? (
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Crypto payment is not available yet. You can still earn cruush+ time through
                  check-ins and referrals.
                </p>
              ) : null}

              <Button
                className="w-full"
                type="button"
                disabled={starting || !processorReady || paymentOpen}
                onClick={() => void handleStartPayment()}
              >
                {starting
                  ? 'Starting…'
                  : paymentOpen
                    ? 'Payment started'
                    : `Pay ${formatPrice(selectedPlan.amountCents, selectedPlan.currency)}`}
              </Button>

              {intent ? (
                <div aria-live="polite" className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">{PAYMENT_STATUS_COPY[intent.status]}</p>
                  {intent.paymentAddress && intent.quotedAmountAtomic && isOpenCryptoPayment(intent.status) ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Send exactly</p>
                        <p className="text-xl font-semibold">
                          {formatUsdcAtomic(intent.quotedAmountAtomic)} {intent.asset}
                        </p>
                        <p className="text-xs text-muted-foreground">on {intent.network === 'base' ? 'Base' : 'Ethereum'} to this address</p>
                      </div>
                      {intent.qrCodeDataUrl ? (
                        <img
                          src={intent.qrCodeDataUrl}
                          alt={`${intent.asset} payment address QR code`}
                          className="mx-auto h-40 w-40"
                        />
                      ) : null}
                      <code className="block break-all rounded-lg bg-muted p-3 text-xs leading-5">
                        {intent.paymentAddress}
                      </code>
                      <Button className="w-full" type="button" variant="outline" onClick={() => void handleCopyAddress()}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied' : 'Copy address'}
                      </Button>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Send only {intent.asset} on {intent.network === 'base' ? 'Base' : 'Ethereum'} to this address. Another asset or network may be lost.
                      </p>
                    </div>
                  ) : null}
                  <p className="text-xs leading-5 text-muted-foreground">
                    Your time is added once the payment settles on the network. Leaving this page does
                    not cancel it.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
