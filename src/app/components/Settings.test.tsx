import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import Settings from './Settings';
import BlockedUsersPage from './BlockedUsersPage';
import {
  ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
  saveAccessibilityPreferences,
} from '../lib/accessibilityPreferences';

const { getMyPrivacySettings, saveMyPrivacySettings } = vi.hoisted(() => ({
  getMyPrivacySettings: vi.fn(),
  saveMyPrivacySettings: vi.fn(),
}));

const { changePassword, deleteAccount, sendVerificationEmail, signOut } = vi.hoisted(() => ({
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  sendVerificationEmail: vi.fn(),
  signOut: vi.fn(),
}));

const { getMyProfile } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
}));

const { getBlockedUsers, unblockUser } = vi.hoisted(() => ({
  getBlockedUsers: vi.fn(),
  unblockUser: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const {
  clearCurrentUser,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  setVerificationPreviewUrl,
} = vi.hoisted(() => ({
  clearCurrentUser: vi.fn(),
  getStoredCurrentUser: vi.fn(),
  getVerificationPreviewUrl: vi.fn(),
  setVerificationPreviewUrl: vi.fn(),
}));

vi.mock('../lib/privacyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/privacyApi')>('../lib/privacyApi');

  return {
    ...actual,
    getMyPrivacySettings,
    saveMyPrivacySettings,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

vi.mock('../lib/authApi', () => ({
  changePassword,
  deleteAccount,
  sendVerificationEmail,
  signOut,
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
  };
});

vi.mock('../lib/blockApi', () => ({
  getBlockedUsers,
  unblockUser,
}));

vi.mock('../lib/sessionUser', () => ({
  clearCurrentUser,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  setVerificationPreviewUrl,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('Settings', () => {
  beforeEach(() => {
    getMyPrivacySettings.mockReset();
    saveMyPrivacySettings.mockReset();
    changePassword.mockReset();
    deleteAccount.mockReset();
    sendVerificationEmail.mockReset();
    signOut.mockReset();
    getMyProfile.mockReset();
    getBlockedUsers.mockReset();
    unblockUser.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    clearCurrentUser.mockReset();
    getStoredCurrentUser.mockReset();
    getVerificationPreviewUrl.mockReset();
    setVerificationPreviewUrl.mockReset();

    getStoredCurrentUser.mockReturnValue({
      display_name: 'Jordan',
      email_verified_at: '2026-04-29T12:00:00.000Z',
    });
    getVerificationPreviewUrl.mockReturnValue(null);
    getMyProfile.mockResolvedValue({
      id: 'settings-user',
      display_name: 'Jordan',
      photos: ['/api/media/assets/photo-1/display'],
      photo_metadata: [{ url: '/api/media/assets/photo-1/display', explicit: false }],
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    getMyPrivacySettings.mockResolvedValue({
      ghostModeEnabled: false,
      preciseLocationVisibility: 'none',
    });
    saveMyPrivacySettings.mockImplementation((settings) => Promise.resolve(settings));
    changePassword.mockResolvedValue({ changed: true });
    deleteAccount.mockResolvedValue(undefined);
    getBlockedUsers.mockResolvedValue({
      blockedUsers: [],
    });
    unblockUser.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: 'support-2',
        status: 'open',
        aiTriageStatus: 'pending',
        createdAt: '2026-07-07T12:00:00.000Z',
      },
    }), { status: 201 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.removeItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
    document.documentElement.removeAttribute('data-cruush-high-contrast');
    document.documentElement.removeAttribute('data-cruush-larger-text');
    document.documentElement.removeAttribute('data-cruush-reduce-motion');
  });

  it('does not expose Safety Center or Ghost Mode switches in the general settings menu', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByText('Edit Profile')).toBeInTheDocument();
    expect(screen.queryByText('Privacy & Safety')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Toggle Ghost Mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Toggle precise location for mutuals' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Location privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /DL Mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Two-factor authentication/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rewards/i })).toHaveTextContent(
      'Streaks, referrals, and promotional access.',
    );
  });

  it('returns directly to the main map from the Settings header', async () => {
    render(
      <MemoryRouter initialEntries={['/map', '/settings']} initialIndex={1}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/map" element={<div>Main map</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Back to map' }));
    expect(await screen.findByText('Main map')).toBeInTheDocument();
  });

  it('renders Edit Profile with the same winged-heart icon as the bottom navigation', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const editProfile = await screen.findByRole('button', { name: 'Edit Profile' });
    const icon = editProfile.querySelector('[data-testid="edit-profile-bottom-nav-icon"]');

    expect(icon).toHaveClass('h-5', 'w-5');
    expect(icon).toHaveStyle({ background: 'var(--cruush-gradient)' });
    expect(icon?.getAttribute('style')).toContain('humanity-profile-selected-winged-heart-symmetric');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByText('Email verified')).toBeInTheDocument();
    expect(screen.queryByLabelText('Jordan profile photo')).not.toBeInTheDocument();
  });

  it('keeps accessibility controls synchronized with the global preferences', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByRole('switch', { name: 'Reduce motion' })).not.toBeChecked();

    act(() => {
      saveAccessibilityPreferences({
        highContrast: true,
        largerText: true,
        reduceMotion: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeChecked();
      expect(screen.getByRole('switch', { name: 'Larger text' })).toBeChecked();
      expect(screen.getByRole('switch', { name: 'Increase contrast' })).toBeChecked();
    });
  });

  it('shows the v1.5 footer with the approved cruush logo and no redundant footer links', async () => {
    const { container } = render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const version = await screen.findByText('Version 1.5');
    const openBeta = screen.getByText('OPEN BETA');
    expect(version.parentElement).toContainElement(openBeta);
    expect(container.querySelector('img[src*="cruush-logo.svg"]')).toHaveAttribute('alt', 'cruush');
    expect(screen.queryByRole('button', { name: 'Terms' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Privacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Support' })).not.toBeInTheDocument();
  });

  it('shows active moderators a direct dashboard entry', async () => {
    getStoredCurrentUser.mockReturnValue({
      display_name: 'Moderator',
      email_verified_at: '2026-04-29T12:00:00.000Z',
      moderator_role: 'moderator',
    });
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Moderator dashboard/i }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin/moderation');
  });

  it('opens the current changelog without version-coupled settings copy', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
        <LocationProbe />
      </MemoryRouter>,
    );

    const changelogButton = await screen.findByRole('button', { name: /Changelog/i });

    expect(changelogButton).toHaveTextContent('See what is new in cruush.');
    fireEvent.click(changelogButton);
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/changelog');
  });

  it('opens blocked users from settings and lets users unblock there', async () => {
    getBlockedUsers.mockResolvedValue({
      blockedUsers: [{
        userId: 'user-2',
        displayName: 'River',
        photo: null,
        createdAt: '2026-07-08T12:00:00.000Z',
      }],
    });

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/blocked-users" element={<BlockedUsersPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Blocked users/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/blocked-users');
    expect(await screen.findByText('River')).toBeInTheDocument();
    expect(screen.getAllByText(/Blocked/).length).toBeGreaterThan(0);
    expect(screen.queryByText('river@example.com')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));

    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith('user-2'));
    await waitFor(() => expect(screen.queryByText('River')).not.toBeInTheDocument());
    expect(screen.getByText('You have not blocked anyone.')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('River unblocked.');
  });

  it('lets signed-in users contact support from settings and reach public policy pages', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByRole('link', { name: 'Human trafficking policy' })).toHaveAttribute(
      'href',
      '/human-trafficking-policy',
    );
    expect(screen.getByRole('link', { name: 'Report or request removal of content' })).toHaveAttribute(
      'href',
      '/content-removal',
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('button', { name: 'Contact support' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contact support')).not.toBeInTheDocument();
  });

  it('shows open map attribution links in settings', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByText('Map attribution')).toBeInTheDocument();
    expect(screen.getByText(/cruush maps use open map data/i)).toHaveTextContent(
      'Map data \u00a9 OpenStreetMap contributors.',
    );
    expect(screen.getByRole('link', { name: /OpenStreetMap contributors/i })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
    expect(screen.getByRole('link', { name: /OpenFreeMap/i })).toHaveAttribute(
      'href',
      'https://openfreemap.org/',
    );
    expect(screen.getByRole('link', { name: /OpenMapTiles/i })).toHaveAttribute(
      'href',
      'https://www.openmaptiles.org/',
    );
    expect(screen.getByRole('link', { name: /CARTO/i })).toHaveAttribute(
      'href',
      'https://carto.com/attributions',
    );
  });

  it('opens notification settings from the account menu', async () => {
    render(
      <MemoryRouter>
        <Settings />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/notifications');
  });

  it('opens location privacy from settings', async () => {
    render(
      <MemoryRouter>
        <Settings />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Location privacy/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/privacy/ghost-mode');
  });

  it('opens DL Mode privacy from settings', async () => {
    render(
      <MemoryRouter>
        <Settings />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /DL Mode/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/privacy/dl-mode');
  });

  it('lets signed-in users change their password from settings', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'current-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password-123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'current-password',
      newPassword: 'new-password-123',
    }));
    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
  });

  it('requires explicit confirmation before deleting the account', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'current-password' },
    });
    fireEvent.change(screen.getByLabelText('Type DELETE'), {
      target: { value: 'DELETE' },
    });
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete account' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith({
      password: 'current-password',
      confirmation: 'DELETE',
    }));
    expect(clearCurrentUser).toHaveBeenCalled();
  });
});
