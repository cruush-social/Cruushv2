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
    expect(screen.getByText('Last updated: July 21, 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sensitive information' })).toBeInTheDocument();
  });

  it('renders the current one-time billing and refund policy', () => {
    render(
      <MemoryRouter>
        <PublicInfoPage page="billing" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'billing policy' })).toBeInTheDocument();
    expect(screen.getByText('Last updated: September 2, 2026')).toBeInTheDocument();
    expect(screen.getByText(/nothing renews automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/does not offer voluntary refunds/i)).toBeInTheDocument();
    expect(screen.getByText(/unique payment address, exact asset, exact network, exact amount, and expiration time/i)).toBeInTheDocument();
    expect(screen.getByText(/before sending, you may cancel an order/i)).toBeInTheDocument();
    expect(screen.getByText(/cruush\+ access or purchased Ping credits are added only after/i)).toBeInTheDocument();
    expect(screen.getByText(/does not automatically activate cruush\+ or add Ping credits/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'submit a refund request' })).toHaveAttribute(
      'href',
      '/support?refund=1',
    );
  });
});
