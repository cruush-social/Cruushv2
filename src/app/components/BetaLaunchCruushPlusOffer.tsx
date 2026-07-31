import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import CruushPlusWord from './CruushPlusWord';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';
import { claimBetaLaunchCruushPlus } from '../lib/rewardsApi';

const BETA_LAUNCH_OFFER_STORAGE_KEY = 'cruush:beta-launch-plus-offer-seen';

type BetaLaunchCruushPlusOfferProps = {
  userId: string;
};

function offerStorageKey(userId: string) {
  return `${BETA_LAUNCH_OFFER_STORAGE_KEY}:${userId}`;
}

export default function BetaLaunchCruushPlusOffer({ userId }: BetaLaunchCruushPlusOfferProps) {
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');

  const markSeen = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(offerStorageKey(userId), 'true');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.localStorage.getItem(offerStorageKey(userId)) !== 'true') {
      markSeen();
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [userId]);

  const handleClaim = async () => {
    setClaiming(true);
    setError('');

    try {
      const claim = await claimBetaLaunchCruushPlus();
      window.dispatchEvent(new CustomEvent(CRUUSH_PLUS_CHANGED_EVENT, { detail: claim }));
      setOpen(false);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to activate cruush+.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm rounded-lg border-white/10 bg-background">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Beta launch gift</DialogTitle>
          <DialogDescription>
            Get one free week of <CruushPlusWord /> for the beta launch, active until August 7 at 12:00 AM.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            disabled={claiming}
            onClick={handleClaim}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            {claiming ? 'Activating...' : 'OK, activate cruush+'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
