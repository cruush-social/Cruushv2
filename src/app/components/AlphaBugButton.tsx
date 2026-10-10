import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { Bug, CheckCircle2 } from 'lucide-react';
import { getBugButtonSlot, subscribeToBugButtonSlot } from '../lib/bugButtonSlot';
import { createSupportRequest } from '../lib/supportApi';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
import { dismissUserNotice, getUserNoticeDismissal } from '../lib/userNoticesApi';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

type AlphaBugButtonProps = {
  enabled?: boolean;
  requireContactEmail?: boolean;
};

export const ALPHA_BUG_TIP_STORAGE_KEY = 'cruush:alpha-bug-tip-seen';

type ScreenshotAttachment = {
  filename: string;
  contentType: 'image/jpeg';
  contentBase64: string;
};

type NavigatorUserAgentData = {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    platform?: string;
    platformVersion?: string;
    mobile?: boolean;
  }>;
};

async function getBugDeviceContext() {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const userAgentData = (navigator as Navigator & { userAgentData?: NavigatorUserAgentData }).userAgentData;
  let highEntropy: Awaited<ReturnType<NonNullable<NavigatorUserAgentData['getHighEntropyValues']>>> = {};

  if (typeof userAgentData?.getHighEntropyValues === 'function') {
    highEntropy = await userAgentData
      .getHighEntropyValues(['platform', 'platformVersion'])
      .catch(() => ({}));
  }

  const platform = highEntropy.platform?.trim()
    || userAgentData?.platform?.trim()
    || navigator.platform?.trim()
    || undefined;
  const browser = /(?:Edg|Chrome|Firefox|Safari)\//.exec(navigator.userAgent)?.[0]?.replace('/', '') || undefined;
  const mobile = highEntropy.mobile ?? userAgentData?.mobile;

  if (!platform && !browser && mobile === undefined) {
    return undefined;
  }

  return { platform, browser, appVersion: import.meta.env.VITE_APP_VERSION || undefined, mobile };
}

function getCurrentPageUrl() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return window.location.pathname || '/';
}

function getBugTipPlacement(pathname: string) {
  if (pathname === '/map' || pathname.startsWith('/map/')) {
    return 'left-4 top-[calc(20.125rem+env(safe-area-inset-top))] sm:top-[calc(9.25rem+env(safe-area-inset-top))] fixed z-[1200]';
  }

  return 'right-[calc(0.75rem+env(safe-area-inset-right))] top-[calc(4.5rem+env(safe-area-inset-top))] fixed z-[1200]';
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

function requestDisplayMedia(mediaDevices: MediaDevices & {
  getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
}) {
  return new Promise<MediaStream | undefined>((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    }, 4000);

    mediaDevices.getDisplayMedia?.({ audio: false, video: true })
      .then((stream) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          resolve(stream);
        } else {
          stream.getTracks().forEach((track) => track.stop());
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          resolve(undefined);
        }
      });
  });
}

async function captureBugScreenshot(): Promise<ScreenshotAttachment | undefined> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return undefined;
  }

  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
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
    stream = (await requestDisplayMedia(mediaDevices)) ?? null;

    if (!stream) {
      return undefined;
    }

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

export default function AlphaBugButton({
  enabled = false,
  requireContactEmail = false,
}: AlphaBugButtonProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [linkAccountEmail, setLinkAccountEmail] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [shareDeviceDetails, setShareDeviceDetails] = useState(false);
  const [deviceContext, setDeviceContext] = useState<Awaited<ReturnType<typeof getBugDeviceContext>>>(undefined);
  const deviceRequestIdRef = useRef(0);
  const [showTip, setShowTip] = useState(false);
  const pageUrl = useMemo(
    () => location.pathname || getCurrentPageUrl(),
    [open, location.pathname],
  );
  const mapRoute = location.pathname === '/map' || location.pathname.startsWith('/map/');
  const keepMapButtonGlobalOnDesktop = mapRoute && typeof window !== 'undefined' && window.innerWidth >= 640;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-cruush-alpha-bug-corner', 'top-right');

    return () => {
      document.documentElement.removeAttribute('data-cruush-alpha-bug-corner');
    };
  }, [enabled]);

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

    const trimmedContactEmail = contactEmail.trim();

    if (requireContactEmail && !trimmedContactEmail) {
      setError('Enter an email so support can reply.');
      setErrorCode('');
      return;
    }

    if (message.trim().length < 10) {
      setError('Add a few more details before sending.');
      setErrorCode('');
      return;
    }

    setStatus('submitting');
    setError('');
    setErrorCode('');

    try {
      const device = shareDeviceDetails
        ? deviceContext ?? await getBugDeviceContext()
        : undefined;
      await createSupportRequest({
        category: 'bug',
        subject: `Alpha bug: ${pageUrl}`,
        message: message.trim(),
        ...(trimmedContactEmail ? { contactEmail: trimmedContactEmail } : {}),
        ...(linkAccountEmail ? { linkAccountEmail: true } : {}),
        source: 'unknown',
        pageUrl,
        ...(device ? { device } : {}),
      });
      setStatus('success');
      setContactEmail('');
      setLinkAccountEmail(false);
      setMessage('');
      setShareDeviceDetails(false);
      setDeviceContext(undefined);
    } catch (bugError) {
      setError(bugError instanceof Error ? bugError.message : 'Unable to send this bug report.');
      setErrorCode('BUG_REPORT_SUBMIT_FAILED');
      setStatus('idle');
    }
  };

  // A screen that registers a slot gets the button docked inside its own
  // header row, sitting in line with the controls beside it. The slots were
  // registered for exactly this and the button never used them, so it floated
  // at a fixed corner over whatever each header happened to put there.
  const [slot, setSlot] = useState<HTMLElement | null>(() => getBugButtonSlot());

  useEffect(() => subscribeToBugButtonSlot(() => setSlot(getBugButtonSlot())), []);

  // A route change can unmount the screen that held the slot. The registry
  // sweeps a tick later, but the button must never sit in a node that has
  // left the document, so it re-reads the slot on every route as well.
  useEffect(() => {
    setSlot(getBugButtonSlot());
  }, [location.pathname]);

  // One reporter per screen: map sheets own their header reporter while open;
  // the fixed map reporter returns only when no sheet/popup slot is active.
  const activeSlot = slot;
  const triggerButton = (docked = false) => (
    <button
      aria-label="Report alpha bug"
      data-testid="alpha-bug-button"
      style={docked ? undefined : { top: 'calc(0.75rem + env(safe-area-inset-top) + var(--cruush-sale-banner-height, 0px))' }}
      className={`cruush-alpha-bug-button inline-flex items-center justify-center rounded-full border border-destructive/45 bg-destructive text-white shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md transition-[background-color,opacity] duration-150 hover:bg-destructive/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive ${docked
        ? 'h-full w-full'
        : `fixed right-[calc(0.75rem+env(safe-area-inset-right))] top-[calc(0.75rem+env(safe-area-inset-top))] z-[1500] ${mapRoute ? 'h-12 w-12 sm:h-10 sm:w-10 lg:h-11 lg:w-11' : 'h-9 w-9 sm:h-10 sm:w-10 lg:h-11 lg:w-11'}`}`}
      title="Report a bug"
      type="button"
    >
      <Bug className={mapRoute ? 'h-7 w-7 sm:h-5 sm:w-5 lg:h-7 lg:w-7' : 'h-5 w-5 lg:h-7 lg:w-7'} />
    </button>
  );

  // Radix context flows through portals, so the trigger works from inside the
  // slot exactly as it does floating free.
  const trigger = activeSlot
    ? createPortal(<DialogTrigger asChild>{triggerButton(true)}</DialogTrigger>, activeSlot)
    : keepMapButtonGlobalOnDesktop
      ? createPortal(<DialogTrigger asChild>{triggerButton()}</DialogTrigger>, document.body)
      : <DialogTrigger asChild>{triggerButton()}</DialogTrigger>;

  const handleShareDeviceDetailsChange = (checked: boolean) => {
    setShareDeviceDetails(checked);
    const requestId = deviceRequestIdRef.current + 1;
    deviceRequestIdRef.current = requestId;

    if (!checked) {
      setDeviceContext(undefined);
      return;
    }

    void getBugDeviceContext().then((device) => {
      if (deviceRequestIdRef.current !== requestId) {
        return;
      }

      setDeviceContext(device);
    });
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
          deviceRequestIdRef.current += 1;
          setShareDeviceDetails(false);
          setDeviceContext(undefined);
          setError('');
          setErrorCode('');
          setStatus('idle');
        }
      }}
    >
      {showTip ? (
        <div className={`fixed z-[1500] w-[min(18rem,calc(100vw-2rem))] rounded-md border border-primary/25 bg-background/95 p-3 text-center text-sm text-foreground shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md ${getBugTipPlacement(location.pathname)}`}>
          <p className="leading-snug">NYC open beta: tap the bug icon to report anything broken.</p>
          <button
            className="mt-2 text-xs font-semibold text-primary"
            onClick={dismissTip}
            type="button"
          >
            Got it
          </button>
        </div>
      ) : null}
      {trigger}
      <DialogContent floating data-testid="alpha-bug-dialog" overlayClassName="alpha-bug-overlay !z-[1602]" className="!z-[1603] max-w-md content-start overflow-hidden rounded-2xl border border-white/25 bg-black/48 p-4 backdrop-blur-xl backdrop-saturate-150 sm:p-6">
        <DialogHeader>
          <DialogTitle>Report beta bug</DialogTitle>
        </DialogHeader>

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
              <div data-testid="bug-report-error" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <p>{error}</p>
                <p className="mt-1 font-mono text-xs">Error code: {errorCode || 'BUG_REPORT_SUBMIT_FAILED'}</p>
              </div>
            ) : null}
            {requireContactEmail ? (
              <div className="space-y-2">
                <Label htmlFor="alpha-bug-contact-email">Reply email</Label>
                <Input
                  autoComplete="email"
                  disabled={status === 'submitting'}
                  id="alpha-bug-contact-email"
                  maxLength={320}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={contactEmail}
                />
                <p className="text-xs text-muted-foreground">Support uses this only for follow-up and deletes it after 30 days.</p>
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
                placeholder="What happened, what you expected, and how to reproduce it."
                required
                value={message}
              />
              <p className="text-right text-xs text-muted-foreground">{message.length}/4000</p>
            </div>
            <p className="text-xs text-muted-foreground">Sharing device and browser details helps us diagnose the problem.</p>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
              <Checkbox
                aria-label="Share device and browser details"
                checked={shareDeviceDetails}
                disabled={status === 'submitting'}
                onCheckedChange={(checked) => handleShareDeviceDetailsChange(checked === true)}
              />
              <span>Share device and browser details</span>
            </label>
            {!requireContactEmail ? (
              <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
                <Checkbox aria-label="Allow email follow-up" checked={linkAccountEmail} disabled={status === 'submitting'} onCheckedChange={(checked) => setLinkAccountEmail(checked === true)} />
                <span>Allow support to use my account email for follow-up. It is deleted after 30 days.</span>
              </label>
            ) : null}
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
