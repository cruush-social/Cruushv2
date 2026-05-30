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

  it('uses a solid bottom surface without a progressive fade overlay', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <BottomNav />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation');

    expect(nav).toHaveClass('bg-background');
    expect(nav.className).not.toContain('bg-background/');
    expect(nav.className).not.toContain('backdrop-blur');
    expect(nav.querySelector('.bg-gradient-to-t')).toBeNull();
  });
});
