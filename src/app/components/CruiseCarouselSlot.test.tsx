import { fireEvent, render, screen } from '@testing-library/react';
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

    const upgradeButton = await screen.findByRole('button', { name: 'Get cruush+' });
    const cruushPlusWord = upgradeButton.querySelector('.cruush-logo-font');

    expect(upgradeButton).toBeInTheDocument();
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
});
