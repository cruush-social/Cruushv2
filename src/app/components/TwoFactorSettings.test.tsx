import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TwoFactorSettings from './TwoFactorSettings';

const api = vi.hoisted(() => ({
  completeTwoFactorSetup: vi.fn(),
  disableTwoFactor: vi.fn(),
  getTwoFactorStatus: vi.fn(),
  regenerateTwoFactorRecoveryCodes: vi.fn(),
  startTwoFactorSetup: vi.fn(),
}));

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('../lib/rewardsApi', () => api);
vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
  },
}));

function renderTwoFactorSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings/2fa']}>
      <TwoFactorSettings />
    </MemoryRouter>,
  );
}

describe('TwoFactorSettings', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    toastSuccess.mockReset();
    api.getTwoFactorStatus.mockResolvedValue({
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('supports setup confirmation and one-time recovery-code display from settings', async () => {
    api.startTwoFactorSetup.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/cruush:test',
      qrCodeDataUrl: 'data:image/png;base64,AAAA',
    });
    api.completeTwoFactorSetup.mockResolvedValue({
      enabled: true,
      recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'],
    });
    api.getTwoFactorStatus
      .mockResolvedValueOnce({ enabled: false, enabledAt: null, recoveryCodesRemaining: 0 })
      .mockResolvedValueOnce({ enabled: true, enabledAt: '2026-07-27T12:00:00.000Z', recoveryCodesRemaining: 10 });
    renderTwoFactorSettings();

    expect(await screen.findByRole('heading', { name: 'Two-factor authentication' })).toBeInTheDocument();
    expect(screen.getByText('Use the same password you use to sign in. This is not a separate 2FA password.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('cruush login password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator app' }));
    expect(await screen.findByAltText('cruush authenticator setup QR code')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('6-digit authenticator code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and enable 2FA' }));
    expect(await screen.findByText('Save these one-use recovery codes now.')).toBeInTheDocument();
    expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument();
  });

  it('renders enabled state controls', async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      enabled: true,
      enabledAt: '2026-07-27T12:00:00.000Z',
      recoveryCodesRemaining: 8,
    });

    renderTwoFactorSettings();

    expect(await screen.findByText('Enabled - 8 recovery codes remaining')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable 2FA' })).toBeInTheDocument();
  });
});
