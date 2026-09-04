import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { getSideQuests } from '../lib/rewardsApi';
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';

const SIDE_QUEST_PROMPT_STORAGE_KEY = 'cruush:side-quest-prompt-seen';
/** Only nudge once a day, so finishing quests never turns into nagging. */
const PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000;

type SideQuestPromptProps = {
  userId: string;
};

export function sideQuestPromptStorageKey(userId: string) {
  const day = Math.floor(Date.now() / PROMPT_INTERVAL_MS);
  return `${SIDE_QUEST_PROMPT_STORAGE_KEY}:${userId}:${day}`;
}

function dialogKey(userId: string) {
  return `side-quest-prompt:${userId}`;
}

export default function SideQuestPrompt({ userId }: SideQuestPromptProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const [rewardSummary, setRewardSummary] = useState('');
  const activeDialogKey = dialogKey(userId);

  useEffect(() => {
    let isMounted = true;
    let clearDialogWaiter: () => void = () => undefined;

    const openWhenFree = () => {
      if (!isMounted) return;

      if (acquireOneTimeDialog(activeDialogKey)) {
        setPersistentNoticeFlag(sideQuestPromptStorageKey(userId));
        setOpen(true);
        return;
      }

      clearDialogWaiter = onOneTimeDialogReleased(openWhenFree);
    };

    const start = () => {
      if (hasPersistentNoticeFlag(sideQuestPromptStorageKey(userId))) {
        return;
      }

      void getSideQuests()
        .then((sideQuests) => {
          if (!isMounted) return;

          // Only the quests already finished and waiting to be claimed. A quest
          // the member has not done yet is not something to interrupt them over.
          const claimable = sideQuests.quests.filter((quest) => quest.completed && !quest.claimed);

          if (claimable.length === 0 || !sideQuests.claimingAvailable) {
            return;
          }

          const pings = claimable
            .filter((quest) => quest.rewardKind === 'ping')
            .reduce((total, quest) => total + quest.rewardAmount, 0);
          const plusDays = claimable
            .filter((quest) => quest.rewardKind === 'cruush_plus_day')
            .reduce((total, quest) => total + quest.rewardAmount, 0);
          const parts = [
            pings > 0 ? `${pings} ${pings === 1 ? 'Ping' : 'Pings'}` : '',
            plusDays > 0 ? `${plusDays} ${plusDays === 1 ? 'day' : 'days'} of cruush+` : '',
          ].filter(Boolean);

          setReadyCount(claimable.length);
          setRewardSummary(parts.join(' and '));
          openWhenFree();
        })
        .catch(() => undefined);
    };

    start();

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

  const handleClaim = () => {
    close();
    navigate('/rewards');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm rounded-lg border-white/10 bg-background" data-testid="side-quest-prompt">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>
            {readyCount === 1 ? 'A Side Quest is ready to claim' : `${readyCount} Side Quests are ready to claim`}
          </DialogTitle>
          <DialogDescription>
            {rewardSummary ? `Claim to scratch off ${rewardSummary}.` : 'Claim to scratch off your reward.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>
            Later
          </Button>
          <Button
            onClick={handleClaim}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            Claim now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
