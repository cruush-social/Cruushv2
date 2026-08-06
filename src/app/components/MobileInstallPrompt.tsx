import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const INSTALL_PROMPT_DISMISSED_KEY = 'cruush-install-prompt-dismissed';
const INSTALL_REQUESTED_EVENT = 'cruush:install-requested';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' | string }>;
};

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isMobileBrowser() {
  return /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function MobileInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showManualInstructions, setShowManualInstructions] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const dismissed = window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === 'true';
    const canPrompt = isMobileBrowser() && !isStandaloneDisplay() && !dismissed;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setInstallEvent(promptEvent);
      if (canPrompt) {
        setShowManualInstructions(false);
        setVisible(true);
      }
    };

    const handleInstallRequested = () => {
      if (isStandaloneDisplay()) {
        return;
      }

      setShowManualInstructions(!installEvent && isIosBrowser());
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener(INSTALL_REQUESTED_EVENT, handleInstallRequested);

    if (canPrompt && isIosBrowser()) {
      const timer = window.setTimeout(() => {
        setShowManualInstructions(true);
        setVisible(true);
      }, 1200);

      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener(INSTALL_REQUESTED_EVENT, handleInstallRequested);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener(INSTALL_REQUESTED_EVENT, handleInstallRequested);
    };
  }, [installEvent]);

  const dismiss = () => {
    window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) {
      setShowManualInstructions(true);
      setVisible(true);
      return;
    }

    await installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  // Was a floating card pinned above the nav, which meant it sat on top of whatever was
  // under it and could be scrolled past unread. It is a blocking modal like every other
  // first-run popup now.
  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) dismiss(); }}>
      <DialogContent
        className="max-w-sm rounded-lg border-white/10 bg-background"
        data-testid="mobile-install-prompt"
        dismissible={false}
      >
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Download className="h-5 w-5" />
          </div>
          <DialogTitle>Install cruush</DialogTitle>
          <DialogDescription>
            {showManualInstructions
              ? 'Use Safari share, then Add to Home Screen.'
              : 'Open cruush from your Home Screen for a full-screen mobile app feel.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={dismiss} className="rounded-full">
            Not now
          </Button>
          <Button type="button" onClick={() => void install()} className="rounded-full">
            Install cruush
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
