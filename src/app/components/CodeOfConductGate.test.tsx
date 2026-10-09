import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CodeOfConductGate from './CodeOfConductGate';

vi.mock('../lib/authApi', () => ({
  acceptCodeOfConduct: vi.fn(),
}));

describe('CodeOfConductGate', () => {
  it('starts at the top and remains vertically scrollable on a mobile viewport', () => {
    render(<CodeOfConductGate version="2026-10-08" onAccepted={vi.fn()} />);

    const heading = screen.getByRole('heading', { name: 'Before the gates open.' });
    const main = heading.closest('main');
    const section = heading.closest('section');

    expect(main).toHaveClass('min-h-[100dvh]', 'overflow-y-auto');
    expect(section).toHaveClass('sm:justify-center');
    expect(section).not.toHaveClass('justify-center');
  });
});
