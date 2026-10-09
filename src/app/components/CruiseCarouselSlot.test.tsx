import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CruiseCarouselSlot from './CruiseCarouselSlot';

describe('CruiseCarouselSlot', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('uses browse language instead of slot-machine language', async () => {
    render(
      <CruiseCarouselSlot
        mode="locked"
        variant="page"
        browseDurationMs={1}
      />,
    );

    // The control is the round button the profile surfaces use, with its word
    // under it rather than inside it.
    const upgradeButton = await screen.findByRole('button', { name: 'Get cruush+' });
    const cruushPlusWord = upgradeButton.parentElement?.querySelector('.cruush-logo-font');

    expect(upgradeButton).toBeInTheDocument();
    expect(upgradeButton).toHaveClass('rounded-full', 'size-12');
    expect(cruushPlusWord).toHaveTextContent('cruush+');
    expect(screen.getByLabelText('cruise carousel')).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName.toLowerCase() === 'p' &&
      element.textContent === 'Browse nearby profiles with cruush+.'
    ))).toBeInTheDocument();
    expect(screen.queryByText(/slot|spin|spinning|reel/i)).not.toBeInTheDocument();
  });

  it('offers to browse again when the carousel is empty', async () => {
    const onRetry = vi.fn();

    render(
      <CruiseCarouselSlot
        mode="empty"
        variant="page"
        onRetry={onRetry}
        browseDurationMs={1}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Browse again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Spin again' })).not.toBeInTheDocument();
  });

  it('keeps profile tiles at 4:5 and fits the featured frame to the current item', async () => {
    render(
      <CruiseCarouselSlot
        mode="profile"
        variant="page"
        targetUser={{
          id: 'nearby-user',
          name: 'Nearby user',
          display_name: 'Nearby user',
          age: 30,
          pronouns: 'they/them',
          lat: 40.73,
          lng: -73.97,
          lastActive: '2m ago',
          distance: '1 mi',
          lookingFor: [],
          vibes: [],
          position: [],
          role: [],
          hostingTravel: [],
          photo: null,
        }}
        browseDurationMs={1}
      />,
    );

    const tiles = screen.getAllByTestId('cruise-carousel-profile-tile');
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(tile).toHaveClass('aspect-[4/5]'));
    expect(screen.getByTestId('cruise-carousel-featured-frame')).toHaveClass('aspect-[4/5]');

    await screen.findByText('Found Nearby user nearby.');

    expect(screen.getByTestId('cruise-carousel-featured-frame')).toHaveClass('aspect-[4/5]');
  });

  it('makes the DL Mode icon and label large on the featured Cruise Carousel card', async () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'true');
    render(
      <CruiseCarouselSlot
        mode="profile"
        variant="page"
        targetUser={{
          id: 'explicit-user',
          name: 'Explicit user',
          display_name: 'Explicit user',
          age: 30,
          pronouns: 'they/them',
          lat: 40.73,
          lng: -73.97,
          lastActive: '2m ago',
          distance: '1 mi',
          lookingFor: [],
          vibes: [],
          position: [],
          role: [],
          hostingTravel: [],
          photo: '/explicit-carousel.jpg',
          photoExplicit: true,
        }}
        browseDurationMs={1}
      />,
    );

    await screen.findByText('Found Explicit user nearby.');
    const featuredTile = screen.getAllByTestId('cruise-carousel-profile-tile')
      .find((tile) => tile.className.includes('w-[15rem]'));
    const placeholder = featuredTile?.querySelector('[data-testid="dl-mode-photo-placeholder"]');
    expect(placeholder).toHaveClass('w-28');
    expect(placeholder?.querySelector('text')).toHaveTextContent('DL MODE ON');
  });

  it('varies an in-flight near miss without changing the settled profile result', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const targetUser = {
      id: 'target-user',
      name: 'Target user',
      display_name: 'Target user',
      age: 30,
      pronouns: 'they/them',
      lat: 40.73,
      lng: -73.97,
      lastActive: '2m ago',
      distance: '1 mi',
      lookingFor: [],
      vibes: [],
      position: [],
      role: [],
      hostingTravel: [],
      photo: null,
    };

    render(
      <CruiseCarouselSlot
        mode="profile"
        variant="page"
        candidateUsers={[targetUser, { ...targetUser, id: 'other-user', name: 'Other user', display_name: 'Other user' }]}
        targetUser={targetUser}
        browseDurationMs={120}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(52);
    });
    expect(document.querySelector('.cruise-carousel-reel-near-miss')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(68);
    });
    const featuredTarget = screen.getAllByTestId('cruise-carousel-profile-tile')
      .find((tile) => tile.className.includes('w-[15rem]'));
    expect(featuredTarget).toHaveAttribute('data-carousel-profile-id', 'target-user');

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
