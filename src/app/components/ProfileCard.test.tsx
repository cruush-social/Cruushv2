import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileCard from './ProfileCard';

const { revokeMutualCruush, sendCruush } = vi.hoisted(() => ({
  revokeMutualCruush: vi.fn(),
  sendCruush: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

vi.mock('../lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/cruushApi')>('../lib/cruushApi');

  return {
    ...actual,
    revokeMutualCruush,
    sendCruush,
  };
});

describe('ProfileCard', () => {
  beforeEach(() => {
    revokeMutualCruush.mockReset();
    sendCruush.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    revokeMutualCruush.mockResolvedValue({ revoked: true });
  });

  it('revokes the mutual cruush when an existing mutual button is tapped', async () => {
    render(
      <MemoryRouter>
        <ProfileCard
          user={{
            id: 'user-1',
            name: 'Jordan',
            age: 26,
            pronouns: 'they/them',
            distance: '0.2 mi',
            lookingFor: ['Fun'],
            vibes: ['Goth'],
            photo: null,
            relationship: {
              mutualCruush: true,
              outgoingCruush: true,
              canMessage: true,
            },
          }}
          onClose={vi.fn()}
          onViewProfile={vi.fn()}
        />
      </MemoryRouter>
    );

    const cruushButton = screen.getByRole('button', { name: 'Remove mutual cruush' });
    expect(cruushButton).toBeEnabled();
    expect(cruushButton).toHaveTextContent('remove');

    fireEvent.click(cruushButton);
    await waitFor(() => expect(revokeMutualCruush).toHaveBeenCalledWith('user-1'));
    expect(sendCruush).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Removed mutual cruush with Jordan.');
    expect(screen.getByRole('button', { name: 'send cruush' })).toHaveTextContent('cruush');
  });

  it('can render inline for page-level feature results', () => {
    const { container } = render(
      <MemoryRouter>
        <ProfileCard
          placement="inline"
          user={{
            id: 'user-1',
            name: 'Jordan',
            age: 26,
            pronouns: 'they/them',
            distance: '0.2 mi',
            lookingFor: ['Fun'],
            vibes: ['Goth'],
            photo: null,
          }}
          onClose={vi.fn()}
          onViewProfile={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(container.firstElementChild).not.toHaveClass('fixed');
    expect(screen.getByText('Jordan, 26')).toBeInTheDocument();
  });

  it('uses compact inline media sizing without extra detail sections', () => {
    render(
      <MemoryRouter>
        <ProfileCard
          density="compact"
          placement="inline"
          user={{
            id: 'user-1',
            name: 'Jordan',
            age: 26,
            pronouns: 'they/them',
            distance: '0.2 mi',
            lookingFor: ['Fun'],
            vibes: ['Goth'],
            photo: null,
          }}
          onClose={vi.fn()}
          onViewProfile={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('profile-card')).not.toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('profile-card-media')).toHaveStyle({
      aspectRatio: '4 / 3',
      height: 'clamp(12.5rem, 34dvh, 18rem)',
    });
    expect(screen.queryByText('Looking for')).not.toBeInTheDocument();
    expect(screen.queryByText('Vibes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Full Profile' })).toHaveClass('h-10');
  });
});
