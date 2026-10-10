import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExclusivePopupsForTest } from '../lib/popupQueue';
import { androidPushPromptSessionKey, resetPushPromptForLogin } from '../lib/pushPromptSession';

const { enablePushNotifications, getNotificationPreferences } = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
  getNotificationPreferences: vi.fn(),
}));

vi.mock('../lib/pushNotifications', () => ({ enablePushNotifications }));
vi.mock('../lib/notificationsApi', () => ({ getNotificationPreferences }));

import PushPermissionPrompt, { pushPromptHandledKey } from './PushPermissionPrompt';

function setPermission(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission });
}

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value });
}

const dialog = () => screen.queryByRole('dialog', { name: 'Enable notifications' });

describe('PushPermissionPrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetExclusivePopupsForTest();
    enablePushNotifications.mockReset();
    enablePushNotifications.mockResolvedValue({ pushEnabled: true });
    getNotificationPreferences.mockReset();
    getNotificationPreferences.mockResolvedValue({ pushEnabled: false });
    setUserAgent('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36');
    Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: {} });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    setPermission('default');
  });

  afterEach(() => {
    resetExclusivePopupsForTest();
    vi.unstubAllGlobals();
  });

  it('enables only after a tap and records Android success for this login', async () => {
    render(<PushPermissionPrompt userId="member-1" />);
    expect(enablePushNotifications).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(enablePushNotifications).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBe('true');
    expect(localStorage.getItem(pushPromptHandledKey('member-1'))).toBeNull();
  });

  it('ignores the old permanent Android dismissal', () => {
    localStorage.setItem(pushPromptHandledKey('member-1'), 'true');
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).toBeInTheDocument();
  });

  it('stays dismissed on same-login remount but asks again after the next login', () => {
    const first = render(<PushPermissionPrompt userId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(enablePushNotifications).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBe('true');
    first.unmount();
    const second = render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).not.toBeInTheDocument();
    second.unmount();
    resetPushPromptForLogin('member-1');
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).toBeInTheDocument();
  });

  it('keeps Android dismissal specific to the account', () => {
    sessionStorage.setItem(androidPushPromptSessionKey('member-1'), 'true');
    const first = render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).not.toBeInTheDocument();
    first.unmount();
    render(<PushPermissionPrompt userId="member-2" />);
    expect(dialog()).toBeInTheDocument();
  });

  it('offers enabled browser permission when the Android account has push off', async () => {
    setPermission('granted');
    render(<PushPermissionPrompt userId="member-1" />);
    expect(await screen.findByRole('dialog', { name: 'Enable notifications' })).toBeInTheDocument();
    expect(getNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(enablePushNotifications).not.toHaveBeenCalled();
  });

  it('does not prompt Android accounts whose browser and account push are enabled', async () => {
    setPermission('granted');
    getNotificationPreferences.mockResolvedValue({ pushEnabled: true });
    await act(async () => { render(<PushPermissionPrompt userId="member-1" />); });
    expect(getNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toBeInTheDocument();
  });

  it('does not treat an unavailable preference as disabled', async () => {
    setPermission('granted');
    getNotificationPreferences.mockRejectedValueOnce(new Error('Offline'));
    await act(async () => { render(<PushPermissionPrompt userId="member-1" />); });
    expect(dialog()).not.toBeInTheDocument();
    expect(enablePushNotifications).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBeNull();
  });

  it('ignores an old preference response after unmount', async () => {
    setPermission('granted');
    let resolveOld!: (value: { pushEnabled: boolean }) => void;
    getNotificationPreferences.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const old = render(<PushPermissionPrompt userId="member-1" />);
    old.unmount();
    getNotificationPreferences.mockResolvedValue({ pushEnabled: true });
    await act(async () => { render(<PushPermissionPrompt userId="member-2" />); });
    await act(async () => { resolveOld({ pushEnabled: false }); });
    expect(dialog()).not.toBeInTheDocument();
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBeNull();
  });

  it('does not let an old enable completion dismiss the next login reminder', async () => {
    let resolveEnable!: (value: { pushEnabled: boolean }) => void;
    enablePushNotifications.mockImplementationOnce(() => new Promise((resolve) => { resolveEnable = resolve; }));
    const previousLogin = render(<PushPermissionPrompt userId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    previousLogin.unmount();
    resetPushPromptForLogin('member-1');
    await act(async () => { resolveEnable({ pushEnabled: true }); });
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBeNull();
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).toBeInTheDocument();
  });

  it('keeps a denied Android permission error visible after the explicit action', async () => {
    setPermission('denied');
    enablePushNotifications.mockRejectedValueOnce(new Error('Notifications are blocked for cruush in this browser.'));
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).toBeInTheDocument();
    expect(enablePushNotifications).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    expect(await screen.findByText('Notifications are blocked for cruush in this browser.')).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBeNull();
  });

  it('does not prompt without a service worker', () => {
    Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: undefined });
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).not.toBeInTheDocument();
  });

  it('retains permanent account-specific dismissal outside Android', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/140 Safari/537.36');
    localStorage.setItem(pushPromptHandledKey('member-1'), 'true');
    const first = render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).not.toBeInTheDocument();
    first.unmount();
    render(<PushPermissionPrompt userId="member-2" />);
    expect(dialog()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(localStorage.getItem(pushPromptHandledKey('member-2'))).toBe('true');
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-2'))).toBeNull();
  });

  it.each(['granted', 'denied'] as const)('retains non-Android suppression when permission is %s', (permission) => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/140 Safari/537.36');
    setPermission(permission);
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).not.toBeInTheDocument();
    expect(getNotificationPreferences).not.toHaveBeenCalled();
  });

  it('waits for an installed launch on iOS', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1');
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).not.toBeInTheDocument();
  });

  it('offers push in an installed iOS app', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<PushPermissionPrompt userId="member-1" />);
    expect(dialog()).toBeInTheDocument();
  });

  it('keeps a subscription error available for retry without marking handled', async () => {
    enablePushNotifications.mockRejectedValueOnce(new Error('Push alerts are not configured on this server yet.'));
    render(<PushPermissionPrompt userId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    expect(await screen.findByText('Push alerts are not configured on this server yet.')).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(enablePushNotifications).toHaveBeenCalledTimes(2);
  });
});
