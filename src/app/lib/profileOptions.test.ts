import { describe, expect, it } from 'vitest';
import { BODY_TYPES, HOBBY_GROUPS, HOBBIES, KINK_CATALOG, KINK_GROUPS, KINKS, LOOKING_FOR, ROLES, SEXUALITY, STRUCTURED_PROFILE_OPTION_FIELDS, VIBE_GROUPS } from './profileOptions';
import { profileBadgeCategory, resolveSavedProfileBadge } from '../components/ProfileBadgeGlyphs';
import { Drama } from 'lucide-react';

function optionsFor(groupLabel: string) {
  return VIBE_GROUPS.find((group) => group.label === groupLabel)?.options ?? [];
}

describe('profileOptions', () => {
  it('updates selectable kinks without losing legacy interests, badges or tag reservations', () => {
    expect(KINKS).toContain('roleplay');
    expect(KINKS).not.toContain('fantasy roleplay');
    expect(KINKS).not.toContain('fantasy scenes');
    const bodyOptions = KINK_GROUPS.find((group) => group.label === 'Body & Touch')?.options ?? [];
    for (const label of ['fisting', 'cuddling', 'making out', 'humping', 'spooning']) {
      expect(bodyOptions.filter((option) => option === label)).toHaveLength(1);
    }
    expect(KINK_GROUPS.find((group) => group.label === 'Bondage & Sensation')?.options).toEqual(expect.arrayContaining(['bondage', 'heavy bondage']));
    for (const id of ['fantasy-roleplay', 'fantasy-scenes']) {
      const legacy = KINK_CATALOG.find((kink) => kink.id === id)!;
      expect(legacy).toBeDefined();
      expect(profileBadgeCategory('Kinks', legacy.label)).toBe('Roleplay');
      expect(resolveSavedProfileBadge(`kinks-${id}`)).toEqual({ icon: Drama, label: legacy.label });
    }
    const reserved = STRUCTURED_PROFILE_OPTION_FIELDS.find((field) => field.label === 'Kinks')?.options;
    expect(reserved).toEqual(expect.arrayContaining(['fantasy roleplay', 'fantasy scenes']));
    expect(reserved).not.toContain('fisting');
    expect(reserved).not.toContain('heavy bondage');
  });
  it('keeps vibe choices grouped without redundant or non-local options', () => {
    expect(optionsFor('Energy')).toContain('Chill');
    expect(optionsFor('Style')).not.toContain('Raver');
    expect(optionsFor('Energy')).not.toContain('Raver');
    expect(optionsFor('Scenes')).toContain('Furry');
    expect(optionsFor('Scenes')).toContain('Thespian');
    expect(optionsFor('Scenes')).not.toContain('Wolf');
    expect(optionsFor('Archetypes')).toEqual(
      expect.arrayContaining([
        'Himbo', 'Angel', 'Prince', 'Queen', 'Jester', 'King',
        'Wolf', 'Succubus', 'Incubus', 'Vampire', 'Cyborg',
        'Unicorn', 'Cuck', 'Hotwife', 'Hothusband', 'Cuckquean'
      ])
    );
    // Kink roles moved out of Archetypes into ROLES; they must still exist somewhere.
    expect(ROLES).toEqual(
      expect.arrayContaining(['handler', 'rope bunny', 'rigger', 'trainer', 'sadist', 'masochist'])
    );
    expect(optionsFor('Archetypes')).not.toEqual(
      expect.arrayContaining(['Handler', 'Rope Bunny', 'Rigger', 'Trainer', 'Sadist', 'Masochist'])
    );
  });

  it('keeps looking-for choices focused on immediate local intent', () => {
    expect(LOOKING_FOR).toEqual([
      'chat', 'cruise', 'cyber sex', 'dating', 'dynamic', 'friends', 'group', 'hookup', 'networking',
      'play partner', 'right now', 'role play partner', 'sex parties', 'sneaky link', 'threesome'
    ]);
    expect(LOOKING_FOR).not.toContain('relationship');
  });

  it('keeps drag as a scene instead of a hobby', () => {
    expect(optionsFor('Scenes')).toContain('Drag');
    expect(HOBBIES).not.toContain('drag');
  });

  it('groups requested music hobbies and vocalist scene', () => {
    expect(HOBBY_GROUPS.find((group) => group.label === 'Music')?.options).toEqual(['bass', 'drums', 'guitar', 'keyboard', 'producing', 'songwriting']);
    expect(optionsFor('Scenes')).toContain('Vocalist');
  });

  it('keeps body descriptors in body type instead of vibes', () => {
    expect(BODY_TYPES).toEqual(expect.arrayContaining([
      'BBW', 'BBM', 'bear', 'big dick', 'busty', 'otter', 'small chested', 'small dick', 'twink',
    ]));
    expect(optionsFor('Scenes')).not.toEqual(expect.arrayContaining(['Bear', 'Otter', 'Twink']));
  });

  it('offers the expanded sexuality catalog while preserving the shared selection field', () => {
    expect(SEXUALITY).toEqual(expect.arrayContaining([
      'abrosexual', 'achillean', 'androsexual', 'graysexual', 'heteroflexible', 'homoflexible',
      'omnisexual', 'polysexual', 'sapphic',
    ]));
  });

  it('keeps removed profile labels out of active catalogs', () => {
    const vibeLabels = VIBE_GROUPS.flatMap((group) => group.options);
    const kinkLabels = KINK_CATALOG.map((option) => option.label);

    expect(vibeLabels).not.toEqual(expect.arrayContaining(['E-Girl', 'E-Boy']));
    expect(kinkLabels).not.toEqual(expect.arrayContaining(['tribadism', 'frottage']));
    expect(kinkLabels).toEqual(expect.arrayContaining(['tribbing', 'frotting']));
  });
});
