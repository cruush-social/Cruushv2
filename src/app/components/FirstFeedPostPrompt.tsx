import { useEffect, useState } from 'react';
import { useExclusivePopup } from '../lib/popupQueue';
import { useNavigate } from 'react-router';
import { MapPin } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  MAP_CONTROLS_TUTORIAL_COMPLETED_EVENT,
  MAP_CONTROLS_TUTORIAL_LEGACY_STORAGE_KEYS,
  MAP_CONTROLS_TUTORIAL_STORAGE_KEY,
} from './MapControlsTutorial';
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
import { dismissUserNotice, getUserNoticeDismissal, resolveAnyNoticeDismissal } from '../lib/userNoticesApi';

const FIRST_FEED_POST_STORAGE_KEY = 'cruush:first-feed-post-prompt-seen';

type FirstFeedPostPromptProps = {
  userId: string;
};

export function firstFeedPostPromptStorageKey(userId: string) {
  return `${FIRST_FEED_POST_STORAGE_KEY}:${userId}`;
}

function dialogKey(userId: string) {
  return `first-feed-post-prompt:${userId}`;
}

export default function FirstFeedPostPrompt({ userId }: FirstFeedPostPromptProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const activeDialogKey = dialogKey(userId);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;
    const key = firstFeedPostPromptStorageKey(userId);
    let removeDialogWaiter: (() => void) | null = null;

    const clearDialogWaiter = () => {
      removeDialogWaiter?.();
      removeDialogWaiter = null;
    };

    const markSeen = () => {
      setPersistentNoticeFlag(key);
      void dismissUserNotice(key).catch(() => {});
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

    const startPrompt = () => {
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
    };

    const startAfterTutorial = () => {
      void resolveAnyNoticeDismissal([
        MAP_CONTROLS_TUTORIAL_STORAGE_KEY,
        ...MAP_CONTROLS_TUTORIAL_LEGACY_STORAGE_KEYS,
      ]).then((tutorialNotice) => {
        if (isMounted && tutorialNotice.dismissed) {
          startPrompt();
        }
      });
    };

    startAfterTutorial();
    window.addEventListener(MAP_CONTROLS_TUTORIAL_COMPLETED_EVENT, startPrompt);

    return () => {
      isMounted = false;
      clearDialogWaiter();
      releaseOneTimeDialog(activeDialogKey);
      window.removeEventListener(MAP_CONTROLS_TUTORIAL_COMPLETED_EVENT, startPrompt);
    };
  }, [activeDialogKey, userId]);

  const close = () => {
    setOpen(false);
    releaseOneTimeDialog(activeDialogKey);
  };

  // Shares one slot with the other post-onboarding prompts, so a new account
  // never meets several stacked at once.
  const showing = useExclusivePopup('first-feed-post', open);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      releaseOneTimeDialog(activeDialogKey);
    }
  };

  const handleWritePost = () => {
    close();
    navigate('/feed?compose=1');
  };

  return (
    <Dialog open={showing} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm rounded-lg border-white/10 bg-background" data-testid="first-feed-post-prompt">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Say something to the block</DialogTitle>
          <DialogDescription>
            Your first local post tells nearby people you are around and what you are up for. You choose how long it stays up.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>
            Skip for now
          </Button>
          <Button
            onClick={handleWritePost}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            Write a post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
