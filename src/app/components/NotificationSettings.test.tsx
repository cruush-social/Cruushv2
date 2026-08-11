import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationSettings from './NotificationSettings';

const {
  getNotificationPreferences,
  updateNotificationPreferences,
  enablePushNotifications,
} = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  enablePushNotifications: vi.fn(),
}));

vi.mock('../lib/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/notificationsApi')>('../lib/notificationsApi');

  return {
    ...actual,
    getNotificationPreferences,
    updateNotificationPreferences,
  };
});

vi.mock('../lib/pushNotifications', () => ({
  disablePushNotifications: vi.fn(),
  enablePushNotifications,
}));

describe('NotificationSettings', () => {
  beforeEach(() => {
    getNotificationPreferences.mockReset();
    updateNotificationPreferences.mockReset();
    enablePushNotifications.mockReset();
    getNotificationPreferences.mockResolvedValue({
      pushEnabled: false,
      cruushEnabled: true,
      messagesEnabled: true,
      groupsEnabled: true,
      nearbyEnabled: true,
      rewardsEnabled: true,
      soundEnabled: true,
    });
    enablePushNotifications.mockResolvedValue({
      pushEnabled: true,
      cruushEnabled: true,
      messagesEnabled: true,
      groupsEnabled: true,
      nearbyEnabled: true,
      rewardsEnabled: true,
      soundEnabled: true,
    });
    updateNotificationPreferences.mockImplementation((partial) => Promise.resolve({
      pushEnabled: false,
      cruushEnabled: true,
      messagesEnabled: false,
      groupsEnabled: true,
      nearbyEnabled: true,
      rewardsEnabled: true,
      soundEnabled: true,
      ...partial,
    }));
  });

  it('enables push from a direct user action', async () => {
    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Enable push' }));

    await waitFor(() => expect(enablePushNotifications).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Push alerts enabled.')).toBeInTheDocument();
  });

  it('loads preferences and saves alert toggles', async () => {
    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Notification settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Message alerts' }));

    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      messagesEnabled: false,
    }));

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Heartbeat sound' }));

    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      soundEnabled: false,
    }));

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Nearby people' }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      nearbyEnabled: false,
    }));

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Reward updates' }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      rewardsEnabled: false,
    }));
  });

  it('dispatches install requests from the Home Screen app action', async () => {
    const listener = vi.fn();
    window.addEventListener('cruush:install-requested', listener);

    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Install cruush' }));

    expect(listener).toHaveBeenCalled();
    window.removeEventListener('cruush:install-requested', listener);
  });
});
