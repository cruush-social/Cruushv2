import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import Settings from './Settings';

const { getMyPrivacySettings, saveMyPrivacySettings } = vi.hoisted(() => ({
  getMyPrivacySettings: vi.fn(),
  saveMyPrivacySettings: vi.fn(),
}));

const { sendVerificationEmail, signOut } = vi.hoisted(() => ({
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

describe('Settings', () => {
  beforeEach(() => {
    getMyPrivacySettings.mockReset();
    saveMyPrivacySettings.mockReset();
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

  it('does not expose Safety Center or Ghost Mode controls in the general settings menu', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByText('Edit Profile')).toBeInTheDocument();
    expect(screen.queryByText('Privacy & Safety')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Toggle Ghost Mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Toggle precise location for mutual cruushes' })).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('Support subject'), {
      target: { value: 'Settings bug' },
    });
    fireEvent.change(screen.getByLabelText('Support message'), {
      target: { value: 'The settings screen got stuck after opening support.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/support-requests', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        category: 'question',
        subject: 'Settings bug',
        message: 'The settings screen got stuck after opening support.',
        source: 'settings',
        pageUrl: '/',
      }),
    })));
    expect(await screen.findByText('Support request sent')).toBeInTheDocument();
  });
});
