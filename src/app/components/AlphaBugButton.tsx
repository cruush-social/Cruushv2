import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Bug, CheckCircle2 } from 'lucide-react';
import { ApiClientError } from '../lib/apiClient';
import { getBugButtonSlot, subscribeToBugButtonSlot } from '../lib/bugButtonSlot';
import { createSupportRequest } from '../lib/supportApi';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
import { dismissUserNotice, getUserNoticeDismissal } from '../lib/userNoticesApi';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

type AlphaBugButtonProps = {
  enabled?: boolean;
};

export const ALPHA_BUG_TIP_STORAGE_KEY = 'cruush:alpha-bug-tip-seen';

type ScreenshotAttachment = {
  filename: string;
  contentType: 'image/jpeg';
  contentBase64: string;
};

function getCurrentPageUrl() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return `${window.location.pathname}${window.location.search}` || '/';
}

// Wherever the bottom nav renders, the button docks into it and these do not apply. They
// are the fallback for the handful of signed-out routes that have no nav - the verify-email
// and reset-password cards - where the top-right corner is empty on every viewport.
const FALLBACK_BUTTON_PLACEMENT =
  'right-4 top-[calc(0.75rem+env(safe-area-inset-top))]';
const FALLBACK_TIP_PLACEMENT =
  'right-4 top-[calc(4.5rem+env(safe-area-inset-top))]';
// Sits directly above the nav band, anchored to the docked button. One-time coach mark,
// dismissed on first tap or on opening the dialog.
const DOCKED_TIP_PLACEMENT =
  'right-3 bottom-[calc(16.5rem+env(safe-area-inset-bottom))]';

function waitForVideoMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Screenshot timed out.')), 5000);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Screenshot failed.'));
    };
  });
}

async function captureBugScreenshot(): Promise<ScreenshotAttachment | undefined> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return undefined;
  }

  const mediaDevices = navigator.mediaDevices as (MediaDevices & {
    getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
  }) | undefined;

  if (typeof mediaDevices?.getDisplayMedia !== 'function') {
    return undefined;
  }

  let stream: MediaStream | null = null;

  try {
    stream = await mediaDevices.getDisplayMedia({
      audio: false,
      video: true,
    });
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await waitForVideoMetadata(video);
    await video.play();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const scale = Math.min(1, 1280 / sourceWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');

    if (!context) {
      return undefined;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    const contentBase64 = dataUrl.split(',')[1] ?? '';

    if (!contentBase64) {
      return undefined;
    }

    return {
      filename: `alpha-bug-${Date.now()}.jpg`,
      contentType: 'image/jpeg',
      contentBase64,
    };
  } catch {
    return undefined;
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export default function AlphaBugButton({ enabled = false }: AlphaBugButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [showTip, setShowTip] = useState(false);
  const pageUrl = useMemo(() => getCurrentPageUrl(), [open]);
  // useSyncExternalStore, not useState+useEffect: the nav registers its slot during the
  // same commit, before any effect runs, so a state initializer read at render time
  // always saw null and the button fell back to floating over the page.
  const buttonSlot = useSyncExternalStore(subscribeToBugButtonSlot, getBugButtonSlot, () => null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    if (hasPersistentNoticeFlag(ALPHA_BUG_TIP_STORAGE_KEY)) {
      void dismissUserNotice(ALPHA_BUG_TIP_STORAGE_KEY).catch(() => {});
      setShowTip(false);
      return;
    }

    getUserNoticeDismissal(ALPHA_BUG_TIP_STORAGE_KEY)
      .then((notice) => {
        if (!isMounted) {
          return;
        }

        if (notice.dismissed) {
          setPersistentNoticeFlag(ALPHA_BUG_TIP_STORAGE_KEY);
          setShowTip(false);
          return;
        }

        setPersistentNoticeFlag(ALPHA_BUG_TIP_STORAGE_KEY);
        void dismissUserNotice(ALPHA_BUG_TIP_STORAGE_KEY).catch(() => {});
        setShowTip(true);
      })
      .catch(() => {
        if (isMounted) {
          setShowTip(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const dismissTip = () => {
    setShowTip(false);

    setPersistentNoticeFlag(ALPHA_BUG_TIP_STORAGE_KEY);
    void dismissUserNotice(ALPHA_BUG_TIP_STORAGE_KEY).catch(() => {});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (message.trim().length < 10) {
      setError('Add a few more details before sending.');
      setErrorCode('BUG_REPORT_TOO_SHORT');
      return;
    }

    setStatus('submitting');
    setError('');
    setErrorCode('');

    try {
      const screenshot = await captureBugScreenshot();
      await createSupportRequest({
        category: 'bug',
        subject: `Alpha bug: ${pageUrl}`,
        message: message.trim(),
        source: 'unknown',
        pageUrl,
        ...(screenshot ? { screenshot } : {}),
      });
      setStatus('success');
      setMessage('');
    } catch (bugError) {
      setError(bugError instanceof Error ? bugError.message : 'Unable to send this bug report.');
      setErrorCode(bugError instanceof ApiClientError ? bugError.code : 'BUG_REPORT_SUBMIT_FAILED');
      setStatus('idle');
    }
  };

  const trigger = (
    <DialogTrigger asChild>
      <button
        aria-label="Report alpha bug"
        className={buttonSlot
          ? 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-background/68 text-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          : `fixed z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-background/88 text-white shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${FALLBACK_BUTTON_PLACEMENT}`}
        data-testid="alpha-bug-button"
        title="Report a bug"
        type="button"
      >
        <Bug className="h-5 w-5" />
      </button>
    </DialogTrigger>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          dismissTip();
        }
        if (!nextOpen) {
          setError('');
          setStatus('idle');
        }
      }}
    >
      {showTip ? (
        <div
          className={`fixed z-30 w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-primary/25 bg-background/95 p-3 text-center text-sm text-foreground shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md ${
            buttonSlot ? DOCKED_TIP_PLACEMENT : FALLBACK_TIP_PLACEMENT
          }`}
          data-testid="alpha-bug-tip"
        >
          <p className="leading-snug">Alpha test: tap the bug icon to report anything broken.</p>
          <button
            className="mt-2 text-xs font-semibold text-primary"
            onClick={dismissTip}
            type="button"
          >
            Got it
          </button>
        </div>
      ) : null}
      {buttonSlot && typeof document !== 'undefined' ? createPortal(trigger, buttonSlot) : trigger}
      <DialogContent className="max-w-md rounded-lg border-white/10 bg-background">
        <DialogHeader>
          <DialogTitle>Report alpha bug</DialogTitle>
          <DialogDescription>
            This report includes the current page and attaches a screenshot when your browser allows it.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-muted-foreground">
          Reporting from <span className="font-semibold text-foreground">{pageUrl}</span>
        </div>

        {status === 'success' ? (
          <div className="rounded-md border border-primary/25 bg-primary/10 p-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Bug report sent</span>
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setStatus('idle')}>
              Send another
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="bug-report-error" role="alert">
                <p>{error}</p>
                <p className="mt-1 font-mono text-xs">Error code: {errorCode || 'BUG_REPORT_UNKNOWN'}</p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="alpha-bug-message">What broke?</Label>
              <Textarea
                className="min-h-[132px] bg-input-background"
                disabled={status === 'submitting'}
                id="alpha-bug-message"
                maxLength={4000}
                minLength={10}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened, what you expected, and anything visible in your screenshot."
                required
                value={message}
              />
              <p className="text-right text-xs text-muted-foreground">{message.length}/4000</p>
            </div>
            <Button
              className="w-full"
              disabled={status === 'submitting'}
              style={{ background: 'var(--cruush-gradient)' }}
              type="submit"
            >
              {status === 'submitting' ? 'Sending...' : 'Send bug report'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
