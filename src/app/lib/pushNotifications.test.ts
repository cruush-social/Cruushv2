import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePushNotifications, enablePushNotifications } from './pushNotifications';

const {
  getVapidPublicKey,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} = vi.hoisted(() => ({
  getVapidPublicKey: vi.fn(),
  subscribeToPushNotifications: vi.fn(),
  unsubscribeFromPushNotifications: vi.fn(),
}));

vi.mock('./notificationsApi', () => ({
  getVapidPublicKey,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
}));

describe('pushNotifications', () => {
  const getSubscription = vi.fn();
  const subscribe = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    getVapidPublicKey.mockReset();
    subscribeToPushNotifications.mockReset();
    unsubscribeFromPushNotifications.mockReset();
    getSubscription.mockReset();
    subscribe.mockReset();

    getVapidPublicKey.mockResolvedValue({ enabled: true, publicKey: 'AQID' });
    subscribeToPushNotifications.mockResolvedValue({ pushEnabled: true });
    unsubscribeFromPushNotifications.mockResolvedValue({ pushEnabled: false });

    Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'granted',
        requestPermission: vi.fn(),
      },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription, subscribe },
        }),
      },
    });
  });

  it('subscribes from a user-triggered enable action', async () => {
    const subscription = {
      endpoint: 'https://push.example/subscription',
      getKey: vi.fn((name: string) => name === 'p256dh'
        ? Uint8Array.from([1, 2]).buffer
        : Uint8Array.from([3, 4]).buffer),
    } as unknown as PushSubscription;
    getSubscription.mockResolvedValue(null);
    subscribe.mockResolvedValue(subscription);

    await enablePushNotifications();

    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from([1, 2, 3]),
    }));
    expect(subscribeToPushNotifications).toHaveBeenCalledWith({
      endpoint: 'https://push.example/subscription',
      keys: { p256dh: 'AQI=', auth: 'AwQ=' },
    });
  });

  it('does not subscribe after notification permission is denied', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('denied'),
      },
    });

    await expect(enablePushNotifications()).rejects.toThrow('Notifications are blocked for cruush');
    expect(subscribe).not.toHaveBeenCalled();
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
  });

  it('unsubscribes the browser endpoint and server record', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    getSubscription.mockResolvedValue({ endpoint: 'https://push.example/subscription', unsubscribe });

    await disablePushNotifications();

    expect(unsubscribe).toHaveBeenCalled();
    expect(unsubscribeFromPushNotifications).toHaveBeenCalledWith('https://push.example/subscription');
  });
});
