import { toast } from './toast';
import type { CruushRecord } from './cruushApi';
import { emitCruushChanged } from './cruushEvents';

export function handleCruushSendSuccess(targetUserId: string, displayName: string, cruush: CruushRecord) {
  emitCruushChanged({
    targetUserId,
    mutual: cruush.mutual,
    permissions: cruush.permissions,
  });

  if (cruush.mutual) {
    toast.success(`It's mutual. You and ${displayName} have a cruush on each other.`);
  }
}

export function notifyCruushSendError(error: unknown) {
  toast.error(error instanceof Error ? error.message : 'Failed to send cruush.');
}

export function handleMutualCruushRevokeSuccess(targetUserId: string, displayName: string) {
  emitCruushChanged({
    targetUserId,
    mutual: false,
    revoked: true,
  });

  toast.success(`Uncruushed ${displayName}.`);
}

export function notifyMutualCruushRevokeError(error: unknown) {
  toast.error(error instanceof Error ? error.message : 'Failed to uncruush.');
}

export function handleSentCruushRevokeSuccess(targetUserId: string, displayName: string) {
  emitCruushChanged({
    targetUserId,
    mutual: false,
    revoked: true,
  });

  toast.success(`Unsent your cruush to ${displayName}.`);
}

export function notifySentCruushRevokeError(error: unknown) {
  toast.error(error instanceof Error ? error.message : 'Failed to unsend cruush.');
}

export function notifyMutualCruushRequired() {
  toast.info('You can message after a mutual.');
}
