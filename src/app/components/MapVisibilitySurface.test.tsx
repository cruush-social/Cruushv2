import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';

function VisibilityHarness({ hasCruushPlus = false, onUpgrade = vi.fn(), showOutsideServiceAreaControl, initialValue = DEFAULT_VISIBILITY_STATE }: { hasCruushPlus?: boolean; onUpgrade?: () => void; showOutsideServiceAreaControl?: boolean; initialValue?: VisibilityControlState }) {
  const [value, setValue] = useState<VisibilityControlState>(initialValue);
  const [applied, setApplied] = useState<VisibilityControlState | null>(null);

  return (
    <>
      <MapVisibilitySurface
        open
        onOpenChange={() => {}}
        value={value}
        hasCruushPlus={hasCruushPlus}
        showOutsideServiceAreaControl={showOutsideServiceAreaControl}
        onUpgrade={onUpgrade}
        onChange={setValue}
        onClear={() => setValue(DEFAULT_VISIBILITY_STATE)}
        onApply={() => setApplied(value)}
      />
      <output data-testid="selected-tags">{value.tags.join(',')}</output>
      <output data-testid="applied-tags">{applied?.tags.join(',') ?? ''}</output>
      <output data-testid="hidden-body-types">{value.bodyTypes.join(',')}</output>
      <output data-testid="applied-identities">{applied?.identities.join(',') ?? ''}</output>
      <output data-testid="applied-mile-high-club">{String(applied?.mileHighClub ?? false)}</output>
      <output data-testid="applied-out-of-sight">{String(applied?.outsideServiceAreaMembers ?? false)}</output>
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
  it('omits the member-only Purgatory row when reused for Club visibility', () => {
    render(<VisibilityHarness showOutsideServiceAreaControl={false} />);
    expect(screen.queryByRole('switch', { name: 'Hide me from Purgatory members' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Hide me from people with no profile picture' })).toBeInTheDocument();
  });
  it('counts Purgatory members within the three Basic hidden filters', () => {
    render(<VisibilityHarness initialValue={{ ...DEFAULT_VISIBILITY_STATE, identities: ['man'], presentations: ['masc'], crowds: ['Gay'] }} />);
    const control = screen.getByRole('switch', { name: 'Hide me from Purgatory members' });
    expect(control).not.toBeChecked();
    expect(control.closest('.rounded-2xl')).toHaveClass('border-white/10', 'bg-white/[0.035]', 'p-4');
    fireEvent.click(control);
    expect(control).not.toBeChecked();
    expect(screen.getByText('You can use up to 3 hidden filters. Remove one before adding another.')).toBeInTheDocument();
  });
  it('lets Basic members choose Purgatory as one of three hidden filters', () => {
    render(<VisibilityHarness initialValue={{ ...DEFAULT_VISIBILITY_STATE, identities: ['man'], presentations: ['masc'] }} />);
    const control = screen.getByRole('switch', { name: 'Hide me from Purgatory members' });
    fireEvent.click(control);
    expect(control).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('applied-out-of-sight')).toHaveTextContent('true');
  });
  it('always allows turning the Purgatory restriction off, even for a legacy over-limit Basic state', () => {
    render(<VisibilityHarness initialValue={{ ...DEFAULT_VISIBILITY_STATE, outsideServiceAreaMembers: true, identities: ['man'], presentations: ['masc'], crowds: ['Gay'] }} />);
    const control = screen.getByRole('switch', { name: 'Hide me from Purgatory members' });
    expect(control).toBeChecked();
    fireEvent.click(control);
    expect(control).not.toBeChecked();
  });
  it('allows cruush+ to add Purgatory after three other hidden filters', () => {
    render(<VisibilityHarness hasCruushPlus initialValue={{ ...DEFAULT_VISIBILITY_STATE, identities: ['man'], presentations: ['masc'], crowds: ['Gay'] }} />);
    const control = screen.getByRole('switch', { name: 'Hide me from Purgatory members' });
    fireEvent.click(control);
    expect(control).toBeChecked();
    expect(screen.queryByText('You can use up to 3 hidden filters. Remove one before adding another.')).not.toBeInTheDocument();
  });
  it('keeps Visibility Controls flush with the desktop viewport and leaves the map unmasked', () => {
    render(<VisibilityHarness />);

    expect(screen.getByRole('dialog', { name: 'Visibility Controls' })).toHaveClass('z-[1100]');
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toHaveClass('sm:bg-transparent');
    expect(screen.getByRole('tablist')).not.toHaveClass('sticky', 'top-0', 'z-20');
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
    // 4c86ba7 replaced the in-body "Pick who should not see you." paragraph
    // with the approved one-line tagline under the sheet header, matching the
    // Seeking header treatment.
    const header = screen
      .getByRole('dialog', { name: 'Visibility Controls' })
      .querySelector('[data-slot="sheet-header"]') as HTMLElement;
    expect(within(header).getByText('Choose who sees you.')).toBeInTheDocument();
    expect(screen.queryByText('Pick who should not see you.')).not.toBeInTheDocument();
    expect(screen.getByTestId('crowd-mode-tutorial-target')).toHaveAttribute('data-tutorial-target', 'crowds');

    selectVisibilityOption('Gender Identity', 'man');
    selectVisibilityOption('Presentation', 'masc');
    selectVisibilityOption('Crowds', 'Gay');

    expect(screen.queryByText('3 of 3 hidden filters used')).not.toBeInTheDocument();

    selectVisibilityOption('Body Type', 'athletic');

    expect(screen.getByText('You can use up to 3 hidden filters. Remove one before adding another.')).toBeInTheDocument();
    expect(screen.getByTestId('hidden-body-types')).toHaveTextContent('');
  });

  it('lets cruush+ users use more than three hidden audiences', () => {
    render(<VisibilityHarness hasCruushPlus />);

    selectVisibilityOption('Gender Identity', 'man');
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

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));

    const option = screen.getByRole('option', { name: 'man', exact: true });
    const menu = option.parentElement?.parentElement;

    expect(option.closest('[data-slot="sheet-content"]')).toBe(screen.getByRole('dialog', { name: 'Visibility Controls' }));
    expect(menu).toHaveStyle({ pointerEvents: 'auto' });

    fireEvent.pointerDown(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerUp(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.click(option);

    expect(screen.getByRole('button', { name: 'Gender Identity' })).toHaveTextContent('1 selected');
    expect(screen.getByRole('dialog', { name: 'Visibility Controls' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('applied-identities')).toHaveTextContent('man');
  });
});


it('adds and removes independent Tags with the existing Basic category cap', () => {
  render(<VisibilityHarness initialValue={{ ...DEFAULT_VISIBILITY_STATE, identities: ['man'], presentations: ['masc'] }} />);
  const input = screen.getByRole('textbox', { name: 'Tags', exact: true });
  fireEvent.change(input, { target: { value: '#ROPE' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByTestId('selected-tags')).toHaveTextContent('rope');
  fireEvent.click(screen.getByRole('switch', { name: 'Hide me from Purgatory members' }));
  expect(screen.getByRole('switch', { name: 'Hide me from Purgatory members' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByTestId('applied-tags')).toHaveTextContent('rope');
  fireEvent.click(screen.getByRole('button', { name: 'Remove #rope' }));
  expect(screen.getByTestId('selected-tags')).toBeEmptyDOMElement();
});
