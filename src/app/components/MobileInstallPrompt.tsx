import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/button';

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

  return (
    <div className="fixed bottom-24 left-4 right-[4.5rem] z-40 mx-auto max-w-md rounded-lg border border-border bg-card p-4 text-card-foreground shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:right-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base text-white">Install cruush</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={dismiss}
              aria-label="Dismiss install prompt"
              className="-mr-2 -mt-2 h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {showManualInstructions
              ? 'Use Safari share, then Add to Home Screen.'
              : 'Open cruush from your Home Screen for a full-screen mobile app feel.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void install()} className="rounded-full">
              Install cruush
            </Button>
            <Button type="button" variant="outline" onClick={dismiss} className="rounded-full">
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
