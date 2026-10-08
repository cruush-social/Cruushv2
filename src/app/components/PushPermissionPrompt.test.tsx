import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExclusivePopupsForTest } from '../lib/popupQueue';

const { enablePushNotifications } = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
}));

vi.mock('../lib/pushNotifications', () => ({
  enablePushNotifications,
}));

import PushPermissionPrompt, { pushPromptHandledKey } from './PushPermissionPrompt';

function setPermission(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission });
}

describe('PushPermissionPrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetExclusivePopupsForTest();
    enablePushNotifications.mockReset();
    enablePushNotifications.mockResolvedValue({ pushEnabled: true });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    });
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    setPermission('default');
  });

  afterEach(() => {
    resetExclusivePopupsForTest();
    vi.unstubAllGlobals();
  });

  it('requests permission only after the explicit action', async () => {
    render(<PushPermissionPrompt userId="member-1" />);

    expect(enablePushNotifications).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));

    await waitFor(() => expect(enablePushNotifications).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(pushPromptHandledKey('member-1'))).toBe('true');
  });

  it('uses an account-specific handled key', () => {
    window.localStorage.setItem(pushPromptHandledKey('member-1'), 'true');

    const first = render(<PushPermissionPrompt userId="member-1" />);
    expect(screen.queryByRole('dialog', { name: 'Enable notifications' })).not.toBeInTheDocument();
    first.unmount();
    resetExclusivePopupsForTest();

    render(<PushPermissionPrompt userId="member-2" />);
    expect(screen.getByRole('dialog', { name: 'Enable notifications' })).toBeInTheDocument();
  });

  it.each(['granted', 'denied'] as const)('does not prompt when permission is %s', (permission) => {
    setPermission(permission);
    render(<PushPermissionPrompt userId="member-1" />);
    expect(screen.queryByRole('dialog', { name: 'Enable notifications' })).not.toBeInTheDocument();
  });

  it('does not prompt without a service worker', () => {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
    render(<PushPermissionPrompt userId="member-1" />);
    expect(screen.queryByRole('dialog', { name: 'Enable notifications' })).not.toBeInTheDocument();
  });

  it('waits for an installed launch on iOS', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
    });
    render(<PushPermissionPrompt userId="member-1" />);
    expect(screen.queryByRole('dialog', { name: 'Enable notifications' })).not.toBeInTheDocument();
  });

  it('offers push in an installed iOS app', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
    });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<PushPermissionPrompt userId="member-1" />);
    expect(screen.getByRole('dialog', { name: 'Enable notifications' })).toBeInTheDocument();
  });

  it('keeps a subscription error inside the same compact prompt', async () => {
    enablePushNotifications.mockRejectedValueOnce(new Error('Push alerts are not configured on this server yet.'));
    render(<PushPermissionPrompt userId="member-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));

    expect(await screen.findByText('Push alerts are not configured on this server yet.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Enable notifications' })).toBeInTheDocument();
    expect(window.localStorage.getItem(pushPromptHandledKey('member-1'))).toBeNull();
  });

  it('marks Not now handled without requesting permission', () => {
    render(<PushPermissionPrompt userId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(enablePushNotifications).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(pushPromptHandledKey('member-1'))).toBe('true');
  });
});
