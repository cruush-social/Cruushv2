import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileCard from './ProfileCard';

const { revokeMutualCruush, sendCruush } = vi.hoisted(() => ({
  revokeMutualCruush: vi.fn(),
  sendCruush: vi.fn(),
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
    revokeMutualCruush.mockResolvedValue({ revoked: true });
  });

  it('lets users revoke an existing mutual from the profile card', async () => {
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
              canMessage: true,
            },
          }}
          onClose={vi.fn()}
          onViewProfile={vi.fn()}
        />
      </MemoryRouter>
    );

    const cruushButton = screen.getByRole('button', { name: 'Remove mutual cruush' });
    expect(cruushButton).not.toBeDisabled();
    expect(cruushButton).toHaveTextContent('remove');

    fireEvent.click(cruushButton);
    await waitFor(() => expect(revokeMutualCruush).toHaveBeenCalledWith('user-1'));
    expect(sendCruush).not.toHaveBeenCalled();
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
