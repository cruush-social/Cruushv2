import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import PublicInfoPage from './PublicInfoPage';

describe('PublicInfoPage', () => {
  it('renders the corrected simple about page', () => {
    render(
      <MemoryRouter>
        <PublicInfoPage page="about" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'about' })).toBeInTheDocument();
    expect(screen.getByText('cruush is developed by three queers in a trenchcoat.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'hello@cruush.app' })).toHaveAttribute('href', 'mailto:hello@cruush.app');
    expect(screen.getByRole('link', { name: 'hazel@cruush.app' })).toHaveAttribute('href', 'mailto:hazel@cruush.app');
    expect(screen.getByRole('link', { name: 'cyberomancer@cruush.app' })).toHaveAttribute(
      'href',
      'mailto:cyberomancer@cruush.app',
    );
  });

  it('renders copied legal content from the waitlist pages', () => {
    render(
      <MemoryRouter>
        <PublicInfoPage page="privacy" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'privacy policy' })).toBeInTheDocument();
    expect(screen.getByText('Last updated: July 21, 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sensitive information' })).toBeInTheDocument();
  });
});
