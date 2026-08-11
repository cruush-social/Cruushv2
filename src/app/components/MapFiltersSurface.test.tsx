import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';

function SeekingHarness({ hasCruushPlus = false, onUpgrade = vi.fn() }: { hasCruushPlus?: boolean; onUpgrade?: () => void }) {
  const [value, setValue] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [applied, setApplied] = useState<FilterState | null>(null);

  return (
    <>
      <MapFiltersSurface
        open
        onOpenChange={() => {}}
        value={value}
        hasCruushPlus={hasCruushPlus}
        onUpgrade={onUpgrade}
        onChange={setValue}
        onClear={() => setValue(DEFAULT_FILTER_STATE)}
        onApply={() => setApplied(value)}
      />
      <output data-testid="applied-identities">{applied?.identities.join(',') ?? ''}</output>
    </>
  );
}

describe('MapFiltersSurface', () => {
  it('links basic members to cruush+ for more than three seeking filter categories', () => {
    const onUpgrade = vi.fn();
    render(<SeekingHarness onUpgrade={onUpgrade} />);

    expect(screen.getByText('Basic includes up to 3 seeking filter categories.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get cruush+' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('does not show a seeking upgrade notice to cruush+ members', () => {
    render(<SeekingHarness hasCruushPlus />);
    expect(screen.queryByText('Basic includes up to 3 seeking filter categories.')).not.toBeInTheDocument();
  });

  it('keeps a portalled Seeking option pointer-enabled and applies the selected gender', () => {
    render(<SeekingHarness />);

    const trigger = screen.getByRole('button', { name: 'Gender Identities' });
    fireEvent.click(trigger);

    const option = screen.getByRole('option', { name: 'man', exact: true });
    const menu = option.parentElement?.parentElement;
    expect(option.closest('[data-slot="sheet-content"]')).toBeNull();
    expect(menu).toHaveStyle({ pointerEvents: 'auto' });

    fireEvent.pointerDown(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerUp(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.click(option);

    expect(trigger).toHaveTextContent('1 selected');
    expect(screen.getByRole('dialog', { name: 'Seeking' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('applied-identities')).toHaveTextContent('man');
  });
});
