import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePushNotifications, enablePushNotifications, refreshExistingPushSubscription } from './pushNotifications';

const {
  getVapidPublicKey,
  getNotificationPreferences,
  refreshPushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} = vi.hoisted(() => ({
  getVapidPublicKey: vi.fn(),
  getNotificationPreferences: vi.fn(),
  refreshPushSubscription: vi.fn(),
  subscribeToPushNotifications: vi.fn(),
  unsubscribeFromPushNotifications: vi.fn(),
}));

vi.mock('./notificationsApi', () => ({
  getVapidPublicKey,
  getNotificationPreferences,
  refreshPushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
}));

describe('pushNotifications', () => {
  const getSubscription = vi.fn();
  const subscribe = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    getVapidPublicKey.mockReset();
    getNotificationPreferences.mockReset();
    refreshPushSubscription.mockReset();
    subscribeToPushNotifications.mockReset();
    unsubscribeFromPushNotifications.mockReset();
    getSubscription.mockReset();
    subscribe.mockReset();

    getVapidPublicKey.mockResolvedValue({ enabled: true, publicKey: 'AQID' });
    getNotificationPreferences.mockResolvedValue({ pushEnabled: true });
    refreshPushSubscription.mockResolvedValue({ pushEnabled: true });
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

  it('shows the permission prompt before any network wait', async () => {
    const order: string[] = [];
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: vi.fn(async () => { order.push('permission'); return 'granted'; }),
      },
    });
    getVapidPublicKey.mockImplementation(async () => { order.push('vapid'); return { enabled: true, publicKey: 'AQID' }; });
    getSubscription.mockResolvedValue(null);
    subscribe.mockResolvedValue({ endpoint: 'https://push.example/subscription', getKey: () => new ArrayBuffer(0) });

    await enablePushNotifications();

    expect(order).toEqual(['permission', 'vapid']);
  });

  it('does not subscribe after notification permission is denied', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('denied'),
      },
    });

    await expect(enablePushNotifications()).rejects
      .toThrow(new Error('Notifications are blocked for cruush in this browser.'));
    expect(subscribe).not.toHaveBeenCalled();
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
  });

  it('replaces an existing subscription after signing-key rotation without requesting permission', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    getSubscription.mockResolvedValue({ options: { applicationServerKey: Uint8Array.from([4, 5, 6]).buffer }, unsubscribe });
    subscribe.mockResolvedValue({ endpoint: 'https://push.example/new', getKey: () => new ArrayBuffer(0) });

    await refreshExistingPushSubscription();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([1, 2, 3]) });
    expect(refreshPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/new' }), undefined);
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('preserves a subscription already using the current signing key', async () => {
    const unsubscribe = vi.fn();
    getSubscription.mockResolvedValue({ options: { applicationServerKey: Uint8Array.from([1, 2, 3]).buffer }, unsubscribe, endpoint: 'https://push.example/current', getKey: () => new ArrayBuffer(0) });
    await refreshExistingPushSubscription();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('never opts a disabled account into push', async () => {
    getNotificationPreferences.mockResolvedValueOnce({ pushEnabled: false });
    await refreshExistingPushSubscription();
    expect(getSubscription).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
    expect(refreshPushSubscription).not.toHaveBeenCalled();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('resubscribes an opted-in browser whose subscription was expired or revoked, without prompting', async () => {
    getSubscription.mockResolvedValue(null);
    subscribe.mockResolvedValue({ endpoint: 'https://push.example/renewed', getKey: () => new ArrayBuffer(0) });
    await refreshExistingPushSubscription();
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([1, 2, 3]) });
    expect(refreshPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/renewed' }), undefined);
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('never subscribes when browser notification permission is not granted', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: vi.fn() },
    });
    getSubscription.mockResolvedValue(null);
    await refreshExistingPushSubscription();
    expect(subscribe).not.toHaveBeenCalled();
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('stops a delayed preference read after the signed-in session ends', async () => {
    let finishPreferences!: (value: { pushEnabled: boolean }) => void;
    getNotificationPreferences.mockImplementationOnce(() => new Promise((resolve) => { finishPreferences = resolve; }));
    const controller = new AbortController();
    const refresh = refreshExistingPushSubscription(controller.signal);
    controller.abort();
    finishPreferences({ pushEnabled: true });

    await expect(refresh).rejects.toMatchObject({ name: 'AbortError' });
    expect(getSubscription).not.toHaveBeenCalled();
    expect(refreshPushSubscription).not.toHaveBeenCalled();
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
  });

  it('does not register a browser subscription that finishes after session cleanup', async () => {
    let finishSubscription!: (subscription: unknown) => void;
    getSubscription.mockResolvedValue(null);
    subscribe.mockImplementationOnce(() => new Promise((resolve) => { finishSubscription = resolve; }));
    const controller = new AbortController();
    const refresh = refreshExistingPushSubscription(controller.signal);
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    controller.abort();
    finishSubscription({ endpoint: 'https://push.example/delayed', getKey: () => new ArrayBuffer(0) });

    await expect(refresh).rejects.toMatchObject({ name: 'AbortError' });
    expect(refreshPushSubscription).not.toHaveBeenCalled();
    expect(subscribeToPushNotifications).not.toHaveBeenCalled();
  });

  it('passes session cancellation to the background-only registration request', async () => {
    getSubscription.mockResolvedValue({ options: { applicationServerKey: Uint8Array.from([1, 2, 3]).buffer }, endpoint: 'https://push.example/current', getKey: () => new ArrayBuffer(0) });
    const controller = new AbortController();
    await refreshExistingPushSubscription(controller.signal);
    expect(refreshPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/current' }), controller.signal);
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
