import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import ProfileView from './ProfileView';

describe('ProfileView', () => {
  it('uses a 4:5 hero and exposes Basics, Intimacy, and Health tabs', () => {
    render(
      <MemoryRouter initialEntries={['/profile/user-1']}>
        <Routes>
          <Route path="/profile/:userId" element={<ProfileView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('profile-hero-media')).toHaveStyle({ aspectRatio: '4 / 5' });
    expect(screen.getByRole('tab', { name: 'Basics' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Intimacy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });
});
