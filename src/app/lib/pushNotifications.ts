import {
  getVapidPublicKey,
  getNotificationPreferences,
  refreshPushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  type NotificationPreferences,
  type PushSubscriptionPayload,
} from './notificationsApi';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}
function arrayBufferToBase64(value: ArrayBuffer | null) {
  if (!value) {
    return '';
  }

  const bytes = new Uint8Array(value);
  let output = '';

  bytes.forEach((byte) => {
    output += String.fromCharCode(byte);
  });

  return window.btoa(output);
}

function serializeSubscription(subscription: PushSubscription): PushSubscriptionPayload {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
      auth: arrayBufferToBase64(subscription.getKey('auth')),
    },
  };
}

async function currentSubscription(registration: ServiceWorkerRegistration, publicKey: string, signal?: AbortSignal) {
  const key = urlBase64ToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();
  signal?.throwIfAborted();
  const previousKey = existing?.options?.applicationServerKey;
  const bytes = previousKey ? new Uint8Array(previousKey) : null;
  if (existing && bytes && bytes.length === key.length && bytes.every((byte, index) => byte === key[index])) {
    return existing;
  }
  if (existing && !(await existing.unsubscribe())) {
    throw new Error('Could not replace the previous push subscription.');
  }
  signal?.throwIfAborted();
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

// Keep an opted-in device subscribed. Never request permission here: this runs
// only when permission is already granted and the account has push turned on,
// so a subscription the push service expired or revoked is recreated.
export async function refreshExistingPushSubscription(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!('Notification' in window) || Notification.permission !== 'granted' ||
      !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const preferences = await getNotificationPreferences();
  signal?.throwIfAborted();
  if (!preferences.pushEnabled) return;
  const registration = await navigator.serviceWorker.ready;
  signal?.throwIfAborted();
  const vapid = await getVapidPublicKey();
  signal?.throwIfAborted();
  if (!vapid.enabled || !vapid.publicKey) return;
  const subscription = await currentSubscription(registration, vapid.publicKey, signal);
  signal?.throwIfAborted();
  await refreshPushSubscription(serializeSubscription(subscription), signal);
}

export async function enablePushNotifications(): Promise<NotificationPreferences> {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support push notifications.');
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Add cruush to your Home Screen, then open it from there to enable push alerts.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error('Notifications are blocked for cruush in this browser.');
  }

  // Asked only after the permission prompt: Safari and Firefox show the prompt
  // only while the tap that started it is still current, so no network wait
  // may come before it.
  const vapid = await getVapidPublicKey();

  if (!vapid.enabled || !vapid.publicKey) {
    throw new Error('Push alerts are not configured on this server yet.');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await currentSubscription(registration, vapid.publicKey);

  return subscribeToPushNotifications(serializeSubscription(subscription));
}

export async function disablePushNotifications(): Promise<NotificationPreferences> {
  let endpoint = '';

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    endpoint = subscription?.endpoint ?? '';
    await subscription?.unsubscribe();
  }

  return unsubscribeFromPushNotifications(endpoint || undefined);
}
