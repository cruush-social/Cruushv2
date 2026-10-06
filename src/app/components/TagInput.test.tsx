import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import TagInput from './TagInput';

function Harness() {
  const [tags, setTags] = useState<string[]>([]);
  return <TagInput ariaLabel="Tags" maxTags={10} onChange={setTags} tags={tags} />;
}

describe('TagInput', () => {
  it('creates and removes separate normalized tags with #tag plus Enter', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Tags');

    fireEvent.change(input, { target: { value: '#Techno' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove #techno' })).toBeInTheDocument();
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: '#Leather' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove #leather' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove #techno' }));
    expect(screen.queryByRole('button', { name: 'Remove #techno' })).not.toBeInTheDocument();
  });
});
