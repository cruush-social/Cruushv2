const ONE_TIME_DIALOG_RELEASED_EVENT = 'cruush:one-time-dialog-released';

let activeDialogKey: string | null = null;

export function acquireOneTimeDialog(dialogKey: string) {
  if (activeDialogKey && activeDialogKey !== dialogKey) {
    return false;
  }

  activeDialogKey = dialogKey;
  return true;
}

export function releaseOneTimeDialog(dialogKey: string) {
  if (activeDialogKey !== dialogKey) {
    return;
  }

  activeDialogKey = null;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ONE_TIME_DIALOG_RELEASED_EVENT));
  }
}

export function onOneTimeDialogReleased(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(ONE_TIME_DIALOG_RELEASED_EVENT, listener);
  return () => window.removeEventListener(ONE_TIME_DIALOG_RELEASED_EVENT, listener);
}
