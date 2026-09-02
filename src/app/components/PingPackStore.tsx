import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, Copy, Radio } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import {
  cancelCryptoPaymentIntent,
  getCryptoPaymentIntent,
  getCryptoProcessorStatus,
  isOpenCryptoPayment,
  type CryptoPaymentIntent,
  type CryptoPaymentRailId,
  type CryptoProcessorStatus,
} from '../lib/cryptoCheckoutApi';
import {
  createPingPackPaymentIntent,
  getCurrentPingPackPaymentIntent,
  getPingPacks,
  type PingPack,
  type PingPackId,
} from '../lib/pingPackApi';
import {
  CRYPTO_NETWORK_LABELS,
  CRYPTO_PAYMENT_SOURCES,
  CryptoPaymentMethodInstructions,
} from './CryptoPaymentMethods';

const PAYMENT_STATUS_COPY: Record<CryptoPaymentIntent['status'], string> = {
  pending: 'Setting up your payment.',
  awaiting_payment: 'Waiting for your payment to arrive.',
  confirming: 'Payment seen. Waiting for network confirmation.',
  paid: 'Payment confirmed. Your Pings are ready.',
  expired: 'This payment window expired. Do not send another payment if you already sent funds.',
  failed: 'Payment was not confirmed. No Pings were added.',
  cancelled: 'This payment was cancelled.',
  refunded: 'This payment was refunded.',
};

function formatPrice(amountCents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountCents / 100);
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `key-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function formatStablecoinAtomic(value: string | null) {
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

export default function PingPackStore() {
  const navigate = useNavigate();
  const [packs, setPacks] = useState<PingPack[]>([]);
  const [processor, setProcessor] = useState<CryptoProcessorStatus | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<PingPackId>('ping_10');
  const [selectedRail, setSelectedRail] = useState<CryptoPaymentRailId>('usdc_arbitrum');
  const [intent, setIntent] = useState<CryptoPaymentIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelAction, setCancelAction] = useState<'change' | 'cancel' | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const paymentAttemptRef = useRef<{
    packId: PingPackId;
    rail: CryptoPaymentRailId;
    idempotencyKey: string;
  } | null>(null);
  const pollStartedRef = useRef<{ intentId: string; startedAt: number } | null>(null);
  const cancelledIntentIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      getPingPacks(),
      getCryptoProcessorStatus().catch(() => null),
      getCurrentPingPackPaymentIntent().catch(() => null),
    ])
      .then(([catalog, cryptoStatus, currentIntent]) => {
        if (!active) {
          return;
        }

        setPacks(catalog.packs);
        setProcessor(cryptoStatus);
        if (
          currentIntent
          && currentIntent.productType === 'ping_pack'
          && isOpenCryptoPayment(currentIntent.status)
          && catalog.packs.some((pack) => pack.id === currentIntent.planId)
        ) {
          setIntent(currentIntent);
          setSelectedPackId(currentIntent.planId as PingPackId);
          setSelectedRail(currentIntent.rail);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load Ping packs.');
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

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) ?? null,
    [packs, selectedPackId],
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
  const selectedPaymentSource = CRYPTO_PAYMENT_SOURCES.find((source) => source.rail === selectedRail) ?? null;
  const visibleProcessorReady = readyVisibleSources.length > 0;
  const paymentOpen = intent ? isOpenCryptoPayment(intent.status) : false;
  const paymentPaid = intent?.status === 'paid';
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
  const checkoutSelectionLocked = starting || (paymentOpen && !locallyExpired) || paymentPaid;

  useEffect(() => {
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

  useEffect(() => {
    if (!intent?.expiresAt || !isOpenCryptoPayment(intent.status) || paymentWindowClosed) {
      return;
    }

    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [intent?.expiresAt, intent?.status, paymentWindowClosed]);

  useEffect(() => {
    if (locallyExpired) {
      paymentAttemptRef.current = null;
    }
  }, [locallyExpired]);

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
      : pollStarted.startedAt + 60 * 60 * 1000;

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

  const handleStartPayment = useCallback(async () => {
    if (!selectedPack || !selectedRailReady || starting || (paymentOpen && !locallyExpired) || paymentPaid) {
      return;
    }

    setStarting(true);
    setError(null);
    setStatusError(null);
    setCheckoutNotice(null);
    setCopied(false);

    try {
      const attempt = paymentAttemptRef.current?.packId === selectedPack.id
        && paymentAttemptRef.current.rail === selectedRail
        ? paymentAttemptRef.current
        : {
            packId: selectedPack.id,
            rail: selectedRail,
            idempotencyKey: createIdempotencyKey(),
          };
      paymentAttemptRef.current = attempt;
      const nextIntent = await createPingPackPaymentIntent(attempt);
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
  }, [locallyExpired, paymentOpen, paymentPaid, selectedPack, selectedRail, selectedRailReady, starting]);

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

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/85 p-4 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Buy Ping packs</h1>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-2 px-3 py-2">
        {error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-4 w-4 text-primary" />
              Keep extra Pings ready
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Purchased Pings never expire. Your included daily Pings are used first. Each activated Pulse lasts exactly 30 minutes.
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading Ping packs…
          </div>
        ) : null}

        {!loading && packs.length > 0 ? (
          <Card>
            <CardContent className="space-y-3 p-3">
              <p className="text-sm font-semibold">Choose a Ping pack</p>
              <div className="grid grid-cols-3 gap-2" aria-label="Ping pack prices">
                {packs.map((pack) => {
                  const selected = pack.id === selectedPackId;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={checkoutSelectionLocked}
                      className={`min-w-0 rounded-xl border px-2 py-3 text-center transition disabled:opacity-50 ${selected ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                      onClick={() => {
                        setSelectedPackId(pack.id);
                        setIntent(null);
                        setCopied(false);
                        paymentAttemptRef.current = null;
                      }}
                    >
                      <span className="block text-base font-semibold">{pack.pingCount}</span>
                      <span className="block text-xs text-muted-foreground">Pings</span>
                      <span className="mt-1 block text-sm font-semibold">{formatPrice(pack.amountCents, pack.currency)}</span>
                      {pack.id === 'ping_10' ? (
                        <span className="mt-1 block text-[10px] uppercase tracking-wide text-primary">Popular</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!loading && selectedPack ? (
          <Card>
            <CardContent className="space-y-2 p-3">
              <p className="text-sm font-semibold">What are you paying from?</p>
              {checkoutNotice ? (
                <p role="status" className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  {checkoutNotice}
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2" aria-label="Where you are paying from">
                {CRYPTO_PAYMENT_SOURCES.map((source) => {
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
              {selectedPaymentSource?.availabilityNote ? (
                <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  {selectedPaymentSource.availabilityNote}
                </p>
              ) : null}
              {!intent ? (
                <Accordion collapsible type="single">
                  <AccordionItem className="border-0" value="payment-instructions">
                    <AccordionTrigger className="py-2 text-xs hover:no-underline">
                      How to send this payment
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <CryptoPaymentMethodInstructions rail={selectedRail} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
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
                    ? 'Pings added'
                    : paymentOpen && !locallyExpired
                      ? 'Payment started'
                      : locallyExpired
                        ? 'Start a fresh payment'
                        : `Buy ${selectedPack.pingCount} Pings for ${formatPrice(selectedPack.amountCents, selectedPack.currency)}`}
              </Button>

              {!visibleProcessorReady ? (
                <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs leading-4 text-muted-foreground">
                  Crypto payment is not available yet.
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
                        {CRYPTO_NETWORK_LABELS[intent.network]} that arrives on-chain before the timer reaches 0 can count toward it.
                      </p>
                    </div>
                  ) : null}
                  {intent.paymentAddress && intent.quotedAmountAtomic && isOpenCryptoPayment(intent.status) && !paymentWindowClosed ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Send exactly</p>
                        <p className="text-xl font-semibold">
                          {formatStablecoinAtomic(intent.quotedAmountAtomic)} {intent.asset}
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
                      <p className="text-xs leading-5 text-muted-foreground">
                        Send only {intent.asset} on {CRYPTO_NETWORK_LABELS[intent.network]} to this address. Another asset or network may be lost.
                      </p>
                      <div>
                        <p className="mb-2 text-sm font-semibold">How to send it</p>
                        <CryptoPaymentMethodInstructions rail={selectedRail} />
                      </div>
                    </div>
                  ) : null}
                  {!locallyExpired ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Your Pings are added once the payment settles on the network. Leaving this page does not cancel it. Return here to see the same active payment.
                    </p>
                  ) : null}
                  {paymentOpen && !locallyExpired && intent.status !== 'confirming' ? (
                    cancelAction ? (
                      <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                        <p className="text-xs leading-5 text-foreground">
                          Only cancel if you have not sent payment. Blockchain transfers cannot be stopped, and funds sent to this address after cancellation will not activate this order automatically.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button type="button" variant="outline" disabled={cancelling} onClick={() => setCancelAction(null)}>
                            Keep order
                          </Button>
                          <Button type="button" variant="destructive" disabled={cancelling} onClick={() => void handleCancelPayment()}>
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
          <CardContent className="space-y-2 p-4 text-xs leading-5 text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">Billing policy</h2>
            <p>
              One-time purchase. Purchased Pings never expire, and each activated Pulse lasts 30 minutes. Purchases are final and non-refundable except where applicable law requires a withdrawal, refund, remedy, or forced reversal.
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
