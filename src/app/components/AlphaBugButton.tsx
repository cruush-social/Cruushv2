import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { Bug, CheckCircle2 } from 'lucide-react';
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

const ALPHA_BUG_TIP_STORAGE_KEY = 'cruush:alpha-bug-tip-seen';

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

function getBugButtonPlacement(pathname: string) {
  if (pathname.startsWith('/chat/')) {
    return 'right-4 bottom-[calc(19rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-auto sm:top-[calc(0.75rem+env(safe-area-inset-top))]';
  }

  return 'right-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-auto sm:top-[calc(0.75rem+env(safe-area-inset-top))]';
}

function getBugTipPlacement(pathname: string) {
  if (pathname.startsWith('/chat/')) {
    return 'right-4 bottom-[calc(22.25rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-auto sm:top-[calc(4.5rem+env(safe-area-inset-top))]';
  }

  return 'right-4 bottom-[calc(10rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-auto sm:top-[calc(4.5rem+env(safe-area-inset-top))]';
}

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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState('');
  const [showTip, setShowTip] = useState(false);
  const pageUrl = useMemo(() => getCurrentPageUrl(), [open]);

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
      return;
    }

    setStatus('submitting');
    setError('');

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
      setStatus('idle');
    }
  };

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
        <div className={`cruush-glass-panel fixed z-30 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-primary/25 bg-background/95 p-3 text-center text-sm text-foreground shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md ${getBugTipPlacement(location.pathname)}`}>
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
      <DialogTrigger asChild>
        <button
          aria-label="Report alpha bug"
          className={`cruush-glass-pill fixed z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-background/88 text-white shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${getBugButtonPlacement(location.pathname)}`}
          type="button"
        >
          <Bug className="h-5 w-5" />
        </button>
      </DialogTrigger>
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
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
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
