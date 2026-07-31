import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import ResetPassword from './ResetPassword';
import { resetPassword } from '../lib/authApi';

vi.mock('../lib/authApi', () => ({
  resetPassword: vi.fn(),
}));

describe('ResetPassword', () => {
  it('uses the current launch auth theme and real logo', () => {
    window.history.replaceState({}, '', '/reset-password?token=reset-token');

    const { container } = render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>,
    );

    expect(container.querySelector('.launch-login-auth-shell')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-map-teaser')).toBeInTheDocument();
    expect(screen.getByTestId('reset-password-panel')).toHaveClass('launch-login-auth-card');
    expect(screen.getByRole('heading', { name: 'cruush' })).toHaveClass('sr-only');
    expect(screen.getByTestId('reset-password-logo')).toHaveClass('launch-login-auth-logo-image');
    expect(screen.queryByText('cruush', { selector: '.cruush-logo-text' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveClass('launch-login-auth-input');
    expect(screen.getByRole('button', { name: 'Reset password' })).toHaveClass('launch-login-auth-submit');
  });

  it('submits the reset token and password', async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/reset-password?token=reset-token');

    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({
      token: 'reset-token',
      password: 'password-123',
    }));
    expect(await screen.findByText('Your password has been reset. You can sign in now.')).toBeInTheDocument();
  });
});
