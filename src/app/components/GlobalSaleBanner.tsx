import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CRUUSH_PLUS_CHANGED_EVENT, getBillingPlans, getMyBillingStatus, type CruushPlusSale } from '../lib/billingApi';
import { SaleBanner } from './SaleCampaignBanner';

export default function GlobalSaleBanner({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [offer, setOffer] = useState<{ userId: string; sale: CruushPlusSale } | null>(null);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    const refresh = async () => {
      const currentRequest = ++requestId;
      setOffer(null);
      try {
        const [billing, catalog] = await Promise.all([getMyBillingStatus(), getBillingPlans()]);
        if (!active || currentRequest !== requestId) return;
        setOffer(billing.cruushPlus === false && catalog.sale ? { userId, sale: catalog.sale } : null);
      } catch {
        if (active && currentRequest === requestId) setOffer(null);
      }
    };
    void refresh();
    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, refresh);
    };
  }, [userId]);

  if (!offer || offer.userId !== userId) return null;
  return <SaleBanner percentOff={offer.sale.percentOff} endsAt={offer.sale.endsAt} onClick={() => navigate('/store')} />;
}
