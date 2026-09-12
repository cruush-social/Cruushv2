import { toast as sonnerToast } from 'sonner';
import { haptic } from './haptics';

/**
 * The app's toast, with the pulse that goes with it.
 *
 * Every surface already says whether something worked by raising a toast, so
 * hanging the haptic here means a success or a failure is felt everywhere at
 * once, without each caller remembering to ask. Import this instead of sonner.
 *
 * Silent when Haptic feedback is off, like everything else in `haptics`.
 */
type SonnerToast = typeof sonnerToast;

function withHaptic<Fn extends (...args: never[]) => unknown>(fn: Fn, pattern: 'commit' | 'reject') {
  return ((...args: Parameters<Fn>) => {
    haptic(pattern);
    return fn(...args);
  }) as Fn;
}

export const toast: SonnerToast = Object.assign(
  ((...args: Parameters<SonnerToast>) => sonnerToast(...args)) as SonnerToast,
  sonnerToast,
  {
    success: withHaptic(sonnerToast.success, 'commit'),
    error: withHaptic(sonnerToast.error, 'reject'),
    warning: withHaptic(sonnerToast.warning, 'reject'),
  },
);
