import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BottomNav from './BottomNav';
import {
  DESKTOP_PAGE_LAYOUT_STORAGE_KEY,
  saveDesktopPageLayout,
} from '../lib/desktopPageLayoutPreferences';

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
    window.localStorage.removeItem(DESKTOP_PAGE_LAYOUT_STORAGE_KEY);
  });

  it('keeps the supplied no-notch cruush logo as the canonical full-logo asset', () => {
    const logo = readFileSync(resolve(process.cwd(), 'src/app/assets/brand/cruush-logo.svg'));

    expect(createHash('sha256').update(logo).digest('hex'))
      .toBe('928d31f785515d958b2efb9778b1d5082e6e677df49e6426cf4be0942fbcace1');
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
    expect(screen.getByRole('button', { name: /feed/i })).toHaveAttribute('data-tutorial-target', 'feed');
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
    expect(pill).toHaveClass('mx-auto');
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

  it('uses icon tone alone for active tabs without a resting grey circle', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeButton = screen.getByRole('button', { name: /feed/i });
    const activeIcon = activeButton.querySelector('img');

    expect(activeButton).toHaveClass('rounded-full', 'bg-transparent');
    expect(activeButton).not.toHaveClass('bg-white/[0.10]', 'hover:bg-white/[0.12]');
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
    const mapIcon = screen.getByTestId('bottom-nav-map-icon');
    const buttons = screen.getAllByRole('button');

    expect(activeButton).toHaveClass('items-center', 'justify-center', 'h-[3.75rem]', 'w-[3.75rem]');
    expect(mapIcon).toHaveClass('h-12', 'w-12');
    buttons.forEach((button) => {
      expect(button).toHaveClass('h-[3.75rem]', 'w-[3.75rem]', 'min-w-0');
    });
  });

  it('uses the linked globe as a white mask and fills it with the cruush gradient when active', () => {
    const inactiveRender = render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const inactiveIcon = screen.getByTestId('bottom-nav-map-icon');
    expect(inactiveIcon).toHaveAttribute('data-source', 'Noun Project globe 7869983 by poernomo hasikin');
    expect(inactiveIcon).toHaveAttribute('data-tone', 'white');
    expect(inactiveIcon).toHaveStyle({ background: '#ffffff' });
    expect(inactiveIcon.style.maskImage).toContain('globe-noun-project-7869983.png');

    inactiveRender.unmount();

    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeIcon = screen.getByTestId('bottom-nav-map-icon');
    expect(activeIcon).toHaveAttribute('data-tone', 'gradient');
    expect(activeIcon).toHaveStyle({ background: 'var(--cruush-gradient)' });
  });

  it('uses a larger Feed glyph without resizing its navigation button', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeFeedIcon = screen.getByRole('button', { name: /feed/i }).querySelector('img');
    expect(activeFeedIcon?.getAttribute('src')).toContain('cruush-colored');
    expect(activeFeedIcon).toHaveClass('h-[4.25rem]', 'w-[4.25rem]', 'max-w-none', 'object-contain');
    expect(screen.getByRole('button', { name: /feed/i })).toHaveClass('h-[3.75rem]', 'w-[3.75rem]');
  });

  it('uses the notch-free cruush logo in white when inactive and its gradient with white text when active', () => {
    const inactiveRender = render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const inactiveLogo = screen.getByRole('button', { name: /^cruush$/i }).querySelector('img');

    expect(inactiveLogo?.getAttribute('src')).toContain('cruush-logo.svg');
    expect(inactiveLogo).toHaveAttribute('data-tone', 'white');
    expect(inactiveLogo).toHaveClass('h-12', 'w-12', 'object-contain', 'brightness-0', 'invert');

    inactiveRender.unmount();

    render(
      <MemoryRouter initialEntries={['/cruush']}>
        <BottomNav />
      </MemoryRouter>
    );

    const activeButton = screen.getByRole('button', { name: /^cruush$/i });
    const activeLogo = activeButton.querySelector('img');

    expect(activeButton).toHaveAttribute('aria-current', 'page');
    expect(activeLogo?.getAttribute('src')).toContain('cruush-logo.svg');
    expect(activeLogo).toHaveAttribute('data-tone', 'gradient-white-wordmark');
    expect(activeLogo).toHaveClass('h-12', 'w-12', 'object-contain');
    expect(activeLogo).not.toHaveClass('brightness-0', 'invert');
  });

  it('uses the selected V2 humanity profile mark in white while inactive', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const profileIcon = screen.getByTestId('bottom-nav-profile-icon');

    expect(profileIcon.tagName).toBe('IMG');
    expect(profileIcon).toHaveAttribute('data-tone', 'white');
    expect(profileIcon).toHaveAttribute('src', expect.stringContaining('humanity-profile-selected-winged-heart'));
    expect(profileIcon).toHaveClass('h-11', 'w-11');
  });

  it('fills the selected V2 humanity profile mark with the cruush gradient', () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <BottomNav />
      </MemoryRouter>
    );

    const profileButton = screen.getByRole('button', { name: /profile/i });
    const profileIcon = screen.getByTestId('bottom-nav-profile-icon');

    expect(profileButton).toHaveAttribute('aria-current', 'page');
    expect(profileIcon.tagName).toBe('IMG');
    expect(profileIcon).toHaveAttribute('data-tone', 'gradient');
    expect(profileIcon).toHaveAttribute('src', expect.stringContaining('humanity-profile-selected-winged-heart-symmetric-gradient'));
    expect(profileIcon).toHaveClass('h-11', 'w-11');
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
    expect(screen.getByRole('button', { name: /profile/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /map/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('bottom-nav-profile-icon')).toHaveAttribute('data-tone', 'gradient');
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

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map:{"openOwnProfilePanel":true}');
  });

  it('navigates to the full profile page at constrained desktop widths', () => {
    useIsMobile.mockImplementation((breakpoint?: number) => breakpoint === 1120);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map:{"openOwnProfilePanel":true}');
  });

  it('opens desktop destinations as full pages when the user selects Full screen', () => {
    saveDesktopPageLayout('fullscreen');

    render(
      <MemoryRouter initialEntries={['/map']}>
        <BottomNav />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /messages/i }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/messages:null');

    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile:null');
  });
});
