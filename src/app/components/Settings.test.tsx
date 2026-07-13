import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import Settings from './Settings';

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
    expect(screen.queryByRole('switch', { name: 'Toggle precise location for mutual cruushes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Location privacy/i })).toBeInTheDocument();
  });

  it('loads blocked users and lets users unblock from settings', async () => {
    getBlockedUsers.mockResolvedValue({
      blockedUsers: [{
        userId: 'user-2',
        displayName: 'River',
        photo: null,
        createdAt: '2026-07-08T12:00:00.000Z',
      }],
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByText('Blocked users')).toBeInTheDocument();
    expect(screen.getByText('River')).toBeInTheDocument();
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
      'https://www.cruush.app/human-trafficking-policy',
    );
    expect(screen.getByRole('link', { name: 'Report or request removal of content' })).toHaveAttribute(
      'href',
      'https://www.cruush.app/content-removal',
    );
    expect(screen.getByRole('button', { name: 'Contact support' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contact support')).not.toBeInTheDocument();
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
