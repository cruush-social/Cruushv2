import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileCard from './ProfileCard';

const { getProfileById, revokeMutualCruush, sendCruush } = vi.hoisted(() => ({
  getProfileById: vi.fn(),
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

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getProfileById,
  };
});

describe('ProfileCard', () => {
  beforeEach(() => {
    getProfileById.mockReset();
    revokeMutualCruush.mockReset();
    sendCruush.mockReset();
    getProfileById.mockResolvedValue({
      photos: ['/jordan.jpg'],
      photo_metadata: [{ url: '/jordan.jpg', explicit: false }],
    });
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

    const cruushButton = screen.getByRole('button', { name: 'Uncruush' });
    expect(cruushButton).not.toBeDisabled();
    expect(cruushButton).toHaveTextContent('uncruush');

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

  it('uses compact inline media sizing with only the first three vibe capsules', () => {
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
            vibes: ['Goth', 'Punk', 'Club kid', 'Leather'],
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
    expect(screen.getByTestId('profile-card-vibes')).toHaveClass('flex-nowrap', 'overflow-hidden');
    // A long vibe has to ellipsise inside its own block box. Truncating on the
    // badge itself clipped the label at both ends, because the badge is a
    // centred flex row and text-overflow does not apply to a flex item.
    const clubKidLabel = screen.getByText('Club kid');
    expect(clubKidLabel.tagName).toBe('SPAN');
    expect(clubKidLabel).toHaveClass('block', 'truncate');
    expect(clubKidLabel.parentElement).toHaveClass('min-w-0', 'shrink');
    expect(clubKidLabel.parentElement).not.toHaveClass('truncate');
    expect(screen.getByText('Goth')).toBeInTheDocument();
    expect(screen.getByText('Punk')).toBeInTheDocument();
    expect(screen.getByText('Club kid')).toBeInTheDocument();
    expect(screen.queryByText('Leather')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Full Profile' })).toHaveClass('h-10');
  });

  it('fills the carousel result and switches its full 4:5 photo from heart-shaped gallery controls', async () => {
    const onBrowseAgain = vi.fn();
    const onViewProfile = vi.fn();
    getProfileById.mockResolvedValue({
      photos: ['/jordan.jpg', '/jordan-2.jpg', '/jordan-3.jpg', '/jordan-4.jpg'],
      photo_metadata: [
        { url: '/jordan.jpg', explicit: false },
        { url: '/jordan-2.jpg', explicit: false },
        { url: '/jordan-3.jpg', explicit: false },
        { url: '/jordan-4.jpg', explicit: false },
      ],
    });

    render(
      <MemoryRouter>
        <ProfileCard
          density="compact"
          fillAvailableHeight
          placement="inline"
          presentation="carousel"
          user={{
            id: 'user-1',
            name: 'Jordan with a deliberately long display name',
            age: 26,
            pronouns: 'they/them',
            distance: '0.2 mi',
            lookingFor: ['Fun'],
            vibes: ['Goth', 'Punk', 'Club kid', 'Leather'],
            photo: '/jordan.jpg',
            relationship: {
              canMessage: false,
            },
          }}
          onBrowseAgain={onBrowseAgain}
          onClose={vi.fn()}
          onViewProfile={onViewProfile}
        />
      </MemoryRouter>
    );

    const card = screen.getByTestId('profile-card');
    const browseAgainButton = screen.getByRole('button', { name: 'Browse again' });
    expect(card).toHaveClass('h-full', 'min-h-0', 'max-w-2xl', 'overflow-hidden');
    expect(card).not.toHaveClass('aspect-[4/5]');
    expect(screen.getByTestId('profile-card-media')).toHaveClass('absolute', 'inset-0', 'items-center', 'justify-center');
    expect(screen.getByRole('img', { name: 'Jordan with a deliberately long display name' })).toHaveClass('h-full', 'w-full', 'object-cover');
    expect(screen.getByTestId('carousel-profile-glass')).not.toHaveClass('bg-black/60', 'backdrop-blur-xl');
    expect(card).toContainElement(browseAgainButton);
    expect(browseAgainButton).toHaveClass('bg-black/55', 'backdrop-blur-xl');
    expect(screen.getByRole('button', { name: 'cruushes only' })).toBeDisabled();
    expect(screen.getByTestId('profile-card-vibes')).toHaveTextContent('GothPunkClub kid');
    expect(screen.queryByText('Leather')).not.toBeInTheDocument();

    const secondPhotoHeart = await screen.findByRole('button', { name: 'Show profile photo 2' });
    expect(screen.getByTestId('carousel-profile-photo-hearts')).toContainElement(secondPhotoHeart);
    fireEvent.click(secondPhotoHeart);
    expect(screen.getByTestId('carousel-profile-photo')).toHaveAttribute('src', '/jordan-2.jpg');
    expect(screen.getByRole('button', { name: 'Show profile photo 1' })).toBeInTheDocument();

    fireEvent.click(browseAgainButton);
    fireEvent.click(screen.getByRole('button', { name: 'View Full Profile' }));
    expect(onBrowseAgain).toHaveBeenCalledTimes(1);
    expect(onViewProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps a single-photo carousel result free of empty gallery controls', () => {
    render(
      <MemoryRouter>
        <ProfileCard
          density="compact"
          fillAvailableHeight
          placement="inline"
          presentation="carousel"
          user={{
            id: 'user-1',
            name: 'Jordan',
            age: 26,
            pronouns: 'they/them',
            distance: '0.2 mi',
            lookingFor: ['Fun'],
            vibes: ['Goth'],
            photo: '/jordan.jpg',
            photos: ['/jordan.jpg'],
          }}
          onClose={vi.fn()}
          onViewProfile={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('carousel-profile-photo')).toHaveAttribute('src', '/jordan.jpg');
    expect(screen.queryByTestId('carousel-profile-photo-hearts')).not.toBeInTheDocument();
    expect(getProfileById).not.toHaveBeenCalled();
  });

  it('shows a large DL Mode icon and label on a masked carousel card', () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'true');

    render(
      <MemoryRouter>
        <ProfileCard
          density="compact"
          fillAvailableHeight
          placement="inline"
          presentation="carousel"
          user={{
            id: 'user-explicit',
            name: 'Jordan',
            photo: '/explicit-card.jpg',
            photoExplicit: true,
            photo_metadata: [{ url: '/explicit-card.jpg', explicit: true }],
            lookingFor: [],
            vibes: [],
          }}
          onClose={vi.fn()}
          onViewProfile={vi.fn()}
        />
      </MemoryRouter>,
    );

    const placeholder = screen.getByTestId('dl-mode-photo-placeholder');
    expect(placeholder).toHaveClass('w-28');
    expect(placeholder.querySelector('text')).toHaveTextContent('cruushes only');
    expect(screen.queryByTestId('carousel-profile-photo')).not.toBeInTheDocument();
  });
});
