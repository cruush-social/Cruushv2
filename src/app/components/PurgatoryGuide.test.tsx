import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import PurgatoryGuide from './PurgatoryGuide';
import PurgatoryMemberBadge from './PurgatoryMemberBadge';

describe('Purgatory guide navigation', () => {
  it('opens the explanation on glyph tap, navigates from its text, and returns to the profile', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/example']}>
        <Routes>
          <Route path="/profile/example" element={<PurgatoryMemberBadge />} />
          <Route path="/purgatory" element={<PurgatoryGuide />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'This is a Purgatory member.' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('currently outside cruush’s service area.');
    expect(screen.queryByRole('heading', { name: 'Sinners and Purgatory' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /This is a Purgatory member/ }));
    expect(await screen.findByRole('heading', { name: 'Sinners and Purgatory' })).toBeInTheDocument();
    expect(screen.getByText(/Without an active Mile High Club location/)).toBeInTheDocument();
    expect(screen.getByText(/does not override another member’s privacy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'This is a Purgatory member.' })).toBeInTheDocument();
  });
});
