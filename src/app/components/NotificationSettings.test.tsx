import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationSettings from './NotificationSettings';

const {
  getNotificationPreferences,
  getVapidPublicKey,
  updateNotificationPreferences,
} = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  getVapidPublicKey: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock('../lib/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/notificationsApi')>('../lib/notificationsApi');

  return {
    ...actual,
    getNotificationPreferences,
    getVapidPublicKey,
    updateNotificationPreferences,
  };
});

describe('NotificationSettings', () => {
  beforeEach(() => {
    getNotificationPreferences.mockReset();
    getVapidPublicKey.mockReset();
    updateNotificationPreferences.mockReset();
    getNotificationPreferences.mockResolvedValue({
      pushEnabled: false,
      cruushEnabled: true,
      messagesEnabled: true,
      groupsEnabled: true,
    });
    getVapidPublicKey.mockResolvedValue({
      enabled: false,
      publicKey: '',
    });
    updateNotificationPreferences.mockImplementation((partial) => Promise.resolve({
      pushEnabled: false,
      cruushEnabled: true,
      messagesEnabled: false,
      groupsEnabled: true,
      ...partial,
    }));
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
