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
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('BottomNav', () => {
  beforeEach(() => {
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
    expect(nav.querySelector('.bg-gradient-to-t')).toBeNull();
    expect(nav.className).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom))]');

    const pill = nav.querySelector('[data-testid="bottom-nav-pill"]');

    expect(pill).toHaveClass('rounded-full', 'border', 'bg-background/68', 'backdrop-blur-md');
    expect(pill).toHaveClass('px-1.5', 'pb-1.5', 'pt-2');
    expect(pill).toHaveClass('mx-auto', 'lg:ml-auto', 'lg:mr-4');
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
  });

  it('opens the desktop profile preview instead of navigating to the profile page', () => {
    const onProfilePreviewRequest = vi.fn();

    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav onProfilePreviewRequest={onProfilePreviewRequest} />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    expect(onProfilePreviewRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
  });

  it('shows the desktop profile icon as active while the profile preview is open', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav isProfilePreviewOpen />
      </MemoryRouter>
    );

    const profileButton = screen.getByRole('button', { name: /profile/i });
    const profileIcon = profileButton.querySelector('img');

    expect(profileButton).toHaveClass('bg-white/[0.10]');
    expect(profileButton).toHaveAttribute('aria-current', 'page');
    expect(profileIcon?.getAttribute('src')).toContain('profile-colored');
  });

  it('navigates to the full profile page from the profile icon on mobile', () => {
    useIsMobile.mockReturnValue(true);
    const onProfilePreviewRequest = vi.fn();

    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav onProfilePreviewRequest={onProfilePreviewRequest} />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    expect(onProfilePreviewRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile');
  });
});
