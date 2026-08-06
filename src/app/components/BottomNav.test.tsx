import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BottomNav from './BottomNav';

const { useIsMobile } = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
}));

vi.mock('./ui/use-mobile', () => ({
  useIsMobile,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}:{JSON.stringify(location.state ?? null)}</div>;
}

describe('BottomNav', () => {
  beforeEach(() => {
    useIsMobile.mockReset();
    useIsMobile.mockReturnValue(false);
  });

  it('navigates to /map when the map button is pressed', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /map/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
  });

  it('keeps bottom menu labels accessible without rendering visible text', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /map/i })).toBeInTheDocument();
    expect(screen.queryByText('Map')).not.toBeInTheDocument();
    expect(screen.queryByText('Feed')).not.toBeInTheDocument();
    expect(screen.queryByText('cruush')).not.toBeInTheDocument();
    expect(screen.queryByText('Messages')).not.toBeInTheDocument();
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });

  it('renders a contained pill surface without a progressive fade overlay on the map', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation');

    expect(nav.className).not.toContain('bg-background');
    expect(nav.className).not.toContain('border-t');
    expect(nav.className).not.toContain('bg-background/');
    expect(nav.className).not.toContain('backdrop-blur');
    expect(nav).toHaveClass('pointer-events-none');
    expect(nav.querySelector('.bg-gradient-to-t')).toBeNull();
    expect(nav.className).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom))]');

    const pill = nav.querySelector('[data-testid="bottom-nav-pill"]');

    expect(pill).toHaveClass('rounded-full', 'border', 'bg-background/68', 'backdrop-blur-md');
    expect(pill).toHaveClass('pointer-events-auto');
    expect(pill).toHaveClass('px-1.5', 'pb-1.5', 'pt-2');
    // The pill is no longer centred on its own: it shares an mx-auto row with the docked
    // bug button and takes the width that row has left.
    expect(pill).toHaveClass('flex-1', 'min-w-0');
    expect(pill!.parentElement).toHaveClass('mx-auto', 'max-w-[26rem]');
    expect(pill).not.toHaveClass('lg:ml-auto', 'lg:mr-4');
  });

  it('adds a bottom backdrop on scroll-heavy non-map pages', () => {
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <BottomNav />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation');
    const backdrop = nav.querySelector('.bg-gradient-to-t');

    expect(backdrop).toHaveClass('h-28', 'from-background', 'from-[68%]', 'via-background/96', 'via-[82%]', 'to-background/0');
  });

  it('uses a circular active tab treatment without glow', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeButton = screen.getByRole('button', { name: /feed/i });
    const activeIcon = activeButton.querySelector('img');

    expect(activeButton).toHaveClass('rounded-full', 'bg-white/[0.10]');
    expect(activeButton.className).toContain('hover:bg-white/[0.12]');
    expect(activeButton.className).not.toContain('shadow-[0_0');
    expect(activeIcon?.className).not.toContain('drop-shadow');
  });

  it('keeps all five icons centered inside mobile-safe circular tabs', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeButton = screen.getByRole('button', { name: /feed/i });
    const activeIcon = activeButton.querySelector('img');
    const buttons = screen.getAllByRole('button');

    // Tabs cap at 3.75rem but may shrink below it so the pill can make room for the
    // docked bug button on a narrow phone. aspect-square keeps them circles at every
    // width they shrink to - they must never become ovals.
    expect(activeButton).toHaveClass('items-center', 'justify-center', 'aspect-square', 'max-w-[3.75rem]');
    expect(activeIcon).toHaveClass('object-contain');
    buttons.forEach((button) => {
      expect(button).toHaveClass('aspect-square', 'max-w-[3.75rem]', 'min-w-0', 'rounded-full');
      expect(button).not.toHaveClass('shrink-0');
    });
  });

  it('uses colored icons for the current page and white icons for inactive pages', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeFeedIcon = screen.getByRole('button', { name: /feed/i }).querySelector('img');
    const inactiveMapIcon = screen.getByRole('button', { name: /map/i }).querySelector('img');

    expect(activeFeedIcon?.getAttribute('src')).toContain('feed-colored');
    expect(inactiveMapIcon?.getAttribute('src')).toContain('map-white');
  });

  it('opens the desktop profile side panel from the profile icon on the map', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map:{"openOwnProfilePanel":true}');
  });

  it('opens the desktop profile side panel from the profile icon on non-map pages', () => {
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <BottomNav />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map:{"openOwnProfilePanel":true}');
  });

  it('navigates to the full profile page from the profile icon on mobile', () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile:null');
  });
});

// Regression: the bug reporter used to float over page content and landed on photo-tile
// buttons, feed post controls and moderation queue rows. It now docks into the nav band,
// the one strip every page reserves and never draws into.
describe('BottomNav bug report dock', () => {
  it('exposes a dock slot beside the pill and registers it', async () => {
    const { registerBugButtonSlot, getBugButtonSlot } = await import('../lib/bugButtonSlot');
    registerBugButtonSlot(null);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const slot = screen.getByTestId('bottom-nav-bug-slot');
    expect(getBugButtonSlot()).toBe(slot);
    expect(screen.getByTestId('bottom-nav-pill')).not.toContainElement(slot);
    expect(slot.parentElement).toContainElement(screen.getByTestId('bottom-nav-pill'));

    unmount();
  });

  it('lets the pill shrink so the docked button never has to sit on top of it', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const pill = screen.getByTestId('bottom-nav-pill');
    expect(pill.className).toContain('min-w-0');
    expect(pill.className).toContain('flex-1');
    expect(pill.className).not.toContain('max-w-[23rem]');
    // Nav icons have to be able to give up width too, or the pill cannot shrink.
    expect(screen.getByRole('button', { name: /map/i }).className).toContain('min-w-0');
    expect(screen.getByRole('button', { name: /map/i }).className).not.toContain('shrink-0');
  });
});
