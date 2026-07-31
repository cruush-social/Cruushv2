import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
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
  markDlModeDefaultNoticeSeen,
  setDlModeEnabled,
  shouldShowDlModeDefaultNotice,
} from '../lib/dlMode';

export default function DlModeDefaultNotice() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldShowDlModeDefaultNotice()) {
      setDlModeEnabled(true);
      markDlModeDefaultNoticeSeen();
      setOpen(true);
    }
  }, []);

  const closeNotice = () => {
    setOpen(false);
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
          <DialogTitle>DL Mode is on</DialogTitle>
          <DialogDescription>
            NSFW images are hidden behind gradients. Turning DL Mode off shows NSFW images in profile photos, messages, and saved image previews.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={closeNotice}>
            Keep on
          </Button>
          <Button
            onClick={() => {
              closeNotice();
              navigate('/privacy/dl-mode');
            }}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            DL Mode settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
