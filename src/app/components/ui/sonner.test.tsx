import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from './sonner';

vi.mock('sonner', () => ({
  Toaster: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <div className={className} data-testid="sonner-toaster" style={style} />
  ),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

describe('Toaster', () => {
  it('uses the shared chartreuse accent for every popup notification type', () => {
    render(<Toaster richColors />);

    const toaster = screen.getByTestId('sonner-toaster');

    expect(toaster).not.toHaveClass('[&_[data-icon]]:text-[#C8FF31]');
    expect(toaster.style.getPropertyValue('--normal-border')).toBe('#C8FF31');

    for (const type of ['success', 'info', 'warning', 'error']) {
      expect(toaster.style.getPropertyValue(`--${type}-bg`)).toBe('var(--popover)');
      expect(toaster.style.getPropertyValue(`--${type}-text`)).toBe('var(--popover-foreground)');
      expect(toaster.style.getPropertyValue(`--${type}-border`)).toBe('#C8FF31');
    }
  });
});
