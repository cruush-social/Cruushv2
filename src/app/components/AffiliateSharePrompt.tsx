import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Clipboard, Gift, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import CruushPlusWord from './CruushPlusWord';
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
import { getRewardSummary, type RewardSummary } from '../lib/rewardsApi';
import { dismissUserNotice, getUserNoticeDismissal } from '../lib/userNoticesApi';

const AFFILIATE_SHARE_PROMPT_NOTICE_KEY = 'cruush:post-onboarding-affiliate-share-seen';

type AffiliateSharePromptProps = {
  userId: string;
};

function noticeKey(userId: string) {
  return `${AFFILIATE_SHARE_PROMPT_NOTICE_KEY}:${userId}`;
}

function dialogKey(userId: string) {
  return `affiliate-share-prompt:${userId}`;
}

export default function AffiliateSharePrompt({ userId }: AffiliateSharePromptProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const activeDialogKey = dialogKey(userId);

  const markSeen = () => {
    const key = noticeKey(userId);
    setPersistentNoticeFlag(key);
    void dismissUserNotice(key).catch(() => {});
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;
    const key = noticeKey(userId);
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
      .then(async (notice) => {
        if (!isMounted) {
          return;
        }

        if (notice.dismissed) {
          setPersistentNoticeFlag(key);
          setOpen(false);
          return;
        }

        const rewardSummary = await getRewardSummary();

        if (!isMounted) {
          return;
        }

        if (!rewardSummary.referrals.link) {
          setOpen(false);
          return;
        }

        setSummary(rewardSummary);
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

  const copyLink = async () => {
    if (!summary?.referrals.link) {
      return;
    }

    await navigator.clipboard.writeText(summary.referrals.link);
    toast.success('Affiliate link copied.');
    close();
  };

  const shareLink = async () => {
    if (!summary?.referrals.link || !('share' in navigator)) {
      return;
    }

    try {
      await navigator.share({
        title: 'Join me on cruush',
        text: 'Join me on cruush.',
        url: summary.referrals.link,
      });
      close();
    } catch {
      // Closing the native share sheet without sharing should keep the prompt usable.
    }
  };

  const openRewards = () => {
    close();
    navigate('/rewards');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm rounded-lg border-white/10 bg-background">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Share your affiliate link</DialogTitle>
          {summary ? (
            <DialogDescription>
              Invite people you trust. You get {summary.rules.referralRewardDays} <CruushPlusWord /> days after
              they secure their account with 2FA, complete their profile, and reach{' '}
              {summary.rules.referralMinAccountAgeDays} days old.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {summary ? (
          <Input aria-label="Affiliate link" value={summary.referrals.link} readOnly />
        ) : null}

        <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:justify-stretch">
          <Button variant="outline" onClick={openRewards}>
            Open rewards
          </Button>
          <Button variant="ghost" onClick={close}>
            Not now
          </Button>
          <Button onClick={copyLink} style={{ background: 'var(--cruush-gradient)' }}>
            <Clipboard className="h-4 w-4" />
            Copy link
          </Button>
          {'share' in navigator ? (
            <Button variant="outline" onClick={shareLink}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
