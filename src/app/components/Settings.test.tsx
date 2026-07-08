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

vi.mock('../lib/authApi', () => ({
  sendVerificationEmail,
  signOut,
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
