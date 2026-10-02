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
    expect(screen.getByRole('link', { name: 'julien@cruush.app' })).toHaveAttribute('href', 'mailto:julien@cruush.app');
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
    expect(screen.getByText('Last updated: October 2, 2026')).toBeInTheDocument();
    expect(screen.getByText('We will never sell user data nor use it to train AI.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sensitive information' })).toBeInTheDocument();
    expect(screen.getByText(/PostHog for aggregate traffic analysis/)).toBeInTheDocument();
    expect(screen.queryByText(/Google Analytics/)).not.toBeInTheDocument();
  });

  it('states the data-use promise and update date in the Terms of Service', () => {
    render(
      <MemoryRouter>
        <PublicInfoPage page="terms" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'terms of service' })).toBeInTheDocument();
    expect(screen.getByText('Last updated: October 2, 2026')).toBeInTheDocument();
    expect(screen.getByText('We will never sell user data nor use it to train AI.')).toBeInTheDocument();
  });

  it('uses the one-line app header without a duplicate Security eyebrow', () => {
    render(
      <MemoryRouter>
        <PublicInfoPage page="security" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'security faq' })).toBeInTheDocument();
    expect(screen.queryByText('Security')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-info-page-bug-button-slot')).toBeInTheDocument();
  });
});
