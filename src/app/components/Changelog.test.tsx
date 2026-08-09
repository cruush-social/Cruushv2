import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Changelog from './Changelog';

describe('Changelog', () => {
  it('shows v1.2 before the preserved v1.1 history', () => {
    render(
      <MemoryRouter>
        <Changelog />
      </MemoryRouter>,
    );

    expect(screen.getByText('v1.2')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'cruush v1.2',
      'cruush v1.1',
    ]);
    expect(screen.getByText(/interactive map tutorial now walks through Seeking/i)).toBeInTheDocument();
    expect(screen.getByText(/Messages now default to Mutuals/i)).toBeInTheDocument();
  });
});
