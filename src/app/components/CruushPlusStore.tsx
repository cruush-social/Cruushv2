import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiClientError } from '../lib/apiClient';
import { Check, Copy, Info, Shield, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Card, CardContent } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import AppPageHeader from './AppPageHeader';
import CruushPlusWord from './CruushPlusWord';
import { getBillingPlans, type CruushPlusPlan, type CruushPlusPlanId } from '../lib/billingApi';
import {
  getPulsePacks, createPulsePaymentIntent, getCurrentPulsePaymentIntent,
  cancelCryptoPaymentIntent,
  createCryptoPaymentIntent,
  getBitcoinSendingEligibility,
  getCurrentCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
  isOpenCryptoPayment,
  type BitcoinSendingEligibility,
  type CryptoPaymentIntent,
  type CryptoPaymentRailId,
  type CryptoProcessorStatus,
} from '../lib/cryptoCheckoutApi';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';
import {
  CRYPTO_NETWORK_LABELS,
  CRYPTO_PAYMENT_SOURCES,
  CRYPTO_SENDING_APP_LABELS,
  CryptoPaymentMethodInstructions,
  cryptoPaymentSourceForIntent,
  type CryptoPaymentSource,
} from './CryptoPaymentMethods';

type StorePlan = Omit<CruushPlusPlan, 'id' | 'interval'> & { id: string; interval: CruushPlusPlan['interval'] | 'pack' };

const CHECKOUT_PLUS_FEATURES = CRUUSH_PLUS_FEATURES.map((benefit) =>
  benefit.title === 'Full activity'
    ? { ...benefit, title: 'Who has a cruush on you' }
    : benefit,
);

// Keep the mobile catalogue readable in two columns; the final odd benefit
// spans both columns instead of squeezing the whole list into three.
const BALANCED_CHECKOUT_PLUS_FEATURES = [
  CHECKOUT_PLUS_FEATURES[0],
  CHECKOUT_PLUS_FEATURES[5],
  CHECKOUT_PLUS_FEATURES[2],
  CHECKOUT_PLUS_FEATURES[3],
  CHECKOUT_PLUS_FEATURES[1],
  CHECKOUT_PLUS_FEATURES[4],
  CHECKOUT_PLUS_FEATURES[6],
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

function termLabel(plan: StorePlan) {
  switch (plan.interval) {
    case 'pack': return plan.name;
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

// The monthly plan is the reference price everything else is measured against.
// Showing a per-month equivalent is what makes a longer term legible as a
// saving rather than as a bigger number.
const MONTHLY_REFERENCE_ID = 'plus_monthly';

function planMonths(plan: StorePlan) {
  if (plan.durationMonths) {
    return plan.durationMonths;
  }
  if (plan.durationDays) {
    return plan.durationDays / 30;
  }
  return null;
}

function monthlyEquivalentCents(plan: StorePlan) {
  const months = planMonths(plan);
  if (!months || months < 1) {
    // A per-month figure on a term shorter than a month is nonsense. Nobody
    // buying seven days thinks in months, and dividing up makes the cheapest
    // way in read as the most expensive thing on the page.
    return null;
  }
  return Math.round(plan.amountCents / months);
}

function savingsPercent(plan: StorePlan, monthlyCents: number | null) {
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

function formatUsdcAtomic(value: string | null, asset?: string) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const atomic = BigInt(value);
  const decimals = asset === 'BTC' ? 8 : 6;
  const units = 10n ** BigInt(decimals);
  const whole = atomic / units;
  const fraction = (atomic % units).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatPaymentTimeRemaining(expiresAt: string, nowMs: number) {
  const remainingSeconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const BITCOIN_APP_LINKS = {
  cash_app: 'https://cash.app/launch/',
  paypal: 'https://www.paypal.com/myaccount/crypto/BTC',
  venmo: 'https://venmo.com/about/crypto',
} as const;

export default function CruushPlusStore({ product = 'cruush_plus' }: { product?: 'cruush_plus' | 'ping_pack' }) {
  const isPulse = product === 'ping_pack';
  const statusCopy = isPulse ? { ...PAYMENT_STATUS_COPY, paid: 'Payment confirmed. Your Pulses are available.', failed: 'Payment was not confirmed. No Pulses were added.' } : PAYMENT_STATUS_COPY;
  const [gasFeeHelpOpen, setGasFeeHelpOpen] = useState(false);
  const navigate = useNavigate();
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [processor, setProcessor] = useState<CryptoProcessorStatus | null>(null);
  const [bitcoinEligibility, setBitcoinEligibility] = useState<BitcoinSendingEligibility | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [intent, setIntent] = useState<CryptoPaymentIntent | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(CRYPTO_PAYMENT_SOURCES[0].id);
  const [hasChosenSource, setHasChosenSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [amountCopied, setAmountCopied] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelAction, setCancelAction] = useState<'change' | 'cancel' | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const paymentAttemptRef = useRef<{ planId: string; sourceId: string; idempotencyKey: string } | null>(null);
  const startingRef = useRef(false);
  const pollStartedRef = useRef<{ intentId: string; startedAt: number } | null>(null);
  const cancelledIntentIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      isPulse ? getPulsePacks().then(({ packs }) => ({ plans: packs.map(pack => ({ ...pack, interval: 'pack' as const, supplyRemaining: null, isFounder: false, isLifetime: false, badgeKeys: [] })) })) : getBillingPlans(),
      getCryptoProcessorStatus().catch(() => null),
      (isPulse ? getCurrentPulsePaymentIntent() : getCurrentCryptoPaymentIntent()).catch(() => null),
      // A missing sample leaves the catalogue as it is rather than hiding it.
      getBitcoinSendingEligibility().catch(() => null),
    ])
      .then(([billing, cryptoStatus, currentIntent, bitcoinSending]) => {
        if (!active) {
          return;
        }

        setPlans(billing.plans);
        setProcessor(cryptoStatus);
        setBitcoinEligibility(bitcoinSending);
        if (currentIntent && isOpenCryptoPayment(currentIntent.status)) {
          setIntent(currentIntent);
          setHasChosenSource(true);
          setSelectedPlanId(currentIntent.planId);
          const intentSource = cryptoPaymentSourceForIntent(currentIntent);
          if (intentSource) {
            setSelectedSourceId(intentSource.id);
          }
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
          setError(loadError instanceof Error ? loadError.message : (isPulse ? 'Unable to load Pulse packs.' : 'Unable to load cruush+.'));
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
  }, [isPulse]);

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
    if (retryAt <= Date.now() && (!intent?.expiresAt || !isOpenCryptoPayment(intent.status) || paymentWindowClosed)) {
      return;
    }

    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [intent?.expiresAt, intent?.status, paymentWindowClosed, retryAt]);

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
      ? intentExpiresAtMs + (intent.status === 'confirming' ? (intent.asset === 'BTC' ? 24 * 60 : 20) * 60 * 1000 : 0)
      : pollStarted.startedAt + (60 * 60 * 1000);

    const timer = window.setInterval(() => {
      if (Date.now() >= hardStopAt || document.visibilityState === 'hidden') {
        return;
      }

      getCryptoPaymentIntent(intent.id)
        .then((next) => {
          if (active && cancelledIntentIdRef.current !== next.id) {
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

  const selectedPaymentSource = useMemo(
    () => CRYPTO_PAYMENT_SOURCES.find((source) => source.id === selectedSourceId) ?? CRYPTO_PAYMENT_SOURCES[0],
    [selectedSourceId],
  );
  const selectedRail: CryptoPaymentRailId = selectedPaymentSource.rail;

  // Keep the product catalogue visible. Sending minimums disable methods for
  // the chosen product instead of silently changing what the member buys.
  const listedPlans = plans;

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
    () => listedPlans.filter((plan) => plan.id !== selectedPlanId),
    [listedPlans, selectedPlanId],
  );

  const readyRailIds = useMemo(
    () => new Set(processor?.rails.filter((rail) => rail.ready).map((rail) => rail.id) ?? []),
    [processor],
  );
  const readyVisibleSources = useMemo(
    () => CRYPTO_PAYMENT_SOURCES.filter((source) => readyRailIds.has(source.rail)),
    [readyRailIds],
  );
  const selectedRailReady = readyRailIds.has(selectedRail);
  const visibleProcessorReady = readyVisibleSources.length > 0;
  const paymentOpen = intent ? isOpenCryptoPayment(intent.status) : false;
  const paymentPaid = intent?.status === 'paid';
  const checkoutSelectionLocked = starting || (paymentOpen && !locallyExpired) || paymentPaid;
  // A source whose rail is not ready is not offered at all. The one exception
  // is the source an open or paid order was started from, which stays shown
  // so the checkout keeps presenting the order's own method.
  const pickerSources = useMemo(
    () => CRYPTO_PAYMENT_SOURCES.filter((source) =>
      readyRailIds.has(source.rail)
      || (source.id === selectedSourceId && (paymentOpen || paymentPaid))),
    [paymentOpen, paymentPaid, readyRailIds, selectedSourceId],
  );

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

    setSelectedSourceId(firstReadySource.id);
    setIntent(null);
    setCopied(false);
    paymentAttemptRef.current = null;
  }, [paymentOpen, paymentPaid, processor, readyVisibleSources, selectedRailReady]);

  useEffect(() => {
    // A started or paid order owns its plan, so the selection is left alone
    // while it is locked. Otherwise the selection follows the listed items.
    if (checkoutSelectionLocked || listedPlans.length === 0) {
      return;
    }

    if (selectedPlanId && listedPlans.some((plan) => plan.id === selectedPlanId)) {
      return;
    }

    const available = listedPlans.find((plan) => plan.supplyRemaining !== 0) ?? listedPlans[0];
    setSelectedPlanId(available.id);
    setIntent(null);
    setCopied(false);
    paymentAttemptRef.current = null;
  }, [checkoutSelectionLocked, listedPlans, selectedPlanId]);

  const handleStartPayment = useCallback(async (source: CryptoPaymentSource) => {
    if (
      !selectedPlan
      || !readyRailIds.has(source.rail)
      || startingRef.current
      || retryAt > Date.now()
      || (paymentOpen && !locallyExpired)
      || paymentPaid
    ) {
      return;
    }

    setSelectedSourceId(source.id);
    setHasChosenSource(true);
    setCopied(false);
    if (source.rail === 'btc_bitcoin' && source.sendingApp !== 'wallet') {
      const apps = bitcoinEligibility?.products[selectedPlan.id];
      if (apps && !apps.includes(CRYPTO_SENDING_APP_LABELS[source.sendingApp])) {
        const minimum = source.sendingApp === 'cash_app' ? '0.00005' : '0.001';
        setCheckoutNotice(`${source.label}: this order is below its ${minimum} BTC sending minimum. Choose another method before buying.`);
        return;
      }
    }

    startingRef.current = true;
    setStarting(true);
    setError(null);
    setStatusError(null);
    setCheckoutNotice(null);
    setCopied(false);

    try {
      const attempt = paymentAttemptRef.current?.planId === selectedPlan.id && paymentAttemptRef.current.sourceId === source.id
        ? paymentAttemptRef.current
        : {
            planId: selectedPlan.id,
            sourceId: source.id,
            idempotencyKey: createIdempotencyKey(),
          };
      paymentAttemptRef.current = attempt;
      const nextIntent = await (isPulse ? createPulsePaymentIntent({ packId: attempt.planId, idempotencyKey: attempt.idempotencyKey, rail: source.rail, sendingApp: source.sendingApp }) : createCryptoPaymentIntent({
        planId: attempt.planId as CruushPlusPlanId,
        idempotencyKey: attempt.idempotencyKey,
        rail: source.rail,
        sendingApp: source.sendingApp,
      }));
      if (paymentAttemptRef.current !== attempt) {
        return;
      }
      setIntent(nextIntent);
      setAmountCopied(false);
      setRetryAt(0);
      if (!isOpenCryptoPayment(nextIntent.status)) {
        paymentAttemptRef.current = null;
      }
    } catch (startError) {
      if (startError instanceof ApiClientError && startError.code === 'RATE_LIMITED') {
        const seconds = (startError.details as { retryAfterSeconds?: number } | null)?.retryAfterSeconds;
        setRetryAt(Date.now() + (typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(1, seconds) : 60) * 1000);
        setClockMs(Date.now());
      }
      setError(startError instanceof Error ? startError.message : 'Unable to start this payment.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [bitcoinEligibility, isPulse, locallyExpired, paymentOpen, paymentPaid, selectedPlan, readyRailIds, retryAt]);

  const handleCancelPayment = useCallback(async () => {
    if (!intent || !cancelAction || cancelling || !['pending', 'awaiting_payment'].includes(intent.status)) {
      return;
    }

    setCancelling(true);
    cancelledIntentIdRef.current = intent.id;
    setError(null);
    setStatusError(null);

    try {
      const cancelledIntent = await cancelCryptoPaymentIntent(intent.id);
      paymentAttemptRef.current = null;
      setCopied(false);
      setCancelAction(null);

      if (cancelAction === 'change') {
        setIntent(null);
        setCheckoutNotice('Previous order cancelled. Choose how you want to pay.');
      } else {
        setIntent(cancelledIntent);
        setCheckoutNotice('Order cancelled. Its address will not be reused.');
      }
    } catch (cancelError) {
      cancelledIntentIdRef.current = null;
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel this payment.');
    } finally {
      setCancelling(false);
    }
  }, [cancelAction, cancelling, intent]);

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

  const handleCopyAmount = async () => {
    if (!intent?.quotedAmountAtomic) return;
    try {
      await navigator.clipboard.writeText(formatUsdcAtomic(intent.quotedAmountAtomic, intent.asset));
      setAmountCopied(true);
    } catch { setError('Unable to copy the payment amount.'); }
  };

  const renderPlanButton = (plan: StorePlan, featured = false) => {
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
          <span className="mt-1 text-sm leading-5 text-muted-foreground">
            {plan.isLifetime
              ? 'Pay once, keep it forever. Plus processing fee'
              : perMonth
                ? `${formatPrice(plan.amountCents, plan.currency)} + processing fee`
                : '+ processing fee'}
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
            <span className="text-xs font-medium leading-4 text-primary">
              Save {saving}%
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <AppPageHeader
        title={isPulse ? 'Get Pulses' : <>Get <CruushPlusWord /></>}
        onBack={() => navigate(-1)}
        bugButtonTestId="cruush-plus-store-bug-button-slot"
        titleClassName="font-semibold"
      />

      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-3 py-2 sm:px-4">
        {!isPulse ? <Card>
          <Accordion collapsible type="single">
            <AccordionItem value="benefits">
              <AccordionTrigger className="px-4 py-3 text-base hover:no-underline">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                  <span>What <CruushPlusWord /> unlocks</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <CardContent className="p-3">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Viewing the map and messaging stay free for everyone, always.
                  </p>
                  <ul
                    aria-label="cruush+ benefits"
                    className="grid grid-cols-2 gap-2"
                  >
                    {BALANCED_CHECKOUT_PLUS_FEATURES.map((benefit, index) => (
                      <li
                        className={`${BALANCED_CHECKOUT_PLUS_FEATURES.length % 2 === 1 && index === BALANCED_CHECKOUT_PLUS_FEATURES.length - 1 ? 'col-span-2' : ''} flex h-full items-start gap-2 rounded-xl border border-white/20 p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_30px_rgba(255,0,114,0.18)]`}
                        key={benefit.title}
                        style={{ background: 'var(--cruush-gradient)' }}
                      >
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-5">{benefit.title}</span>
                          <span className="block text-xs leading-5 text-white/90">{benefit.description}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card> : null}

        {isPulse ? <Button variant="outline" onClick={() => navigate('/store')}>cruush+ checkout</Button> : null}
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
              <p className="mb-2 text-sm font-semibold">{isPulse ? 'Choose your Pulses' : 'Choose your time'}</p>
              <ul aria-label={isPulse ? 'Pulse prices' : 'cruush+ prices'} className="grid gap-2">
                {selectedPlan && (checkoutSelectionLocked || listedPlans.some(plan => plan.id === selectedPlan.id)) ? <li>{renderPlanButton(selectedPlan, true)}</li> : null}
              </ul>
              {otherPlans.length > 0 ? (
                <Accordion collapsible type="single">
                  <AccordionItem value="compare-plans">
                    <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                      Compare plans
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <ul aria-label={isPulse ? 'Other Pulse prices' : 'Other cruush+ prices'} className="grid gap-2">
                        {otherPlans.map((plan) => <li key={plan.id}>{renderPlanButton(plan)}</li>)}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
              <p className="mt-3 text-sm leading-5 text-muted-foreground">
                {isPulse ? 'One payment for permanent Pulse credits. Nothing renews automatically.' : 'One payment for a fixed amount of time. Nothing renews and nothing is billed again.'}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {!loading && selectedPlan ? (
          <Card>
            <CardContent className="space-y-2 p-3">
              <p className="text-sm font-semibold">What are you paying from?</p>
              {checkoutNotice ? (
                <p role="status" className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  {checkoutNotice}
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2" aria-label="Where you are paying from">
                {pickerSources.map((source) => {
                  const sourceReady = readyRailIds.has(source.rail);
                  const eligibleApps = bitcoinEligibility?.products[selectedPlan.id];
                  const checkingMinimum = source.rail === 'btc_bitcoin' && source.sendingApp !== 'wallet' && bitcoinEligibility === null;
                  const belowMinimum = source.rail === 'btc_bitcoin' && source.sendingApp !== 'wallet'
                    && Boolean(eligibleApps && !eligibleApps.includes(CRYPTO_SENDING_APP_LABELS[source.sendingApp]));
                  const sourceSelected = (hasChosenSource || source.rail !== 'btc_bitcoin') && selectedSourceId === source.id
                    && (sourceReady || paymentOpen || paymentPaid);

                  return (
                    <button
                      key={source.id}
                      type="button"
                      aria-label={source.label}
                      aria-pressed={sourceSelected}
                      disabled={!sourceReady || checkoutSelectionLocked || checkingMinimum || belowMinimum || retryAt > clockMs}
                      className={`rounded-xl border px-2 py-2 text-center disabled:opacity-50 ${sourceSelected ? 'border-primary bg-primary/10' : 'border-border'}`}
                      onClick={() => void handleStartPayment(source)}
                    >
                      <span className="block text-sm font-medium">{source.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {belowMinimum ? `Minimum ${source.sendingApp === 'cash_app' ? '0.00005' : '0.001'} BTC` : checkingMinimum ? 'Checking minimum' : `${source.asset} · ${source.network}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {retryAt > clockMs ? <p role="status" className="text-xs text-muted-foreground">Try again in {Math.ceil((retryAt - clockMs) / 1000)}s</p> : null}
              {selectedPaymentSource.availabilityNote ? (
                <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  {selectedPaymentSource.availabilityNote}
                </p>
              ) : null}
              {!intent ? (
                <Accordion collapsible type="single">
                  <AccordionItem value="payment-instructions">
                    <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                      How to send this payment
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <CryptoPaymentMethodInstructions rail={selectedRail} sendingApp={selectedPaymentSource.sendingApp} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
              {/* Same gradient as the app's other primary actions. */}
              {starting || intent ? <Button
                className="h-12 w-full rounded-full text-base font-semibold text-white disabled:opacity-50"
                type="button"
                disabled={starting || !selectedRailReady || (paymentOpen && !locallyExpired) || paymentPaid}
                onClick={() => void handleStartPayment(selectedPaymentSource)}
                style={{ background: 'var(--cruush-logo)' }}
              >
                {starting
                  ? 'Starting…'
                  : paymentPaid
                    ? (isPulse ? 'Pulses added' : 'cruush+ active')
                    : paymentOpen && !locallyExpired
                    ? 'Payment started'
                    : locallyExpired
                      ? 'Start a fresh payment'
                    : `Get ${termLabel(selectedPlan).toLowerCase()} for ${formatPrice(selectedPlan.amountCents, selectedPlan.currency)}`}
              </Button> : null}

              {!visibleProcessorReady ? (
                <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  Crypto payment is not available yet. You can still earn cruush+ time through
                  check-ins and referrals.
                </p>
              ) : null}

              {intent ? (
                <div aria-live="polite" className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">
                    {locallyExpired ? statusCopy.expired : statusCopy[intent.status]}
                  </p>
                  {intent.asset !== 'BTC' && Number.isInteger(intent.confirmations) && Number.isInteger(intent.confirmationTarget) && intent.confirmationTarget! > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {intent.confirmations}/{intent.confirmationTarget} confirmations
                      {intent.paymentAmountReceived === false && intent.confirmations! > 0 ? ' · Full payment not yet received' : ''}
                    </p>
                  ) : null}
                  {statusError ? <p className="text-xs text-destructive">{statusError}</p> : null}
                  {intent.asset === 'BTC' && ['awaiting_payment', 'confirming', 'paid'].includes(intent.status) ? (
                    <ol aria-label="Payment progress" className="space-y-1 text-xs text-muted-foreground">
                      <li>{intent.status === 'awaiting_payment' ? 'Awaiting payment' : 'Payment detected'}</li>
                      <li>{(intent.confirmations ?? 0) > 0 ? 'On the Bitcoin blockchain' : intent.status === 'confirming' ? 'Waiting for the first block' : 'Waiting for Bitcoin'}</li>
                      <li>{Math.min(intent.confirmations ?? 0, 6)}/6 confirmations</li>
                      <li>{intent.status === 'paid' ? 'Purchase completed' : 'Purchase activates at 6 confirmations'}</li>
                    </ol>
                  ) : null}
                  {!paymentWindowClosed && intent.expiresAt && isOpenCryptoPayment(intent.status) ? (
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Protected order</p>
                      <p className="mt-1 text-sm font-semibold">
                        Order timer: {formatPaymentTimeRemaining(intent.expiresAt, clockMs)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        This address is unique to your order. Send the exact amount in {intent.asset} on{' '}
                        {CRYPTO_NETWORK_LABELS[intent.network]} and allow time for it to arrive on-chain before the timer reaches 0. Network confirmation can finish afterward.
                      </p>
                    </div>
                  ) : null}
                  {intent.paymentAddress && intent.quotedAmountAtomic && isOpenCryptoPayment(intent.status) && !paymentWindowClosed ? (
                    <div className="space-y-3">
                      <div>
                        {intent.fundingEstimates?.length ? (
                          <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                            {intent.fundingEstimates.map(estimate => (
                              <p key={estimate.app}>
                                {estimate.meetsSendingMinimum === false ? (
                                  <>{estimate.app}: this order is below its {formatUsdcAtomic(estimate.minimumSendAtomic!, intent.asset)} {intent.asset} sending minimum. Choose another method before buying.</>
                                ) : intent.rail === 'usdc_arbitrum' ? (
                                  <>Cash App: have about {formatPrice(estimate.availableUsdCents)} available, including a {formatPrice(estimate.allowanceUsdCents)} sending-fee allowance. Cash App converts your dollar payment to USDC.</>
                                ) : (
                                  <>{estimate.app}: have about {formatUsdcAtomic(estimate.availableAtomic, intent.asset)} {intent.asset} available ({formatPrice(estimate.availableUsdCents)}), including a {formatPrice(estimate.allowanceUsdCents)} sending-fee allowance. Buy only what you still need.</>
                                )}
                              </p>
                            ))}
                            <p>Send only the exact amount below. Your app charges its sending fee separately; unused crypto stays in your balance. Fees can change, so check the app’s final total.</p>
                          </div>
                        ) : null}
                        {(intent.gasFeeUsdCents ?? 0) > 0 ? (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            cruush processing fee: {formatPrice(intent.gasFeeUsdCents!, 'USD')} (included)
                            <Tooltip open={gasFeeHelpOpen} onOpenChange={setGasFeeHelpOpen}>
                              <TooltipTrigger asChild>
                                <button type="button" aria-label="About the processing fee" className="inline-flex items-center justify-center rounded-full p-1 focus-visible:outline focus-visible:outline-2" onClick={() => setGasFeeHelpOpen(true)}>
                                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[min(18rem,calc(100vw-2rem))]" side="top" sideOffset={4}>
                                Covers the estimated network cost of automatically forwarding your payment to cruush’s main wallet, including any required gas-funding transfer. Your app’s sending fee is separate.
                              </TooltipContent>
                            </Tooltip>
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">Send exactly</p>
                        <p className="text-xl font-semibold">
                          {formatUsdcAtomic(intent.quotedAmountAtomic, intent.asset)} {intent.asset}
                        </p>
                        <p className="text-xs text-muted-foreground">on {CRYPTO_NETWORK_LABELS[intent.network]} to this address</p>
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
                      <Button className="w-full" type="button" variant="outline" onClick={() => void handleCopyAmount()}>
                        {amountCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {amountCopied ? 'Amount copied' : 'Copy amount'}
                      </Button>
                      {intent.paymentUri ? (
                        <Button className="w-full" variant="outline" asChild>
                          <a href={selectedPaymentSource.sendingApp === 'wallet' ? intent.paymentUri : BITCOIN_APP_LINKS[selectedPaymentSource.sendingApp]} target={selectedPaymentSource.sendingApp === 'wallet' ? undefined : '_blank'} rel="noopener noreferrer">
                            {selectedPaymentSource.sendingApp === 'wallet' ? 'Open wallet' : `Open ${selectedPaymentSource.label}`}
                          </a>
                        </Button>
                      ) : null}
                      <p className="text-xs leading-5 text-muted-foreground">
                        Send only {intent.asset} on {CRYPTO_NETWORK_LABELS[intent.network]} to this address. Another asset or network may be lost.
                      </p>
                      <div>
                        <p className="mb-2 text-sm font-semibold">How to send it</p>
                        <CryptoPaymentMethodInstructions rail={selectedRail} sendingApp={selectedPaymentSource.sendingApp} />
                      </div>
                    </div>
                  ) : null}
                  {!locallyExpired ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Checkout updates when your payment is detected and confirmed. {isPulse ? 'Your Pulses are added' : 'Your time is added'} after confirmation. Leaving this page does not cancel your order; return here to check its status.
                    </p>
                  ) : null}
                  {paymentOpen && !locallyExpired && intent.status !== 'confirming' ? (
                    cancelAction ? (
                      <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                        <p className="text-xs leading-5 text-foreground">
                          Only cancel if you have not sent payment. Blockchain transfers cannot be stopped,
                          and funds sent to this address after cancellation will not activate this order automatically.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={cancelling}
                            onClick={() => setCancelAction(null)}
                          >
                            Keep order
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={cancelling}
                            onClick={() => void handleCancelPayment()}
                          >
                            {cancelling
                              ? 'Cancelling…'
                              : cancelAction === 'change'
                                ? 'Cancel and choose another method'
                                : 'Cancel order'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button type="button" variant="outline" onClick={() => setCancelAction('change')}>
                          Change payment method
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setCancelAction('cancel')}>
                          Cancel order
                        </Button>
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}


        <Card>
          <Accordion collapsible type="single">
            <AccordionItem value="why-crypto">
              <AccordionTrigger className="px-4 py-3 text-base hover:no-underline">
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
                  {selectedRail === 'btc_bitcoin'
                    ? 'Pay with Bitcoin from Cash App, PayPal, Venmo or a compatible wallet. '
                    : selectedRailReady ? 'Cash App pays with USDC on Arbitrum. PayPal pays with PYUSD on Arbitrum. ' : ''}
                  {isPulse ? 'You pay once for the Pulse pack you choose.' : 'You pay once for the cruush+ time you choose.'} Nothing renews automatically.
                </p>
                <p>
                  Each checkout gives you a fresh payment address and clear payment status.
                </p>
                <p>cruush never asks for your wallet private key or seed phrase.</p>
                <a
                  className="inline-flex font-semibold text-primary underline underline-offset-4"
                  href="/blog/crypto-first.html"
                >
                  Crypto first. On our terms.
                </a>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4 text-sm leading-6 text-muted-foreground">
            <h2 className="text-base font-semibold text-foreground">Billing policy</h2>
            <p>
              One-time purchase. Nothing renews automatically. Purchases are final and non-refundable
              except where applicable law requires a withdrawal, refund, remedy, or forced reversal.
            </p>
            <a className="font-medium text-foreground underline underline-offset-4" href="/billing-policy">
              Read the billing policy
            </a>
            <a className="block font-medium text-foreground underline underline-offset-4" href="/support?refund=1">
              Request a legally required refund review
            </a>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
