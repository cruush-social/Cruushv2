import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapControlsTutorial from './MapControlsTutorial';
import MultiSelect from './MultiSelect';
import { KINK_GROUPS } from '../lib/profileOptions';

describe('Visual & Layout Invariant Validation', () => {
  it('validates Skip tutorial button touch targets and dismissal behavior', () => {
    const onComplete = vi.fn();
    const onActivateStep = vi.fn().mockResolvedValue(undefined);

    render(
      <MapControlsTutorial
        open={true}
        onActivateStep={onActivateStep}
        onComplete={onComplete}
      />
    );

    const skipButton = screen.getByTestId('skip-map-controls-tutorial');
    expect(skipButton).toBeInTheDocument();
    expect(skipButton).toHaveClass('px-2.5', 'py-1', 'rounded-full', 'border', 'text-xs');

    // Test touchEnd event on mobile
    fireEvent.touchEnd(skipButton);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('cruush:tutorial-v5-seen')).toBe('true');
  });

  it('validates horizontal scrollable category tabbar layout and checkmark indicators in MultiSelect', () => {
    const onChange = vi.fn();

    render(
      <MultiSelect
        ariaLabel="Kinks & Fetishes"
        optionGroups={KINK_GROUPS}
        value={['biting', 'chastity']}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kinks & Fetishes' }));

    // Check tablist container styling and touchAction
    const tablist = screen.getByRole('tablist', { name: 'Kinks & Fetishes categories' });
    expect(tablist).toHaveClass('overflow-x-auto', 'scrollbar-subtle', 'gap-1');
    expect(tablist.style.touchAction).toBe('pan-x pan-y');

    // Verify all 10 Kink categories are present as scrollable tabs
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(8);
    expect(tabs[0]).toHaveTextContent('Body & Touch');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    // Verify active option list has Check icon indicator for the selected item.
    const listbox = screen.getByRole('listbox', { name: 'Kinks & Fetishes' });
    expect(listbox).toHaveClass('flex-1', 'overflow-y-auto');

    const bitingOption = within(listbox).getByRole('option', { name: 'biting' });
    expect(bitingOption).toHaveAttribute('aria-selected', 'true');
    expect(bitingOption).toHaveClass('bg-accent/80', 'font-medium');

    // Switch to 'Power' category tab
    const powerTab = screen.getByRole('tab', { name: 'Power' });
    fireEvent.click(powerTab);

    expect(powerTab).toHaveAttribute('aria-selected', 'true');
    const chastityOption = within(listbox).getByRole('option', { name: 'chastity' });
    expect(chastityOption).toHaveAttribute('aria-selected', 'true');
  });
});
