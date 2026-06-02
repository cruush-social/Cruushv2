import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import BottomNav from './BottomNav';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('BottomNav', () => {
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

  it('renders a contained pill surface without a progressive fade overlay', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation');

    expect(nav.className).not.toContain('bg-background');
    expect(nav.className).not.toContain('border-t');
    expect(nav.className).not.toContain('bg-background/');
    expect(nav.className).not.toContain('backdrop-blur');
    expect(nav.querySelector('.bg-gradient-to-t')).toBeNull();
    expect(nav.className).toContain('pb-[calc(1.25rem+env(safe-area-inset-bottom))]');

    const pill = nav.querySelector('[data-testid="bottom-nav-pill"]');

    expect(pill).toHaveClass('rounded-full', 'border', 'bg-background/68', 'backdrop-blur-md');
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
    expect(activeIcon).toHaveClass('h-12', 'w-12', 'object-contain');
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
});
