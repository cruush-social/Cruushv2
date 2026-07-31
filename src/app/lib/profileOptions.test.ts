import { describe, expect, it } from 'vitest';
import { HOBBIES, LOOKING_FOR, VIBE_GROUPS } from './profileOptions';

function optionsFor(groupLabel: string) {
  return VIBE_GROUPS.find((group) => group.label === groupLabel)?.options ?? [];
}

describe('profileOptions', () => {
  it('keeps vibe choices grouped without redundant or non-local options', () => {
    expect(optionsFor('Style & Energy')).toContain('Chill');
    expect(optionsFor('Style & Energy')).not.toContain('Raver');
    expect(optionsFor('Scenes')).toContain('Furry');
    expect(optionsFor('Archetypes')).toContain('Pony');
  });

  it('keeps looking-for choices focused on immediate local intent', () => {
    expect(LOOKING_FOR).toEqual(['chat', 'cruise', 'dating', 'friends', 'group', 'hookup', 'networking', 'right now', 'threesome']);
    expect(LOOKING_FOR).not.toContain('relationship');
  });

  it('keeps drag as a scene instead of a hobby', () => {
    expect(optionsFor('Scenes')).toContain('Drag');
    expect(HOBBIES).not.toContain('drag');
  });
});
