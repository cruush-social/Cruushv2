import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import BugButtonSlot from './BugButtonSlot';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import { getCryptoOrderHistory, type CryptoOrder, type CryptoOrderHistory } from '../lib/cryptoCheckoutApi';
import { CRYPTO_SENDING_APP_LABELS } from './CryptoPaymentMethods';

const statusLabels: Record<CryptoOrder['status'], string> = {
  pending: 'Preparing payment', awaiting_payment: 'Awaiting payment', confirming: 'Confirming',
  paid: 'Payment confirmed', expired: 'Payment window closed', failed: 'Needs review',
  cancelled: 'Cancelled', refunded: 'Refunded',
};
const dollars = (cents: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : '';

export default function OrderHistory() {
  const navigate = useNavigate();
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const [history, setHistory] = useState<CryptoOrderHistory>({ orders: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    setLoading(true);
    setHistory({ orders: [], nextCursor: null });
    setError(null);
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await getCryptoOrderHistory(cursor);
        if (active) { setHistory(result); setError(null); }
      } catch {
        if (active) setError('Unable to refresh orders.');
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    // Expiry closes payment instructions, not access to the order's progress.
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, 15000);
    const onVisible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cursor]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl">Order history</h2>
        </div>
      
        <BugButtonSlot testId="order-history-bug-button-slot" />
      </header>

      <main className="mx-auto max-w-2xl space-y-3 p-4">
        {loading ? <LoadingCardSkeletons label="Loading orders" /> : null}
        {error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        ) : null}
        {!loading && !error && history.orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">No orders yet.</div>
        ) : null}
        {!loading && history.orders.map(order => (
          <section key={order.id} className="space-y-3 rounded-xl border border-border bg-card/80 p-3">
            <h3>{order.name}</h3>
            <p className="break-all text-xs text-muted-foreground">Order {order.id}</p>
            <p className="text-xs text-muted-foreground">{dateLabel(order.createdAt)}</p>
            <dl className="space-y-2 text-sm">
              <div><dt>Purchase</dt><dd>{dollars(order.amountUsdCents)}</dd></div>
              <div><dt>Processing fee</dt><dd>{dollars(order.gasFeeUsdCents ?? 0)}</dd></div>
              <div><dt>Order total</dt><dd>{dollars(order.totalUsdCents ?? order.amountUsdCents)} · {order.asset} ({order.network}){order.sendingApp ? ` · ${CRYPTO_SENDING_APP_LABELS[order.sendingApp]}` : ''}</dd></div>
              <div><dt>Payment</dt><dd>{statusLabels[order.status]}</dd></div>
              <div><dt>Activation</dt><dd>{order.activatedAt ? `Activated ${dateLabel(order.activatedAt)}` : 'Not activated'}</dd></div>
              {order.quotedAmountAtomic && order.confirmationTarget ? (
                <div aria-live="polite"><dt>Confirmations</dt><dd>{order.confirmations ?? 0}/{order.confirmationTarget}{order.paymentAmountReceived ? ' · Full payment detected' : ' · Full payment not yet detected'}</dd></div>
              ) : null}
              <div><dt>Payment deadline</dt><dd>{dateLabel(order.expiresAt)}</dd></div>
            </dl>
          </section>
        ))}
        <div className="flex items-center justify-between gap-3">
          {cursors.length > 1 ? <Button variant="outline" disabled={loading} onClick={() => setCursors(current => current.slice(0, -1))}>Newer orders</Button> : null}
          {history.nextCursor ? <Button variant="outline" disabled={loading} onClick={() => setCursors(current => [...current, history.nextCursor!])}>Older orders</Button> : null}
        </div>
      </main>
    </div>
  );
}
