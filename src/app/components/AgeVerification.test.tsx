import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgeVerification from './AgeVerification';

const { useIsMobile, verifyAge } = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
  verifyAge: vi.fn(),
}));

vi.mock('./ui/use-mobile', () => ({
  useIsMobile,
}));

vi.mock('../lib/authApi', () => ({
  verifyAge,
}));

describe('AgeVerification', () => {
  beforeEach(() => {
    useIsMobile.mockReset();
    verifyAge.mockReset();
    useIsMobile.mockReturnValue(false);
  });

  it('opens the numeric keyboard on mobile and submits the ISO birthdate', async () => {
    useIsMobile.mockReturnValue(true);
    const session = { needsAgeVerification: false };
    verifyAge.mockResolvedValue(session);
    const onVerified = vi.fn();

    render(<AgeVerification onVerified={onVerified} />);

    const birthdate = screen.getByLabelText('Date of birth');
    expect(birthdate).toHaveAttribute('type', 'text');
    expect(birthdate).toHaveAttribute('inputmode', 'numeric');
    expect(birthdate).toHaveAttribute('placeholder', 'MM/DD/YYYY');

    fireEvent.change(birthdate, { target: { value: '01021994' } });
    expect(birthdate).toHaveValue('01/02/1994');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(verifyAge).toHaveBeenCalledWith({ dateOfBirth: '1994-01-02' }));
    expect(onVerified).toHaveBeenCalledWith(session);
  });

  it('keeps the native date input on desktop', () => {
    render(<AgeVerification onVerified={vi.fn()} />);

    const birthdate = screen.getByLabelText('Date of birth');
    expect(birthdate).toHaveAttribute('type', 'date');
    expect(birthdate).not.toHaveAttribute('inputmode');
  });
});
