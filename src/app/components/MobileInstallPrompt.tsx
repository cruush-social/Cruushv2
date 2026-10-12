import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useExclusivePopup } from '../lib/popupQueue';
import { Button } from './ui/button';
import FirstEntryPromptSurface from './FirstEntryPromptSurface';
import {
  captureInstallPrompt,
  clearInstallPrompt,
  getInstallPrompt,
  INSTALL_PROMPT_AVAILABLE_EVENT,
  type BeforeInstallPromptEvent,
} from '../lib/installPrompt';

const INSTALL_PROMPT_VERSION = 'v1';
const INSTALL_REQUESTED_EVENT = 'cruush:install-requested';
export const INSTALL_COMPLETED_KEY = 'cruush:installed:v1';

export function installPromptHandledKey(userId: string) {
  return `cruush:first-entry-install:${INSTALL_PROMPT_VERSION}:${userId}`;
}

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isMobileBrowser() {
  return /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function wasHandled(userId: string) {
  try {
    return window.localStorage.getItem(installPromptHandledKey(userId)) === 'true'
      || window.localStorage.getItem(INSTALL_COMPLETED_KEY) === 'true';
  } catch { return false; }
}

function rememberHandled(userId: string, installed = false) {
  try {
    window.localStorage.setItem(installPromptHandledKey(userId), 'true');
    if (installed) window.localStorage.setItem(INSTALL_COMPLETED_KEY, 'true');
  } catch { /* Installation detection and dismissal still work for this mount. */ }
}

function wantsAutomaticPrompt(userId: string, installEvent: BeforeInstallPromptEvent | null) {
  if (!isMobileBrowser() || isStandaloneDisplay() || wasHandled(userId)) {
    return false;
  }

  return Boolean(installEvent) || isIosBrowser();
}

export default function MobileInstallPrompt({ userId }: { userId: string }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(() => getInstallPrompt());
  const [visible, setVisible] = useState(() => wantsAutomaticPrompt(userId, getInstallPrompt()));
  const [showManualInstructions, setShowManualInstructions] = useState(
    () => wantsAutomaticPrompt(userId, getInstallPrompt()) && isIosBrowser() && !getInstallPrompt(),
  );
  const showing = useExclusivePopup('mobile-install', visible);

  useEffect(() => {
    const showAvailableInstallPrompt = () => {
      const promptEvent = getInstallPrompt();
      if (!promptEvent) {
        return;
      }

      setInstallEvent(promptEvent);
      if (wantsAutomaticPrompt(userId, promptEvent)) {
        setShowManualInstructions(false);
        setVisible(true);
      }
    };

    const handleInstallRequested = () => {
      if (isStandaloneDisplay()) {
        return;
      }

      const promptEvent = getInstallPrompt();
      setInstallEvent(promptEvent);
      setShowManualInstructions(!promptEvent);
      setVisible(true);
    };

    const handleInstalled = () => {
      rememberHandled(userId, true);
      clearInstallPrompt();
      setInstallEvent(null);
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener(INSTALL_PROMPT_AVAILABLE_EVENT, showAvailableInstallPrompt);
    window.addEventListener(INSTALL_REQUESTED_EVENT, handleInstallRequested);
    window.addEventListener('appinstalled', handleInstalled);
    if (isStandaloneDisplay()) handleInstalled();
    const relatedApps = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
    let active = true;
    if (relatedApps) {
      void relatedApps.call(navigator).then(apps => {
        if (active && apps.length > 0) handleInstalled();
      }).catch(() => { /* No supported installation evidence available. */ });
    }
    showAvailableInstallPrompt();

    return () => {
      active = false;
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener(INSTALL_PROMPT_AVAILABLE_EVENT, showAvailableInstallPrompt);
      window.removeEventListener(INSTALL_REQUESTED_EVENT, handleInstallRequested);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [userId]);

  const markHandledAndClose = () => {
    rememberHandled(userId);
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) {
      setShowManualInstructions(true);
      setVisible(true);
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') {
        rememberHandled(userId, true);
      }
    } finally {
      rememberHandled(userId);
      clearInstallPrompt();
      setInstallEvent(null);
      setVisible(false);
    }
  };

  const manualInstallOnly = showManualInstructions && !installEvent;
  const description = manualInstallOnly
    ? isIosBrowser()
      ? 'Use Safari Share, then Add to Home Screen.'
      : 'Use your browser menu, then choose Install or Add to Home Screen.'
    : 'Add cruush to your Home Screen.';

  return (
    <FirstEntryPromptSurface
      open={showing}
      onDismiss={markHandledAndClose}
      testId="mobile-install-prompt"
      title="Install cruush"
      description={description}
      icon={(
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Download className="h-5 w-5" />
        </div>
      )}
      primary={manualInstallOnly ? (
        <Button
          type="button"
          onClick={markHandledAndClose}
          className="min-h-11 rounded-full text-white"
          style={{ background: 'var(--cruush-gradient)' }}
        >
          Got it
        </Button>
      ) : (
        <Button
          type="button"
          onClick={() => void install()}
          className="min-h-11 rounded-full text-white"
          data-tutorial-target="install"
          style={{ background: 'var(--cruush-gradient)' }}
        >
          Install cruush
        </Button>
      )}
      secondary={(
        <Button type="button" variant="outline" onClick={markHandledAndClose} className="min-h-11 rounded-full">
          Not now
        </Button>
      )}
    />
  );
}
