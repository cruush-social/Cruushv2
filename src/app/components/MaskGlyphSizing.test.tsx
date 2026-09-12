import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PillowPrincessGlyph, ServiceGlyph, StoneTopGlyph } from './PositionRoleGlyphs';
import { ZodiacGlyph } from './ZodiacGlyphs';

/**
 * These glyphs are a span filled with currentColor through a mask. A span is
 * inline by default and an inline box ignores width and height, so a caller
 * passing only sizing classes rendered nothing at all: the badge was there in
 * the DOM, occupying no space, showing no mark.
 */
describe('mask glyphs take the size their caller asks for', () => {
  const cases: Array<[string, (props: { className?: string }) => JSX.Element]> = [
    ['ServiceGlyph', ServiceGlyph],
    ['StoneTopGlyph', StoneTopGlyph],
    ['PillowPrincessGlyph', PillowPrincessGlyph],
    ['ZodiacGlyph', (props) => <ZodiacGlyph {...props} sign="aries" />],
  ];

  it.each(cases)('%s is not laid out inline', (_name, Glyph) => {
    const { container } = render(<Glyph className="h-11 w-11" />);
    const glyph = container.querySelector('span');

    expect(glyph).not.toBeNull();
    expect(glyph?.style.display).toBe('inline-block');
  });
});
