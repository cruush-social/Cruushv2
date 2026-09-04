import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The DM list, cruush activity and blocked-users list each rendered another
// person's primary photo with no DL Mode masking at all, because their
// endpoints never returned the explicit classification. These lock that shut.
//
// HeartPhoto omits its <image> element when masked, so "is there an <image>"
// is the assertion that matters on every surface.

const blockApi = vi.hoisted(() => ({ getBlockedUsers: vi.fn(), unblockUser: vi.fn() }));

vi.mock('../lib/blockApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/blockApi')>('../lib/blockApi');
  return { ...actual, ...blockApi };
});

import BlockedUsersPage from './BlockedUsersPage';

function setDlMode(enabled: boolean) {
  window.localStorage.setItem('cruush:dl-mode-enabled', enabled ? 'true' : 'false');
}

// A masked avatar still draws the DL Mode mark, so the presence of an <image>
// no longer separates masked from visible. Ask the question that matters: does
// the private photo reach the DOM at all?
function referencesPhoto(label: string, file: string) {
  return screen.getAllByLabelText(label).at(-1)?.innerHTML.includes(file) ?? false;
}

describe('DL Mode masking across list surfaces', () => {
  beforeEach(() => {
    window.localStorage.clear();
    blockApi.getBlockedUsers.mockReset();
    blockApi.unblockUser.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('blocked users list', () => {
    const blocked = [
      {
        userId: 'user-explicit',
        displayName: 'river',
        photo: '/media/river.jpg',
        photoExplicit: true,
        createdAt: '2026-08-01T12:00:00.000Z',
      },
      {
        userId: 'user-safe',
        displayName: 'sky',
        photo: '/media/sky.jpg',
        createdAt: '2026-08-01T12:00:00.000Z',
      },
    ];

    it('masks an explicit avatar while DL Mode is on', async () => {
      setDlMode(true);
      blockApi.getBlockedUsers.mockResolvedValue({ blockedUsers: blocked });

      render(<MemoryRouter><BlockedUsersPage /></MemoryRouter>);

      await waitFor(() => expect(screen.getByText('river')).toBeInTheDocument());

      expect(referencesPhoto('river avatar', 'river.jpg')).toBe(false);
      expect(referencesPhoto('sky avatar', 'sky.jpg')).toBe(true);
    });

    it('shows the same avatar once DL Mode is off', async () => {
      setDlMode(false);
      blockApi.getBlockedUsers.mockResolvedValue({ blockedUsers: blocked });

      render(<MemoryRouter><BlockedUsersPage /></MemoryRouter>);

      await waitFor(() => expect(screen.getByText('river')).toBeInTheDocument());

      expect(referencesPhoto('river avatar', 'river.jpg')).toBe(true);
    });
  });
});
