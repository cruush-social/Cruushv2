import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

function SelectHarness() {
  const [value, setValue] = useState('all');

  return (
    <>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger aria-label="Seeking filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All seeking</SelectItem>
          <SelectItem value="dates">Dates</SelectItem>
        </SelectContent>
      </Select>
      <output data-testid="selected-value">{value}</output>
    </>
  );
}

describe('Select', () => {
  it('keeps a portalled menu interactive when an ancestor modal disables body pointer events', async () => {
    const previousPointerEvents = document.body.style.pointerEvents;
    document.body.style.pointerEvents = 'none';

    try {
      render(<SelectHarness />);
      fireEvent.click(screen.getByRole('combobox', { name: 'Seeking filter' }));

      const option = await screen.findByRole('option', { name: 'Dates' });
      const content = option.closest('[data-slot="select-content"]');
      expect(content).toHaveClass('pointer-events-auto');

      fireEvent.pointerDown(option, { button: 0, pointerType: 'touch' });
      fireEvent.pointerUp(option, { button: 0, pointerType: 'touch' });
      fireEvent.click(option);
      expect(screen.getByTestId('selected-value')).toHaveTextContent('dates');
    } finally {
      document.body.style.pointerEvents = previousPointerEvents;
    }
  });
});
