import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Eye } from 'lucide-react';
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
  DL_MODE_DEFAULT_NOTICE_KEY,
  markDlModeDefaultNoticeSeen,
  setDlModeEnabled,
  shouldShowDlModeDefaultNotice,
} from '../lib/dlMode';
import { dismissUserNotice, getUserNoticeDismissal } from '../lib/userNoticesApi';

export default function DlModeDefaultNotice() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!location.pathname.startsWith('/map')) {
      return;
    }

    let isMounted = true;

    if (!shouldShowDlModeDefaultNotice()) {
      void dismissUserNotice(DL_MODE_DEFAULT_NOTICE_KEY).catch(() => {});
      setOpen(false);
      return;
    }

    getUserNoticeDismissal(DL_MODE_DEFAULT_NOTICE_KEY)
      .then((notice) => {
        if (!isMounted) {
          return;
        }

        if (notice.dismissed) {
          markDlModeDefaultNoticeSeen();
          setOpen(false);
          return;
        }

        setDlModeEnabled(true);
        markDlModeDefaultNoticeSeen();
        void dismissUserNotice(DL_MODE_DEFAULT_NOTICE_KEY).catch(() => {});
        setOpen(true);
      })
      .catch(() => {
        if (isMounted) {
          setOpen(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  const closeNotice = () => {
    setOpen(false);
    markDlModeDefaultNoticeSeen();
    void dismissUserNotice(DL_MODE_DEFAULT_NOTICE_KEY).catch(() => {});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeNotice();
        }
      }}
    >
      <DialogContent className="max-w-sm rounded-lg border-white/10 bg-background">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.045]">
            <Eye className="h-5 w-5 text-primary" strokeWidth={2.35} />
          </div>
          <DialogTitle>DL Mode</DialogTitle>
          <DialogDescription>
            DL Mode starts on by default. Tap the eye in the top map menu to turn it on or off; when it is on, NSFW images stay behind gradients.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            className="w-full"
            onClick={closeNotice}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
