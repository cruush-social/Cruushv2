import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import SupportPage from './SupportPage';

describe('SupportPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: 'support-2',
        status: 'open',
        aiTriageStatus: 'pending',
        createdAt: '2026-07-07T12:00:00.000Z',
      },
    }), { status: 201 })));
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it('submits signed-in support requests from the dedicated support page', async () => {
    window.history.pushState({}, '', '/support');

    render(
      <MemoryRouter initialEntries={['/support']}>
        <SupportPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Human trafficking policy' })).toHaveAttribute(
      'href',
      '/human-trafficking-policy',
    );

    fireEvent.change(screen.getByLabelText('Support subject'), {
      target: { value: 'Settings bug' },
    });
    fireEvent.change(screen.getByLabelText('Support message'), {
      target: { value: 'The settings screen got stuck after opening support.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/support-requests', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        category: 'question',
        subject: 'Settings bug',
        message: 'The settings screen got stuck after opening support.',
        source: 'settings',
        pageUrl: '/support',
      }),
    })));
    expect(await screen.findByText('Support request sent')).toBeInTheDocument();
  });

  it('shows the private age suspension evidence workflow without authentication', async () => {
    window.history.pushState({}, '', '/support?appeal=1');

    render(
      <MemoryRouter initialEntries={['/support?appeal=1']}>
        <SupportPage appealOnly />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('form', { name: 'Suspension appeal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reply email')).toBeRequired();
    expect(screen.getByLabelText('ID photo')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(screen.getByLabelText('ID photo')).not.toHaveAttribute('capture');
    expect(screen.getByLabelText('Selfie with handwritten card')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(screen.getByLabelText('Selfie with handwritten card')).not.toHaveAttribute('capture');
    expect(screen.getByText(/Leave only the date of birth and photo visible\./)).toBeInTheDocument();
    expect(screen.getByText(/Hold a card showing your account email and today.s date\./)).toBeInTheDocument();
  });

  it('switches the in-app support route into suspension appeal mode from the router query', async () => {
    window.history.pushState({}, '', '/support');

    render(
      <MemoryRouter initialEntries={['/support?appeal=1']}>
        <SupportPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('form', { name: 'Suspension appeal' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Contact support' })).not.toBeInTheDocument();
  });

  it('opens the appeal form when Submit an appeal is pressed', async () => {
    render(
      <MemoryRouter initialEntries={['/support']}>
        <Routes>
          <Route path="/support" element={<SupportPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Submit an appeal' }));

    expect(await screen.findByRole('form', { name: 'Suspension appeal' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Contact support' })).not.toBeInTheDocument();
  });

  it('submits general support before authentication with a reply email', async () => {
    window.history.pushState({}, '', '/support');

    render(
      <MemoryRouter initialEntries={['/support']}>
        <SupportPage publicAccess />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('form', { name: 'Contact support' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reply email')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Reply email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Support subject'), {
      target: { value: 'Sign-in question' },
    });
    fireEvent.change(screen.getByLabelText('Support message'), {
      target: { value: 'I need help before I can sign in.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/support-requests', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        category: 'question',
        subject: 'Sign-in question',
        message: 'I need help before I can sign in.',
        contactEmail: 'person@example.com',
        source: 'auth',
        pageUrl: '/support',
      }),
    })));
  });

  it('opens a legally required refund review with the subject prefilled', async () => {
    window.history.pushState({}, '', '/support?refund=1');

    const { container } = render(
      <MemoryRouter initialEntries={['/support?refund=1']}>
        <SupportPage publicAccess />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('form', { name: 'Refund request' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Request a refund review' })).toBeInTheDocument();
    expect(screen.getByLabelText('Support subject')).toHaveValue('Refund request');
    expect(screen.getByText(/does not guarantee a refund/i)).toBeInTheDocument();
    expect(screen.getByText(/Never include wallet recovery words/i)).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('min-h-[100dvh]', 'w-full', 'max-w-full', 'overflow-x-hidden');
    expect(screen.getByRole('main')).toHaveClass('box-border', 'w-full', 'min-w-0', 'max-w-full');
    expect(screen.getByRole('form', { name: 'Refund request' }).closest('section')).toHaveClass('max-w-full', 'overflow-hidden');
  });

  it('returns a directly opened signed-out appeal to sign in', async () => {
    render(
      <MemoryRouter initialEntries={['/support?appeal=1']}>
        <Routes>
          <Route path="/support" element={<SupportPage appealOnly />} />
          <Route path="/" element={<div>Mock sign in</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByText('Mock sign in')).toBeInTheDocument();
  });
});
