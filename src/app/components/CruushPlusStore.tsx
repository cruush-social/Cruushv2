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
  getCurrentCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
  isOpenCryptoPayment,
  type CryptoPaymentIntent,
  type CryptoPaymentNetwork,
  type CryptoPaymentRailId,
  type CryptoProcessorStatus,
} from '../lib/cryptoCheckoutApi';

const PLUS_BENEFITS = [
  'Who has a cruush on you',
  'See who viewed your profile',
  'Send up to 3 Pulses every 24 hours',
  'Cruise Carousel: land on a nearby profile, then browse again',
  'Use more than 3 seeking filter categories at once',
  'Use more than 3 visibility filters at once',
  'Dark Room: browse without appearing on the map',
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

const PAYMENT_SOURCES: ReadonlyArray<{
  rail: CryptoPaymentRailId;
  label: string;
  asset: string;
  network: string;
}> = [
  { rail: 'usdc_arbitrum', label: 'Cash App', asset: 'USDC', network: 'Arbitrum' },
  { rail: 'pyusd_arbitrum', label: 'Venmo or PayPal', asset: 'PYUSD', network: 'Arbitrum' },
  { rail: 'usdc_base', label: 'A crypto wallet', asset: 'USDC', network: 'Base' },
];

type PaymentMethodGuide = {
  title: string;
  steps: readonly string[];
};

const PAYMENT_METHOD_GUIDES: Partial<Record<CryptoPaymentRailId, readonly PaymentMethodGuide[]>> = {
  usdc_arbitrum: [{
    title: 'Cash App',
    steps: [
      'Open Cash App and go to the Payment tab.',
      'Copy the order address from cruush and paste it into the Cash App search bar.',
      'Enter the exact dollar amount shown by cruush. Cash App sends it as USDC.',
      'When Cash App shows the network, choose Arbitrum.',
      'Check the amount and address, then send before the cruush order timer reaches 0.',
    ],
  }],
  pyusd_arbitrum: [
    {
      title: 'Venmo',
      steps: [
        'Open Venmo, go to Crypto, and choose PayPal USD (PYUSD).',
        'Tap the transfer arrows, tap Send, then paste or scan the order address from cruush.',
        'Choose Arbitrum as the network.',
        'Enter the exact PYUSD amount shown by cruush.',
        'Check the amount, network, and address, then send before the cruush order timer reaches 0.',
      ],
    },
    {
      title: 'PayPal',
      steps: [
        'Open PayPal, go to Finances, and open your PayPal USD (PYUSD) balance.',
        'Tap the transfer arrows, tap Send, then paste or scan the order address from cruush.',
        'Choose Arbitrum on the blockchain network confirmation screen.',
        'Enter the exact PYUSD amount shown by cruush.',
        'Review the amount, network, and address, then tap Send Now before the cruush order timer reaches 0.',
      ],
    },
  ],
  usdc_base: [{
    title: 'Crypto wallet',
    steps: [
      'Open your wallet or exchange and choose Send.',
      'Choose USDC as the asset and Base as the network.',
      'Paste the order address from cruush or scan its QR code.',
      'Enter the exact USDC amount shown by cruush.',
      'Check the amount, network, and address, then send before the cruush order timer reaches 0.',
    ],
  }],
};

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
  if (!months || months < 1) {
    // A per-month figure on a term shorter than a month is nonsense. Nobody
    // buying seven days thinks in months, and dividing up makes the cheapest
    // way in read as the most expensive thing on the page.
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

function formatPaymentTimeRemaining(expiresAt: string, nowMs: number) {
  const remainingSeconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function PaymentMethodInstructions({ rail }: { rail: CryptoPaymentRailId }) {
  const guides = PAYMENT_METHOD_GUIDES[rail] ?? [];

  return (
    <div className="space-y-3">
      {guides.map((guide) => (
        <section className="rounded-lg border border-border bg-muted/30 p-3" key={guide.title}>
          <h3 className="text-sm font-semibold">{guide.title}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
      ))}
    </div>
  );
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
  const [statusError, setStatusError] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const paymentAttemptRef = useRef<{ planId: string; rail: CryptoPaymentRailId; idempotencyKey: string } | null>(null);
  const pollStartedRef = useRef<{ intentId: string; startedAt: number } | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      getBillingPlans(),
      getCryptoProcessorStatus().catch(() => null),
      getCurrentCryptoPaymentIntent().catch(() => null),
    ])
      .then(([billing, cryptoStatus, currentIntent]) => {
        if (!active) {
          return;
        }

        setPlans(billing.plans);
        setProcessor(cryptoStatus);
        if (currentIntent && isOpenCryptoPayment(currentIntent.status)) {
          setIntent(currentIntent);
          setSelectedPlanId(currentIntent.planId);
          setSelectedRail(currentIntent.rail);
          return;
        }
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

  const intentExpiresAtMs = intent?.expiresAt ? Date.parse(intent.expiresAt) : Number.NaN;
  const paymentWindowClosed = Boolean(
    intent
      && isOpenCryptoPayment(intent.status)
      && Number.isFinite(intentExpiresAtMs)
      && intentExpiresAtMs <= clockMs,
  );
  const locallyExpired = Boolean(
    intent
      && (intent.status === 'pending' || intent.status === 'awaiting_payment')
      && paymentWindowClosed,
  );

  useEffect(() => {
    if (!intent?.expiresAt || !isOpenCryptoPayment(intent.status) || paymentWindowClosed) {
      return;
    }

    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [intent?.expiresAt, intent?.status, paymentWindowClosed]);

  useEffect(() => {
    if (!locallyExpired) {
      return;
    }

    paymentAttemptRef.current = null;
  }, [locallyExpired]);

  // The browser polls for display only. A payment is never treated as settled from this side.
  // Polling stops at the server deadline and never runs forever in a stale tab.
  useEffect(() => {
    if (!intent || !isOpenCryptoPayment(intent.status) || locallyExpired) {
      return;
    }

    let active = true;
    const pollStarted = pollStartedRef.current?.intentId === intent.id
      ? pollStartedRef.current
      : { intentId: intent.id, startedAt: Date.now() };
    pollStartedRef.current = pollStarted;
    const hardStopAt = Number.isFinite(intentExpiresAtMs)
      ? intentExpiresAtMs + (intent.status === 'confirming' ? 20 * 60 * 1000 : 0)
      : pollStarted.startedAt + (30 * 60 * 1000);

    const timer = window.setInterval(() => {
      if (Date.now() >= hardStopAt || document.visibilityState === 'hidden') {
        return;
      }

      getCryptoPaymentIntent(intent.id)
        .then((next) => {
          if (active) {
            setStatusError(null);
            setClockMs(Date.now());
            setIntent((current) => current?.id === next.id
              ? { ...next, qrCodeDataUrl: next.qrCodeDataUrl ?? current.qrCodeDataUrl }
              : next);
            if (!isOpenCryptoPayment(next.status)) {
              paymentAttemptRef.current = null;
            }
          }
        })
        .catch(() => {
          if (active) {
            setStatusError('Payment status could not refresh. Your payment is still tracked by cruush.');
          }
        });
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intent?.id, intent?.status, intentExpiresAtMs, locallyExpired]);

  const monthlyReferenceCents = useMemo(
    () => plans.find((plan) => plan.id === MONTHLY_REFERENCE_ID)?.amountCents ?? null,
    [plans],
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const recommendedPlanId = useMemo(() => {
    const available = plans.filter((plan) => plan.supplyRemaining !== 0);
    return available.find((plan) => plan.id === 'founder_annual')?.id
      ?? available.find((plan) => plan.id === 'plus_annual')?.id
      ?? available.find((plan) => plan.id === 'plus_6_month')?.id
      ?? available[0]?.id
      ?? null;
  }, [plans]);

  const otherPlans = useMemo(
    () => plans.filter((plan) => plan.id !== selectedPlanId),
    [plans, selectedPlanId],
  );

  const readyRailIds = useMemo(
    () => new Set(processor?.rails.filter((rail) => rail.ready).map((rail) => rail.id) ?? []),
    [processor],
  );
  const readyVisibleSources = useMemo(
    () => PAYMENT_SOURCES.filter((source) => readyRailIds.has(source.rail)),
    [readyRailIds],
  );
  const selectedRailReady = readyRailIds.has(selectedRail);
  const visibleProcessorReady = readyVisibleSources.length > 0;
  const paymentOpen = intent ? isOpenCryptoPayment(intent.status) : false;
  const paymentPaid = intent?.status === 'paid';
  const checkoutSelectionLocked = starting || (paymentOpen && !locallyExpired) || paymentPaid;

  useEffect(() => {
    // An open or paid intent owns its original rail even if readiness changes
    // after the address was issued. Switching here would discard the payment
    // state and make the checkout present a different source than the intent.
    if (!processor || selectedRailReady || paymentOpen || paymentPaid) {
      return;
    }

    const firstReadySource = readyVisibleSources[0];
    if (!firstReadySource) {
      return;
    }

    setSelectedRail(firstReadySource.rail);
    setIntent(null);
    setCopied(false);
    paymentAttemptRef.current = null;
  }, [paymentOpen, paymentPaid, processor, readyVisibleSources, selectedRailReady]);

  const handleStartPayment = useCallback(async () => {
    if (
      !selectedPlan
      || !selectedRailReady
      || starting
      || (paymentOpen && !locallyExpired)
      || paymentPaid
    ) {
      return;
    }

    setStarting(true);
    setError(null);
    setStatusError(null);
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
        planId: attempt.planId,
        idempotencyKey: attempt.idempotencyKey,
        rail: attempt.rail,
      });
      if (paymentAttemptRef.current !== attempt) {
        return;
      }
      setIntent(nextIntent);
      if (!isOpenCryptoPayment(nextIntent.status)) {
        paymentAttemptRef.current = null;
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start this payment.');
    } finally {
      setStarting(false);
    }
  }, [locallyExpired, paymentOpen, paymentPaid, selectedPlan, selectedRail, selectedRailReady, starting]);

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

  const renderPlanButton = (plan: CruushPlusPlan, featured = false) => {
    const selected = plan.id === selectedPlanId;
    const recommended = plan.id === recommendedPlanId;
    const soldOut = plan.supplyRemaining === 0;
    const perMonth = monthlyEquivalentCents(plan);
    const saving = savingsPercent(plan, monthlyReferenceCents);
    const scarce = plan.supplyRemaining !== null && plan.supplyRemaining > 0;

    return (
      <button
        type="button"
        aria-pressed={selected}
        disabled={soldOut || checkoutSelectionLocked}
        onClick={() => {
          if (selected) {
            return;
          }

          setSelectedPlanId(plan.id);
          setIntent(null);
          setCopied(false);
          paymentAttemptRef.current = null;
        }}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border text-left transition ${
          featured ? 'border-primary px-3 py-3 shadow-lg' : 'border-border px-3 py-2.5'
        } ${selected ? 'bg-primary/10' : 'bg-card'} ${soldOut || checkoutSelectionLocked ? 'opacity-50' : ''}`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={featured ? 'text-base font-semibold' : 'text-sm font-medium'}>
              {termLabel(plan)}
            </span>
            {recommended ? (
              <span
                className="rounded-full px-1.5 text-[10px] uppercase leading-4 tracking-wide text-white"
                style={{ background: 'var(--cruush-gradient)' }}
              >
                Recommended
              </span>
            ) : null}
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
                ? `${formatPrice(plan.amountCents, plan.currency)} total`
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
          <span className={featured ? 'text-lg font-semibold' : 'text-base font-semibold'}>
            {soldOut
              ? 'Sold out'
              : perMonth
                ? `${formatPrice(perMonth, plan.currency)}/month`
                : formatPrice(plan.amountCents, plan.currency)}
          </span>
          {saving && !soldOut ? (
            <span className="text-[11px] font-medium leading-4 text-primary">
              Save {saving}%
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/85 p-4 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Get <CruushPlusWord /></h1>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-2 px-3 py-1.5">
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
            <CardContent className="p-3">
              <p className="mb-2 text-sm font-semibold">Choose your time</p>
              <ul aria-label="cruush+ prices" className="grid gap-2">
                {selectedPlan ? <li>{renderPlanButton(selectedPlan, true)}</li> : null}
              </ul>
              {otherPlans.length > 0 ? (
                <Accordion collapsible type="single">
                  <AccordionItem className="border-0" value="compare-plans">
                    <AccordionTrigger className="py-2 text-xs hover:no-underline">
                      Compare plans
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <ul aria-label="Other cruush+ prices" className="grid gap-2">
                        {otherPlans.map((plan) => <li key={plan.id}>{renderPlanButton(plan)}</li>)}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
              <p className="mt-2 text-xs leading-4 text-muted-foreground">
                One payment for a fixed amount of time. Nothing renews and nothing is billed again.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {!loading && selectedPlan ? (
          <Card>
            <CardContent className="space-y-2 p-3">
              <p className="text-sm font-semibold">What are you paying from?</p>
              <div className="grid grid-cols-3 gap-2" aria-label="Where you are paying from">
                {PAYMENT_SOURCES.map((source) => {
                  const sourceReady = readyRailIds.has(source.rail);
                  const sourceSelected = selectedRail === source.rail
                    && (sourceReady || paymentOpen || paymentPaid);

                  return (
                    <button
                      key={source.rail}
                      type="button"
                      aria-label={source.label}
                      aria-pressed={sourceSelected}
                      disabled={!sourceReady || checkoutSelectionLocked}
                      className={`rounded-xl border px-2 py-2 text-center disabled:opacity-50 ${sourceSelected ? 'border-primary bg-primary/10' : 'border-border'}`}
                      onClick={() => {
                        setSelectedRail(source.rail);
                        setIntent(null);
                        setCopied(false);
                        paymentAttemptRef.current = null;
                      }}
                    >
                      <span className="block text-sm font-medium">{source.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                        {source.asset} · {source.network}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!intent ? (
                <Accordion collapsible type="single">
                  <AccordionItem className="border-0" value="payment-instructions">
                    <AccordionTrigger className="py-2 text-xs hover:no-underline">
                      How to send this payment
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <PaymentMethodInstructions rail={selectedRail} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
              {/* Same gradient as the app's other primary actions. */}
              <Button
                className="h-12 w-full rounded-full text-base font-semibold text-white disabled:opacity-50"
                type="button"
                disabled={starting || !selectedRailReady || (paymentOpen && !locallyExpired) || paymentPaid}
                onClick={() => void handleStartPayment()}
                style={{ background: 'var(--cruush-logo)' }}
              >
                {starting
                  ? 'Starting…'
                  : paymentPaid
                    ? 'cruush+ active'
                    : paymentOpen && !locallyExpired
                    ? 'Payment started'
                    : locallyExpired
                      ? 'Start a fresh payment'
                    : `Get ${termLabel(selectedPlan).toLowerCase()} for ${formatPrice(selectedPlan.amountCents, selectedPlan.currency)}`}
              </Button>

              {!visibleProcessorReady ? (
                <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  Crypto payment is not available yet. You can still earn cruush+ time through
                  check-ins and referrals.
                </p>
              ) : null}

              {intent ? (
                <div aria-live="polite" className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">
                    {locallyExpired ? PAYMENT_STATUS_COPY.expired : PAYMENT_STATUS_COPY[intent.status]}
                  </p>
                  {statusError ? <p className="text-xs text-destructive">{statusError}</p> : null}
                  {!paymentWindowClosed && intent.expiresAt && isOpenCryptoPayment(intent.status) ? (
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Protected order</p>
                      <p className="mt-1 text-sm font-semibold">
                        Order timer: {formatPaymentTimeRemaining(intent.expiresAt, clockMs)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        This address is unique to this order. Only the exact amount in {intent.asset} on{' '}
                        {NETWORK_LABELS[intent.network]} that arrives on-chain before the timer reaches 0 can count toward it.
                      </p>
                    </div>
                  ) : null}
                  {intent.paymentAddress && intent.quotedAmountAtomic && isOpenCryptoPayment(intent.status) && !paymentWindowClosed ? (
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
                      <div>
                        <p className="mb-2 text-sm font-semibold">How to send it</p>
                        <PaymentMethodInstructions rail={selectedRail} />
                      </div>
                    </div>
                  ) : null}
                  {!locallyExpired ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Your time is added once the payment settles on the network. Leaving this page does
                      not cancel it. Return here to see the same active payment.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Same gradient tile treatment as the rewards page: one implementation
            per surface, so the two pages describing cruush+ do not look like
            different products. */}
        <Card>
          <CardContent className="p-3">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span>What <CruushPlusWord /> unlocks</span>
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Viewing the map and messaging stay free for everyone, always.
            </p>
            <ul aria-label="cruush+ benefits" className="grid grid-cols-2 gap-x-1.5 gap-y-1">
              {PLUS_BENEFITS.map((benefit) => (
                <li
                  className="flex items-center gap-1.5 rounded-xl border border-white/20 p-2 text-[11px] leading-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_30px_rgba(255,0,114,0.18)]"
                  key={benefit}
                  style={{ background: 'var(--cruush-gradient)' }}
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-white" />
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
                  Cash App pays with USDC on Arbitrum. Venmo and PayPal pay with PYUSD on Arbitrum.
                  You pay once for the cruush+ time you choose. Nothing renews automatically.
                </p>
                <p>
                  Each checkout gives you a fresh payment address and clear payment status.
                </p>
                <p>cruush never asks for your wallet private key or seed phrase.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4 text-xs leading-5 text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">Billing policy</h2>
            <p>
              One-time purchase. Nothing renews automatically. Purchases are final and non-refundable
              except where applicable law requires a withdrawal, refund, remedy, or forced reversal.
            </p>
            <a className="font-medium text-foreground underline underline-offset-4" href="/billing-policy">
              Read the billing policy
            </a>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
