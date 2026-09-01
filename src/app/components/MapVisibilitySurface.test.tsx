import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';

function VisibilityHarness({ hasCruushPlus = false, onUpgrade = vi.fn() }: { hasCruushPlus?: boolean; onUpgrade?: () => void }) {
  const [value, setValue] = useState<VisibilityControlState>(DEFAULT_VISIBILITY_STATE);
  const [applied, setApplied] = useState<VisibilityControlState | null>(null);

  return (
    <>
      <MapVisibilitySurface
        open
        onOpenChange={() => {}}
        value={value}
        hasCruushPlus={hasCruushPlus}
        onUpgrade={onUpgrade}
        onChange={setValue}
        onClear={() => setValue(DEFAULT_VISIBILITY_STATE)}
        onApply={() => setApplied(value)}
      />
      <output data-testid="hidden-body-types">{value.bodyTypes.join(',')}</output>
      <output data-testid="applied-identities">{applied?.identities.join(',') ?? ''}</output>
      <output data-testid="applied-mile-high-club">{String(applied?.mileHighClub ?? false)}</output>
    </>
  );
}

function selectVisibilityOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  const optionButton = screen.getByRole('option', { name: option, exact: true });
  fireEvent.pointerDown(optionButton, { isPrimary: true, pointerType: 'touch' });
  fireEvent.pointerUp(optionButton, { isPrimary: true, pointerType: 'touch' });
  fireEvent.click(optionButton);
}

describe('MapVisibilitySurface', () => {
  it('keeps Visibility Controls above the fixed bottom navigation', () => {
    render(<VisibilityHarness />);

    expect(screen.getByRole('dialog', { name: 'Visibility Controls' })).toHaveClass('z-[1100]');
  });

  it('keeps the close control on the left away from the fixed bug button', () => {
    render(<VisibilityHarness />);

    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('left-4');
    expect(screen.getByRole('dialog', { name: 'Visibility Controls' }).querySelector('[data-slot="sheet-header"]')).toHaveClass('pl-14');
  });

  it('limits non-cruush+ users to three hidden audiences and links to cruush+', () => {
    const onUpgrade = vi.fn();
    render(<VisibilityHarness onUpgrade={onUpgrade} />);

    expect(screen.getByText('Basic includes up to 3 hidden filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get cruush+' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Pick who should not see you.')).toBeInTheDocument();
    expect(screen.getByTestId('crowd-mode-tutorial-target')).toHaveAttribute('data-tutorial-target', 'crowds');

    selectVisibilityOption('Gender Identities', 'man');
    selectVisibilityOption('Presentation', 'masc');
    selectVisibilityOption('Crowds', 'Gay');

    expect(screen.queryByText('3 of 3 hidden filters used')).not.toBeInTheDocument();

    selectVisibilityOption('Body Type', 'athletic');

    expect(screen.getByText('You can use up to 3 hidden filters. Remove one before adding another.')).toBeInTheDocument();
    expect(screen.getByTestId('hidden-body-types')).toHaveTextContent('');
  });

  it('lets cruush+ users use more than three hidden audiences', () => {
    render(<VisibilityHarness hasCruushPlus />);

    selectVisibilityOption('Gender Identities', 'man');
    selectVisibilityOption('Presentation', 'masc');
    selectVisibilityOption('Crowds', 'Gay');
    selectVisibilityOption('Body Type', 'athletic');

    expect(screen.getByTestId('hidden-body-types')).toHaveTextContent('athletic');
    expect(screen.queryByText('You can use up to 3 hidden filters. Remove one before adding another.')).not.toBeInTheDocument();
    expect(screen.queryByText('Basic includes up to 3 hidden filters.')).not.toBeInTheDocument();
  });

  it('hides from active Mile High Club members from Intimacy without a duplicate distance-label control', () => {
    render(<VisibilityHarness />);

    expect(screen.queryByText('Approximate distance labels')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hide yourself/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Intimacy' }));
    const control = screen.getByRole('switch', { name: 'Hide me from Mile High Club members' });
    expect(control).not.toBeChecked();

    fireEvent.click(control);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.getByTestId('applied-mile-high-club')).toHaveTextContent('true');
  });

  it('keeps a portalled Visibility option inside the modal touch boundary', () => {
    render(<VisibilityHarness hasCruushPlus />);

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identities' }));

    const option = screen.getByRole('option', { name: 'man', exact: true });
    const menu = option.parentElement?.parentElement;

    expect(option.closest('[data-slot="sheet-content"]')).toBe(screen.getByRole('dialog', { name: 'Visibility Controls' }));
    expect(menu).toHaveStyle({ pointerEvents: 'auto' });

    fireEvent.pointerDown(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerUp(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.click(option);

    expect(screen.getByRole('button', { name: 'Gender Identities' })).toHaveTextContent('1 selected');
    expect(screen.getByRole('dialog', { name: 'Visibility Controls' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('applied-identities')).toHaveTextContent('man');
  });
});
