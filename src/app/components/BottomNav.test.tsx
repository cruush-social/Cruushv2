import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(nav).toHaveClass('cruush-map-nav');
    expect(nav.querySelector('.bg-gradient-to-t')).toBeNull();
    expect(nav.className).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom))]');

    const pill = nav.querySelector('[data-testid="bottom-nav-pill"]');

    expect(pill).toHaveClass('rounded-full', 'border', 'bg-background/68', 'backdrop-blur-md');
    expect(pill).toHaveClass('cruush-bottom-nav-pill', 'cruush-liquid-glass-dock', 'cruush-glass-menu-toggle');
    expect(pill).toHaveClass('pointer-events-auto');
    expect(pill).toHaveClass('px-1.5', 'pb-1.5', 'pt-2');
    expect(pill).toHaveClass('mx-auto');
    expect(pill).not.toHaveClass('lg:ml-auto', 'lg:mr-4');
    expect(screen.getByTestId('bottom-nav-indicator')).toHaveClass('cruush-bottom-nav-indicator');
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

  it('uses a moving active tab treatment without glow or color animation', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeButton = screen.getByRole('button', { name: /feed/i });
    const activeIcon = activeButton.querySelector('img');
    const pill = screen.getByTestId('bottom-nav-pill');
    const indicator = screen.getByTestId('bottom-nav-indicator');
    const indicatorSurface = indicator.firstElementChild;

    expect(pill.getAttribute('style')).toContain('--bottom-nav-active-offset: calc(25% - 1.125rem)');
    expect(activeButton).toHaveClass('rounded-full', 'cruush-bottom-nav-current-page', 'text-white', 'overflow-hidden');
    expect(activeButton).not.toHaveClass('cruush-glass-soft', 'bg-white/[0.10]');
    expect(activeButton.className).not.toContain('transition-colors');
    expect(activeButton.className).not.toContain('shadow-[0_0');
    expect(activeIcon?.className).not.toContain('drop-shadow');
    expect(indicatorSurface).toHaveClass('cruush-bottom-nav-indicator-surface', 'cruush-liquid-glass-current');
    expect(indicatorSurface).toHaveAttribute('data-direction', 'still');
    expect(indicatorSurface).toHaveAttribute('data-distance', '0');
  });

  it('slides the active indicator between bottom nav items without swapping colors mid-animation', async () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
        <LocationProbe />
      </MemoryRouter>
    );

    const pill = screen.getByTestId('bottom-nav-pill');
    const messagesButton = screen.getByRole('button', { name: /messages/i });

    fireEvent.click(messagesButton);

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/messages');
    expect(pill.getAttribute('style')).toContain('--bottom-nav-active-offset: calc(75% - 3.375rem)');
    expect(messagesButton.className).not.toContain('transition-colors');
    await waitFor(() => {
      const indicatorSurface = screen.getByTestId('bottom-nav-indicator').firstElementChild;

      expect(indicatorSurface).toHaveAttribute('data-direction', 'forward');
      expect(indicatorSurface).toHaveAttribute('data-distance', '2');
    });
  });

  it('does not show a false active indicator on routes outside the bottom menu', () => {
    render(
      <MemoryRouter initialEntries={['/rewards']}>
        <BottomNav />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('bottom-nav-indicator')).not.toBeInTheDocument();
    screen.getAllByRole('button').forEach((button) => {
      expect(button).not.toHaveAttribute('aria-current');
    });
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

    expect(activeButton).toHaveClass('items-center', 'justify-center', 'h-[3.75rem]', 'w-[3.75rem]');
    expect(activeIcon).toHaveClass('h-[3.6rem]', 'w-[3.6rem]', 'object-contain');
    buttons.forEach((button) => {
      expect(button).toHaveClass('h-[3.75rem]', 'w-[3.75rem]', 'min-w-0');
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
    expect(screen.getByRole('button', { name: /feed/i })).toHaveClass('cruush-bottom-nav-current-page');
    expect(screen.getByRole('button', { name: /map/i })).not.toHaveClass('cruush-bottom-nav-current-page');
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
