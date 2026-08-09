export const INSTALL_PROMPT_AVAILABLE_EVENT = 'cruush:install-available';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' | string }>;
};

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return typeof (event as Partial<BeforeInstallPromptEvent>).prompt === 'function' &&
    Boolean((event as Partial<BeforeInstallPromptEvent>).userChoice);
}

export function captureInstallPrompt(event: Event) {
  if (!isBeforeInstallPromptEvent(event)) {
    return;
  }

  event.preventDefault();
  deferredInstallPrompt = event;
  window.dispatchEvent(new Event(INSTALL_PROMPT_AVAILABLE_EVENT));
}

export function getInstallPrompt() {
  return deferredInstallPrompt;
}

export function clearInstallPrompt() {
  deferredInstallPrompt = null;
}
