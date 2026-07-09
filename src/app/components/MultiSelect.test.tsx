import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MultiSelect from './MultiSelect';

describe('MultiSelect', () => {
  it('caps multi-select choices when a max selection count is set', () => {
    const onChange = vi.fn();

    render(
      <MultiSelect
        ariaLabel="Gender Identity"
        maxSelections={3}
        onChange={onChange}
        options={['nonbinary', 'trans man', 'trans woman', 'woman']}
        value={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    fireEvent.click(screen.getByRole('option', { name: 'nonbinary' }));
    fireEvent.click(screen.getByRole('option', { name: 'trans man' }));
    fireEvent.click(screen.getByRole('option', { name: 'trans woman' }));
    fireEvent.click(screen.getByRole('option', { name: 'woman' }));

    expect(onChange).toHaveBeenLastCalledWith(['nonbinary', 'trans man', 'trans woman']);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('lets grouped menus switch categories before choosing options', () => {
    const onChange = vi.fn();

    render(
      <MultiSelect
        ariaLabel="Vibes"
        optionGroups={[
          { label: 'Style & Energy', options: ['Chill', 'Goth'] },
          { label: 'Scenes', options: ['Bear', 'Drag'] },
        ]}
        value={[]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));

    expect(screen.getByRole('tablist', { name: 'Vibes categories' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Style & Energy' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Chill' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bear' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Scenes' }));

    expect(screen.getByRole('tab', { name: 'Scenes' })).toHaveAttribute('aria-selected', 'true');
    const scenesGroup = screen.getByRole('group', { name: 'Scenes' });
    expect(within(scenesGroup).getByRole('option', { name: 'Bear' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Chill' })).not.toBeInTheDocument();

    fireEvent.click(within(scenesGroup).getByRole('option', { name: 'Drag' }));

    expect(onChange).toHaveBeenCalledWith(['Drag']);
  });
});
