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
import './BetaLaunchCruushPlusOffer.css';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';
import { claimBetaLaunchCruushPlus } from '../lib/rewardsApi';
import { markNoticeDismissed, resolveNoticeDismissal } from '../lib/userNoticesApi';

const BETA_LAUNCH_OFFER_STORAGE_KEY = 'cruush:beta-launch-plus-offer-seen';

type BetaLaunchCruushPlusOfferProps = {
  userId: string;
};

export function offerStorageKey(userId: string) {
  return `${BETA_LAUNCH_OFFER_STORAGE_KEY}:${userId}`;
}

function dialogKey(userId: string) {
  return `beta-launch-plus-offer:${userId}`;
}

export default function BetaLaunchCruushPlusOffer({ userId }: BetaLaunchCruushPlusOfferProps) {
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState('');
  const activeDialogKey = dialogKey(userId);

  const [noticeOffline, setNoticeOffline] = useState(false);

  const markSeen = (offline = noticeOffline) => {
    markNoticeDismissed(offerStorageKey(userId), { offline });
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

    const openWhenAvailable = (offline: boolean) => {
      clearDialogWaiter();

      if (!isMounted) {
        return;
      }

      if (acquireOneTimeDialog(activeDialogKey)) {
        markSeen(offline);
        setOpen(true);
        return;
      }

      removeDialogWaiter = onOneTimeDialogReleased(() => openWhenAvailable(offline));
    };

    void resolveNoticeDismissal(key).then((notice) => {
      if (!isMounted) {
        return;
      }

      setNoticeOffline(notice.offline);

      if (notice.dismissed) {
        setOpen(false);
        return;
      }

      openWhenAvailable(notice.offline);
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
      setClaimed(true);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to activate cruush+.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="beta-launch-plus-dialog max-w-sm rounded-lg" dismissible={false}>
        <div className="beta-launch-plus-card-scene">
          <div className="beta-launch-plus-card" data-testid="beta-launch-cruush-plus-card">
            <div className="beta-launch-plus-card__moire" />
            <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--base" />
            <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--drift" />
            <div className="beta-launch-plus-card__pattern beta-launch-plus-card__pattern--counter" />
            <div className="beta-launch-plus-card__flicker" />
            <div className="beta-launch-plus-card__shine" />
            <div className="beta-launch-plus-card__label" data-testid="beta-launch-cruush-plus-card-label">
              <div className="beta-launch-plus-card__label-bg" />
              <span className="beta-launch-plus-card__label-text">
                <CruushPlusWord />
              </span>
            </div>
          </div>
        </div>
        <DialogHeader>
          <DialogTitle className="beta-launch-plus-dialog__title">
            {claimed ? (
              <>
                <CruushPlusWord className="beta-launch-plus-dialog__inline-word" /> activated
              </>
            ) : (
              <>
                7-day <CruushPlusWord className="beta-launch-plus-dialog__inline-word" /> trial
              </>
            )}
          </DialogTitle>
          <DialogDescription className="beta-launch-plus-dialog__description">
            {claimed ? (
              'Your beta launch week is active. Press Done to close this card.'
            ) : (
              <>
                Everyone gets one free seven-day <CruushPlusWord className="beta-launch-plus-dialog__inline-word" /> trial on first login.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <DialogFooter className="beta-launch-plus-dialog__footer gap-2 sm:gap-2">
          {claimed ? (
            <Button onClick={close} style={{ background: 'var(--cruush-gradient)' }}>
              Done
            </Button>
          ) : (
            <Button
              disabled={claiming}
              onClick={handleClaim}
              style={{ background: 'var(--cruush-gradient)' }}
            >
              {claiming ? (
                'Activating...'
              ) : (
                <>
                  OK, activate{' '}
                  <CruushPlusWord className="beta-launch-plus-dialog__inline-word beta-launch-plus-dialog__button-word" />
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
