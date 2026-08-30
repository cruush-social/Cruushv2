import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, Copy, Shield, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import CruushPlusWord from './CruushPlusWord';
import { getBillingPlans, type CruushPlusPlan } from '../lib/billingApi';
import {
  createCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
  isOpenCryptoPayment,
  type CryptoPaymentIntent,
  type CryptoPaymentNetwork,
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

// People know which app their money is in, not which coin it settles in. Naming
// the token here would put back exactly the jargon this picker exists to
// remove; the payment screen states the asset and network precisely once an
// address is on screen, which is the only place it matters.
// Cash App sends USDC on Arbitrum; Venmo and PayPal send PYUSD on Arbitrum.
const PAYMENT_SOURCES: ReadonlyArray<{
  rail: CryptoPaymentRailId;
  label: string;
}> = [
  { rail: 'usdc_arbitrum', label: 'Cash App' },
  { rail: 'pyusd_arbitrum', label: 'Venmo or PayPal' },
  { rail: 'usdc_base', label: 'A crypto wallet' },
  { rail: 'pyusd_ethereum', label: 'Something else' },
];

// A network's display name. Getting this wrong on a payment screen sends money
// somewhere unrecoverable, so it is spelled out rather than inferred.
const NETWORK_LABELS: Record<CryptoPaymentNetwork, string> = {
  arbitrum: 'Arbitrum',
  base: 'Base',
  ethereum: 'Ethereum',
};

// The monthly plan is the reference price everything else is measured against.
// Showing a per-month equivalent is what makes a longer term legible as a
// saving rather than as a bigger number.
const MONTHLY_REFERENCE_ID = 'plus_monthly';

function planMonths(plan: CruushPlusPlan) {
  if (plan.durationMonths) {
    return plan.durationMonths;
  }
  if (plan.durationDays) {
    return plan.durationDays / 30;
  }
  return null;
}

function monthlyEquivalentCents(plan: CruushPlusPlan) {
  const months = planMonths(plan);
  if (!months || months <= 0) {
    return null;
  }
  return Math.round(plan.amountCents / months);
}

function savingsPercent(plan: CruushPlusPlan, monthlyCents: number | null) {
  const equivalent = monthlyEquivalentCents(plan);
  if (!monthlyCents || !equivalent || equivalent >= monthlyCents) {
    return null;
  }
  return Math.round(((monthlyCents - equivalent) / monthlyCents) * 100);
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
  const [selectedRail, setSelectedRail] = useState<CryptoPaymentRailId>('usdc_arbitrum');
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
        // Default to the best-value term that is still available rather than to
        // whatever happens to be first, which is the cheapest and anchors every
        // other price against it.
        setSelectedPlanId((current) => {
          if (current) {
            return current;
          }

          const available = billing.plans.filter((plan) => plan.supplyRemaining !== 0);
          const preferred = ['founder_annual', 'plus_annual', 'plus_6_month'] as const;
          for (const id of preferred) {
            const match = available.find((plan) => plan.id === id);
            if (match) {
              return match.id;
            }
          }

          return available[0]?.id ?? billing.plans[0]?.id ?? null;
        });
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

  const monthlyReferenceCents = useMemo(
    () => plans.find((plan) => plan.id === MONTHLY_REFERENCE_ID)?.amountCents ?? null,
    [plans],
  );

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

      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
        {/* Both explainers collapse, so choosing a term, choosing a network and
            paying all fit one phone screen. Nothing was removed: each section is
            one tap away. */}
        {/* The reason to buy leads. Same gradient tile treatment as the rewards
            page: one implementation per surface, so the two pages describing
            cruush+ do not look like different products. */}
        <Card>
          <CardContent className="p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span>What <CruushPlusWord /> unlocks</span>
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Viewing the map and messaging stay free for everyone, always.
            </p>
            <ul aria-label="cruush+ benefits" className="grid gap-2 sm:grid-cols-2">
              {PLUS_BENEFITS.map((benefit) => (
                <li
                  className="flex items-start gap-2 rounded-xl border border-white/20 p-2.5 text-[13px] leading-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_30px_rgba(255,0,114,0.18)]"
                  key={benefit}
                  style={{ background: 'var(--cruush-gradient)' }}
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <Accordion collapsible type="single">
            <AccordionItem className="border-0" value="why-crypto">
              <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline">
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
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold">Choose your time</p>
              {/* Each tile carries the per-month equivalent and the saving
                  against the monthly price, so a longer term reads as a better
                  deal rather than as a bigger number. Scarcity counters are
                  shown because they are real and they are the strongest signal
                  on the page. */}
              <ul aria-label="cruush+ prices" className="grid gap-2">
                {plans.map((plan) => {
                  const selected = plan.id === selectedPlanId;
                  const soldOut = plan.supplyRemaining === 0;
                  const perMonth = monthlyEquivalentCents(plan);
                  const saving = savingsPercent(plan, monthlyReferenceCents);
                  const scarce = plan.supplyRemaining !== null && plan.supplyRemaining > 0;

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
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                          selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
                        } ${soldOut ? 'opacity-50' : ''}`}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{termLabel(plan)}</span>
                            {plan.isFounder ? (
                              <span className="rounded-full border border-primary/60 px-1.5 text-[10px] uppercase leading-4 tracking-wide text-primary">
                                Founder
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                            {plan.isLifetime
                              ? 'Pay once, keep it forever'
                              : perMonth
                                ? `${formatPrice(perMonth, plan.currency)}/month`
                                : null}
                            {scarce ? (
                              <span className="text-primary">
                                {plan.isLifetime || perMonth ? ' · ' : ''}
                                {plan.supplyRemaining} left
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="text-base font-semibold">
                            {soldOut ? 'Sold out' : formatPrice(plan.amountCents, plan.currency)}
                          </span>
                          {saving && !soldOut ? (
                            <span className="text-[11px] font-medium leading-4 text-primary">
                              Save {saving}%
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs leading-4 text-muted-foreground">
                One payment for a fixed amount of time. Nothing renews and nothing is billed again.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {!loading && selectedPlan ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">What are you paying from?</p>
              {/* Ask which app someone is paying from, not which chain. Nobody
                  outside crypto knows what Arbitrum is, and picking the wrong
                  network sends money nowhere it can be recovered from. The app
                  determines the token and the chain, so we choose those. */}
              <div className="grid grid-cols-2 gap-2" aria-label="Where you are paying from">
                {PAYMENT_SOURCES.map((source) => (
                  <button
                    key={source.rail}
                    type="button"
                    aria-pressed={selectedRail === source.rail}
                    className={`rounded-xl border px-3 py-2 text-left ${selectedRail === source.rail ? 'border-primary bg-primary/10' : 'border-border'}`}
                    onClick={() => { setSelectedRail(source.rail); setIntent(null); }}
                  >
                    <span className="block text-sm font-medium">{source.label}</span>
                  </button>
                ))}
              </div>
              {!processorReady ? (
                <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  Crypto payment is not available yet. You can still earn cruush+ time through
                  check-ins and referrals.
                </p>
              ) : null}

              {/* Same gradient as the app's other primary actions. */}
              <Button
                className="h-12 w-full rounded-full text-base font-semibold text-white disabled:opacity-50"
                type="button"
                disabled={starting || !processorReady || paymentOpen}
                onClick={() => void handleStartPayment()}
                style={{ background: 'var(--cruush-logo)' }}
              >
                {starting
                  ? 'Starting…'
                  : paymentOpen
                    ? 'Payment started'
                    : `Get ${termLabel(selectedPlan).toLowerCase()} for ${formatPrice(selectedPlan.amountCents, selectedPlan.currency)}`}
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
                        <p className="text-xs text-muted-foreground">on {NETWORK_LABELS[intent.network]} to this address</p>
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
                        Send only {intent.asset} on {NETWORK_LABELS[intent.network]} to this address. Another asset or network may be lost.
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
