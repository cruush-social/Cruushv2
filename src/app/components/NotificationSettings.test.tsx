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

const serviceArea = vi.hoisted(() => ({ profilePinsAllowed: true }));
vi.mock('./MapServiceAreaContext', () => ({ useMapServiceArea: () => serviceArea }));

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
    serviceArea.profilePinsAllowed = true;
    getNotificationPreferences.mockReset();
    updateNotificationPreferences.mockReset();
    enablePushNotifications.mockReset();
    getNotificationPreferences.mockResolvedValue({
      emailEnabled: true,
      pushEnabled: false,
      cruushEnabled: true,
      messagesEnabled: true,
      groupsEnabled: true,
      pulseEnabled: true,
      nearbyEnabled: true,
      mutualFeedEnabled: true,
      rewardsEnabled: true,
      siteRemindersEnabled: true,
      soundEnabled: true,
    });
    enablePushNotifications.mockResolvedValue({
      emailEnabled: true,
      pushEnabled: true,
      cruushEnabled: true,
      messagesEnabled: true,
      groupsEnabled: true,
      pulseEnabled: true,
      nearbyEnabled: true,
      mutualFeedEnabled: true,
      rewardsEnabled: true,
      siteRemindersEnabled: true,
      soundEnabled: true,
    });
    updateNotificationPreferences.mockImplementation((partial) => Promise.resolve({
      emailEnabled: true,
      pushEnabled: false,
      cruushEnabled: true,
      messagesEnabled: false,
      groupsEnabled: true,
      pulseEnabled: true,
      nearbyEnabled: true,
      mutualFeedEnabled: true,
      rewardsEnabled: true,
      siteRemindersEnabled: true,
      soundEnabled: true,
      ...partial,
    }));
  });

  it('disables only Pulse alerts outside effective area and preserves the saved preference', async () => {
    serviceArea.profilePinsAllowed = false;
    const { rerender } = render(<MemoryRouter><NotificationSettings /></MemoryRouter>);
    const pulse = await screen.findByRole('switch', { name: 'Toggle Pulse alerts' });
    expect(pulse).toBeDisabled();
    expect(pulse).toBeChecked();
    fireEvent.click(pulse);
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
    for (const control of screen.getAllByRole('switch').filter((control) => control !== pulse)) {
      expect(control).toBeEnabled();
    }
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Message alerts' }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({ messagesEnabled: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Toggle Message alerts' })).toBeEnabled());
    expect(pulse).toBeChecked();

    // Physical in-area and active in-area MHC use the same effective access result.
    serviceArea.profilePinsAllowed = true;
    rerender(<MemoryRouter><NotificationSettings /></MemoryRouter>);
    expect(pulse).toBeEnabled();
    expect(pulse).toBeChecked();
    expect(updateNotificationPreferences).toHaveBeenCalledTimes(1);
    fireEvent.click(pulse);
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenLastCalledWith({ pulseEnabled: false }));
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

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Feed posts from cruushes' }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      mutualFeedEnabled: false,
    }));

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Reward updates' }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      rewardsEnabled: false,
    }));

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Email alerts' }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      emailEnabled: false,
    }));

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Site reminders' }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith({
      siteRemindersEnabled: false,
    }));
  });

  it('offers a retry after loading fails and recovers without leaving a false loading state', async () => {
    getNotificationPreferences
      .mockRejectedValueOnce(new Error('Notification settings are temporarily unavailable.'))
      .mockResolvedValueOnce({
        emailEnabled: true,
        pushEnabled: false,
        cruushEnabled: true,
        messagesEnabled: true,
        groupsEnabled: true,
        nearbyEnabled: true,
        rewardsEnabled: true,
        siteRemindersEnabled: true,
        soundEnabled: true,
      });

    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Notification settings are temporarily unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable push' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Allow in-app only' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading notification settings' }));

    expect(await screen.findByRole('switch', { name: 'Toggle Nearby people' })).toBeInTheDocument();
    expect(getNotificationPreferences).toHaveBeenCalledTimes(2);
  });

  it('offers the existing install action in the Home Screen section', async () => {
    const listener = vi.fn();
    window.addEventListener('cruush:install-requested', listener);

    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Home Screen app')).toBeInTheDocument();
    expect(screen.getByText('Add cruush to your Home Screen.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Install cruush' }));
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener('cruush:install-requested', listener);
  });
});
