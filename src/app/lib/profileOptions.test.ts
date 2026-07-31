import { describe, expect, it } from 'vitest';
import { BODY_TYPES, HOBBIES, LOOKING_FOR, VIBE_GROUPS } from './profileOptions';

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

  it('keeps body descriptors in body type instead of vibes', () => {
    expect(BODY_TYPES).toEqual(expect.arrayContaining(['BBW', 'BBM', 'bear', 'otter', 'twink']));
    expect(optionsFor('Scenes')).not.toEqual(expect.arrayContaining(['Bear', 'Otter', 'Twink']));
  });
});
