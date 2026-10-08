import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import DlModeSettings from './DlModeSettings';

const { requestApi } = vi.hoisted(() => ({ requestApi: vi.fn() }));
vi.mock('../lib/apiClient', () => ({ requestApi }));

describe('DlModeSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    requestApi.mockImplementation(async (_url, options) => options?.method === 'PUT'
      ? JSON.parse(options.body)
      : { audience: 'public' });
  });

  it('persists DL Mode from the dedicated settings page', async () => {
    render(
      <MemoryRouter>
        <DlModeSettings />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'DL Mode' })).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Toggle DL Mode' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem('cruush:dl-mode-enabled')).toBe('false');
  });

  it('fits the existing settings composition inside a mobile viewport', () => {
    render(
      <MemoryRouter>
        <DlModeSettings />
      </MemoryRouter>
    );

    expect(screen.getByTestId('dl-mode-mobile-body')).toHaveClass(
      'min-w-0',
      '!px-3',
      '!py-4',
      'sm:!p-6',
    );
    expect(screen.getByRole('heading', { name: 'DL Mode' }).closest('header'))
      .toHaveClass('border-white/10', 'bg-black/88', 'py-4');
    expect(screen.getByTestId('dl-mode-settings-root')).toHaveClass('h-full', 'overflow-hidden');
    expect(screen.getByTestId('dl-mode-settings-root')).not.toHaveClass('h-[100dvh]');
    expect(screen.getByTestId('dl-mode-settings-root')).not.toHaveClass('pb-20');
  });

  it('keeps outgoing explicit-image options disabled when the saved privacy policy cannot load', async () => {
    requestApi.mockRejectedValueOnce(new Error('offline'));

    render(
      <MemoryRouter>
        <DlModeSettings />
      </MemoryRouter>
    );

    const publicOption = await within(screen.getByLabelText('Share explicit images with')).findByRole('button', { name: 'Public' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(publicOption).toBeDisabled();
    fireEvent.click(within(screen.getByLabelText('Share explicit images with')).getByRole('button', { name: 'mutual Crowds only' }));
    expect(requestApi.mock.calls.every(([, options]) => options?.method !== 'PUT')).toBe(true);
  });

  it('saves the requested outgoing explicit-image audience without changing other privacy policies', async () => {
    requestApi.mockResolvedValueOnce({ audience: 'mutual_cruushes' });

    render(
      <MemoryRouter>
        <DlModeSettings />
      </MemoryRouter>
    );

    const publicOption = await within(screen.getByLabelText('Share explicit images with')).findByRole('button', { name: 'Public' });
    expect(publicOption).toHaveAttribute('aria-pressed', 'false');
    expect(publicOption).toBeEnabled();
    fireEvent.click(within(screen.getByLabelText('Share explicit images with')).getByRole('button', { name: 'mutual Crowds only' }));

    expect(requestApi).toHaveBeenCalledWith('/api/privacy/nsfw-photo-audience', {
      method: 'PUT',
      body: JSON.stringify({ audience: 'mutual_crowds' }),
    });
  });

  it('defaults to no show-only exception and persists the selected DL Mode exception locally', async () => {
    render(
      <MemoryRouter>
        <DlModeSettings />
      </MemoryRouter>
    );

    const exceptions = screen.getByLabelText('Show only exception');
    expect(within(exceptions).getByRole('button', { name: 'No show only exceptions' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(exceptions).getByRole('button', { name: 'mutual Crowds only' }));

    expect(localStorage.getItem('cruush:dl-mode-show-only-exception')).toBe('mutual_crowds');
    expect(within(exceptions).getByRole('button', { name: 'mutual Crowds only' })).toHaveAttribute('aria-pressed', 'true');
  });

});
