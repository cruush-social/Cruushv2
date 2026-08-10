import {
  getVapidPublicKey,
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

export async function enablePushNotifications(): Promise<NotificationPreferences> {
  const vapid = await getVapidPublicKey();

  if (!vapid.enabled || !vapid.publicKey) {
    throw new Error('Push alerts are not configured on this server yet.');
  }

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

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
  });

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
