import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AccessibilityQuickAccess from './AccessibilityQuickAccess';
import {
  ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
  saveAccessibilityPreferences,
} from '../lib/accessibilityPreferences';

describe('AccessibilityQuickAccess', () => {
  beforeEach(() => {
    window.localStorage.removeItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
    document.documentElement.removeAttribute('data-cruush-high-contrast');
    document.documentElement.removeAttribute('data-cruush-larger-text');
    document.documentElement.removeAttribute('data-cruush-reduce-motion');
  });

  afterEach(() => {
    window.localStorage.removeItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
    document.documentElement.removeAttribute('data-cruush-high-contrast');
    document.documentElement.removeAttribute('data-cruush-larger-text');
    document.documentElement.removeAttribute('data-cruush-reduce-motion');
  });

  it('changes the same global preferences before sign-in', () => {
    render(<AccessibilityQuickAccess />);

    fireEvent.click(screen.getByRole('button', { name: 'Accessibility options' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Larger text' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Increase contrast' }));

    expect(document.documentElement).toHaveAttribute('data-cruush-reduce-motion');
    expect(document.documentElement).toHaveAttribute('data-cruush-larger-text');
    expect(document.documentElement).toHaveAttribute('data-cruush-high-contrast');
    expect(JSON.parse(window.localStorage.getItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY) ?? '{}')).toEqual({
      highContrast: true,
      largerText: true,
      reduceMotion: true,
    });
  });

  it('keeps its controls synchronized with changes from another accessibility surface', () => {
    render(<AccessibilityQuickAccess />);

    fireEvent.click(screen.getByRole('button', { name: 'Accessibility options' }));
    act(() => {
      saveAccessibilityPreferences({
        highContrast: true,
        largerText: true,
        reduceMotion: true,
      });
    });

    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Larger text' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Increase contrast' })).toBeChecked();
  });

  it('moves out of the interactive area while the signed-out auth shell is scrolled', () => {
    render(<AccessibilityQuickAccess authShellScrolled />);

    const trigger = screen.getByTestId('accessibility-quick-access');
    expect(trigger).toHaveClass('pointer-events-none', '-translate-y-24', 'opacity-0');
    expect(trigger).toHaveAttribute('tabindex', '-1');
  });
});
