import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';

function VisibilityHarness({ hasCruushPlus = false }: { hasCruushPlus?: boolean }) {
  const [value, setValue] = useState<VisibilityControlState>(DEFAULT_VISIBILITY_STATE);

  return (
    <>
      <MapVisibilitySurface
        open
        onOpenChange={() => {}}
        value={value}
        hasCruushPlus={hasCruushPlus}
        onChange={setValue}
        onClear={() => setValue(DEFAULT_VISIBILITY_STATE)}
        onApply={() => {}}
      />
      <output data-testid="hidden-body-types">{value.bodyTypes.join(',')}</output>
    </>
  );
}

function selectVisibilityOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('MapVisibilitySurface', () => {
  it('limits non-cruush+ users to three hidden audiences without account-plan copy', () => {
    render(<VisibilityHarness />);

    expect(screen.queryByText('Free accounts can hide from up to 3 audiences.')).not.toBeInTheDocument();
    expect(screen.getByText('Pick who should not see you. Crowd Mode is different: it makes you visible only to the active crowds you choose.')).toBeInTheDocument();

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
  });
});
