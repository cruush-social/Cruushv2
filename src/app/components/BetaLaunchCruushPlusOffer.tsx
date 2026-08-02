import { useEffect, useState } from 'react';
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
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
import { claimBetaLaunchCruushPlus } from '../lib/rewardsApi';
import { dismissUserNotice, getUserNoticeDismissal } from '../lib/userNoticesApi';
import './BetaLaunchCruushPlusOffer.css';

const BETA_LAUNCH_OFFER_STORAGE_KEY = 'cruush:beta-launch-plus-offer-seen';

type BetaLaunchCruushPlusOfferProps = {
  userId: string;
};

function offerStorageKey(userId: string) {
  return `${BETA_LAUNCH_OFFER_STORAGE_KEY}:${userId}`;
}

function dialogKey(userId: string) {
  return `beta-launch-plus-offer:${userId}`;
}

function BetaLaunchCruushPlusCard() {
  return (
    <div className="beta-launch-plus-card-scene" aria-hidden="true">
      <div className="beta-launch-plus-card" data-testid="beta-launch-cruush-plus-card">
        <div className="beta-launch-plus-card__moire" />
        <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--base" />
        <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--drift" />
        <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--counter" />
        <div className="beta-launch-plus-card__flicker" />
        <div className="beta-launch-plus-card__shine" />
        <div className="beta-launch-plus-card__label">
          <div className="beta-launch-plus-card__label-bg" />
          <span className="beta-launch-plus-card__label-text" data-testid="beta-launch-cruush-plus-card-label">
            <CruushPlusWord />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function BetaLaunchCruushPlusOffer({ userId }: BetaLaunchCruushPlusOfferProps) {
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const activeDialogKey = dialogKey(userId);

  const markSeen = () => {
    const key = offerStorageKey(userId);
    setPersistentNoticeFlag(key);
    void dismissUserNotice(key).catch(() => {});
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;
    const key = offerStorageKey(userId);
    let removeDialogWaiter: (() => void) | null = null;

    const clearDialogWaiter = () => {
      removeDialogWaiter?.();
      removeDialogWaiter = null;
    };

    const openWhenAvailable = () => {
      clearDialogWaiter();

      if (!isMounted) {
        return;
      }

      if (acquireOneTimeDialog(activeDialogKey)) {
        markSeen();
        setOpen(true);
        return;
      }

      removeDialogWaiter = onOneTimeDialogReleased(openWhenAvailable);
    };

    if (hasPersistentNoticeFlag(key)) {
      void dismissUserNotice(key).catch(() => {});
      setOpen(false);
      return;
    }

    getUserNoticeDismissal(key)
      .then((notice) => {
        if (!isMounted) {
          return;
        }

        if (notice.dismissed) {
          setPersistentNoticeFlag(key);
          setOpen(false);
          return;
        }

        openWhenAvailable();
      })
      .catch(() => {
        if (isMounted) {
          setOpen(false);
        }
      });

    return () => {
      isMounted = false;
      clearDialogWaiter();
      releaseOneTimeDialog(activeDialogKey);
    };
  }, [activeDialogKey, userId]);

  const close = () => {
    setOpen(false);
    releaseOneTimeDialog(activeDialogKey);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      releaseOneTimeDialog(activeDialogKey);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    setError('');

    try {
      const claim = await claimBetaLaunchCruushPlus();
      window.dispatchEvent(new CustomEvent(CRUUSH_PLUS_CHANGED_EVENT, { detail: claim }));
      close();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to activate cruush+.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="beta-launch-plus-dialog max-w-sm rounded-lg border-white/10 bg-background">
        <DialogHeader className="items-center text-center sm:text-center">
          <BetaLaunchCruushPlusCard />
          <DialogTitle className="beta-launch-plus-dialog__title">
            7-day <CruushPlusWord /> trial
          </DialogTitle>
          <DialogDescription className="beta-launch-plus-dialog__description">
            Claim one free week of <CruushPlusWord /> for the beta launch, active until August 7 at 12:00 AM.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <DialogFooter className="beta-launch-plus-dialog__footer gap-2 sm:gap-2">
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
