import { useEffect, useState } from 'react';
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
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
import { dismissUserNotice, getUserNoticeDismissal } from '../lib/userNoticesApi';

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

  const handleWritePost = () => {
    close();
    navigate('/feed');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm rounded-lg border-white/10 bg-background" data-testid="first-feed-post-prompt">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Say something to the block</DialogTitle>
          <DialogDescription>
            Your first local post tells nearby people you are around and what you are up for. Posts expire on their own, so keep it short.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>
            Later
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
