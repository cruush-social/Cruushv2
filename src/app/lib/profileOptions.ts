export const IDENTITIES = [
  'agender', 'androgynous', 'bakla', 'bigender', 'cis man', 'cis woman', 'crossdresser', 'demiboy', 'demigirl',
  'demi-nonbinary', 'dyke', 'fag', "fa'afafine", 'femme', 'gender nonconforming', 'genderfluid',
  'genderpunk', 'genderqueer', 'hijra', 'intersex', 'kathoey', 'man', 'māhū', 'maverique', 'muxé',
  'neutrois', 'nonbinary', 'pangender', 'polygender', 'questioning', 'queer', 'third gender', 'trans man', 'trans woman', 'travesti',
  'transfemme', 'transmasc', 'two-spirit', 'woman', 'x-gender'
];

export const PRESENTATIONS = [
  'androgynous', 'boi', 'butch', 'drag king', 'drag queen', 'drag thing', 'femboy', 'femme', 'femme queen', 'fluid', 'genderpunk', 'hard butch', 'hard femme',
  'high femme', 'masc', 'nonconforming', 'soft butch', 'soft femme', 'stone butch', 'stone femme', 'sissy', 'stud', 'tomboy'
];

export const PRONOUNS = ['ask me', 'fae/faer', 'he/him', 'she/her', 'they/them', 'xe/xem', 'ze/zir'];

export const SEXUALITY = ['asexual', 'bisexual', 'straight', 'gay', 'queer', 'questioning', 'other', 'pansexual', 'curious', 'demisexual', 'aromantic', 'lesbian', 'dyke', 'fag'];

export const MAX_PROFILE_SEXUALITIES = 3;

export const ETHNICITIES = ['Black', 'East Asian', 'Indigenous', 'Latino/Latina', 'Middle Eastern', 'Mixed', 'Other', 'Pacific Islander', 'South Asian', 'Southeast Asian', 'White'];

export const BODY_TYPES = [
  'BBW', 'BBM', 'athletic', 'average', 'bear', 'chubby', 'chub', 'cub', 'curvy', 'full-figured', 'muscular', 'otter', 'petite', 'plus-size', 'slim', 'stocky', 'toned', 'twink'
].sort();

export const POSITIONS = [
  'bottom', 'pillow princess', 'side', 'stone top', 'top', 'vers bottom', 'vers top', 'versatile'
].sort();

export const ROLES = [
  'dominant', 'service', 'submissive', 'switch'
].sort();

export const LOOKING_FOR = [
  'chat', 'cruise', 'dating', 'friends', 'group', 'hookup', 'networking', 'right now', 'threesome'
].sort();

export const AVAILABILITY = [
  'later', 'now', 'online', 'open'
].sort();

export const HOSTING = [
  'ask me', 'can host', 'can travel', "can't host", "can't travel", 'car', 'hotel', 'outdoors'
].sort();

export const VIBE_GROUPS = [
  {
    label: 'Style & Energy',
    options: [
      'Alt', 'Artsy', 'Chill', 'Clean-cut', 'Corporate', 'Cottagecore', 'E-Girl/E-Boy', 'Geek', 'Goth', 'Granola',
      'Homebody', 'Hippie', 'Punk', 'Rugged', 'Spiritual', 'Sporty'
    ].sort(),
  },
  {
    label: 'Scenes',
    options: [
      'Ballroom', 'Burner', 'Camping', 'Circuit', 'Club Kid', 'Cosplay', 'Country', 'Drag', 'Festival', 'Furry', 'Jock', 'Leather', 'Rave', 'Rubber', 'Sober', 'Sports', 'Stoner', 'Wolf'
    ].sort(),
  },
  {
    label: 'Archetypes',
    options: [
      'Baddie', 'Bimbo', 'Brat', 'Daddy', 'Doll', 'Goddess', 'Kitten', 'Mommy', 'Pixie', 'Pony', 'Princess', 'Pup', 'Service'
    ].sort(),
  },
];

export const VIBES = VIBE_GROUPS.flatMap((group) => group.options).sort();

export const CROWDS = ['Dyke', 'Gay', 'T4T'].sort();

export function normalizeCrowdOption(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === 'Sapphic' ? 'Dyke' : trimmedValue;
}

export function normalizeCrowdValues(values: string[] = []) {
  return [...new Set(values.map(normalizeCrowdOption).filter(Boolean))];
}

export const HIV_STATUS = ['negative', 'positive', 'prefer not to say', 'undetectable', 'unknown'];
export const CONDOMS = ['always', 'discuss', 'never', 'prefer not to say', 'sometimes'];
export const PREP = ['no', 'prefer not to say', 'yes'];
export const DOXYPEP = ['no', 'prefer not to say', 'yes'];
export const COVID_VACCINE = ['no', 'partial', 'prefer not to say', 'yes'];
export const MPOX_VACCINE = ['no', 'partial', 'prefer not to say', 'yes'];
export const SUBSTANCE_BOUNDARIES = [
  'No alcohol involved',
  'No cannabis involved',
  'No tobacco or vaping involved',
  'No poppers involved',
  'No PnP',
  'No other drugs involved',
  "Let's discuss",
];

export const PROFILE_VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'mutual_cruushes', label: 'Mutual cruushes' },
  { value: 'mutual_crowds', label: 'Mutual Crowds' },
];

export const KINK_CATALOG = [
  { id: 'anal', label: 'anal', category: 'Body & Touch' },
  { id: 'massage', label: 'massage', category: 'Body & Touch' },
  { id: 'mutual-masturbation', label: 'mutual masturbation', category: 'Body & Touch' },
  { id: 'nipple-play', label: 'nipple play', category: 'Body & Touch' },
  { id: 'oral', label: 'oral', category: 'Body & Touch' },
  { id: 'pegging', label: 'pegging', category: 'Body & Touch' },
  { id: 'pits', label: 'pits', category: 'Body & Touch' },
  { id: 'rimming', label: 'rimming', category: 'Body & Touch' },
  { id: 'bondage', label: 'bondage', category: 'Power' },
  { id: 'chastity', label: 'chastity', category: 'Power' },
  { id: 'edging', label: 'edging', category: 'Power' },
  { id: 'humiliation', label: 'humiliation', category: 'Power' },
  { id: 'impact', label: 'impact', category: 'Power' },
  { id: 'praise', label: 'praise', category: 'Power' },
  { id: 'rough', label: 'rough', category: 'Power' },
  { id: 'spanking', label: 'spanking', category: 'Power' },
  { id: 'costumes', label: 'costumes', category: 'Gear' },
  { id: 'leather', label: 'leather', category: 'Gear' },
  { id: 'lingerie', label: 'lingerie', category: 'Gear' },
  { id: 'uniforms', label: 'uniforms', category: 'Gear' },
  { id: 'dirty-talk', label: 'dirty talk', category: 'Roleplay' },
  { id: 'pet-play', label: 'pet play', category: 'Roleplay' },
  { id: 'roleplay', label: 'roleplay', category: 'Roleplay' },
  { id: 'group', label: 'group', category: 'Group' },
  { id: 'exhibitionism', label: 'exhibitionism', category: 'Voyeur / Exhibition' },
  { id: 'public', label: 'public', category: 'Voyeur / Exhibition' },
  { id: 'voyeurism', label: 'voyeurism', category: 'Voyeur / Exhibition' },
  { id: 'sensation', label: 'sensation', category: 'Sensory' },
  { id: 'wax', label: 'wax', category: 'Sensory' },
  { id: 'toys', label: 'toys', category: 'Toys' },
  { id: 'breath-play', label: 'breath play', category: 'Edge / Discuss' },
  { id: 'cbt', label: 'cbt', category: 'Edge / Discuss' },
  { id: 'feet', label: 'feet', category: 'Other / Discuss' },
  { id: 'fisting', label: 'fisting', category: 'Other / Discuss' },
  { id: 'gooning', label: 'gooning', category: 'Other / Discuss' },
  { id: 'watersports', label: 'watersports', category: 'Other / Discuss' },
].sort((a, b) => a.label.localeCompare(b.label));

export const KINKS = KINK_CATALOG.map((kink) => kink.label);

export const KINK_GROUPS = [
  'Body & Touch',
  'Power',
  'Gear',
  'Roleplay',
  'Group',
  'Voyeur / Exhibition',
  'Sensory',
  'Toys',
  'Edge / Discuss',
  'Other / Discuss',
].map((category) => ({
  label: category,
  options: KINK_CATALOG
    .filter((kink) => kink.category === category)
    .map((kink) => kink.label)
    .sort((a, b) => a.localeCompare(b)),
})).filter((group) => group.options.length > 0);

export const HOBBIES = [
  'activism', 'anime/manga', 'art', 'astrology', 'baking', 'board games', 'camping', 'comedy', 'cooking',
  'cosplay', 'crafts', 'cycling', 'dancing', 'diy', 'djing', 'film/tv', 'fitness', 'gardening', 'gaming',
  'hiking', 'journaling', 'karaoke', 'makeup', 'martial arts', 'meditation', 'music', 'painting', 'photography',
  'poetry', 'pottery', 'reading', 'roller skating', 'running', 'skateboarding', 'singing', 'streaming', 'swimming',
  'theater', 'thrifting', 'vintage collecting', 'volunteering', 'writing', 'yoga'
].sort();
