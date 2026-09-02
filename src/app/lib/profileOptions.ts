function alphabetize(options: string[]) {
  return [...options].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export const IDENTITIES = alphabetize([
  'agender', 'androgynous', 'bakla', 'bigender', 'cis man', 'cis woman', 'crossdresser', 'demiboy', 'demigirl',
  'demi-nonbinary', 'dyke', 'fag', "fa'afafine", 'femme', 'gender nonconforming', 'genderfluid',
  'genderpunk', 'genderqueer', 'hijra', 'intersex', 'kathoey', 'man', 'māhū', 'maverique', 'muxé',
  'neutrois', 'nonbinary', 'pangender', 'polygender', 'questioning', 'queer', 'third gender', 'trans man', 'trans woman', 'travesti',
  'trans', 'transfemme', 'transmasc', 'two-spirit', 'woman', 'x-gender'
]);

export const PRESENTATIONS = alphabetize([
  'androgynous', 'boi', 'butch', 'drag king', 'drag queen', 'drag thing', 'femboy', 'femme', 'femme queen', 'fluid', 'genderpunk', 'hard butch', 'hard femme',
  'high femme', 'masc', 'nonconforming', 'soft butch', 'soft femme', 'stone butch', 'stone femme', 'sissy', 'stud', 'tomboy'
]);

export const PRONOUNS = alphabetize(['ask me', 'fae/faer', 'he/him', 'she/her', 'they/them', 'xe/xem', 'ze/zir']);

export const SEXUALITY = alphabetize(['asexual', 'bisexual', 'straight', 'gay', 'queer', 'questioning', 'other', 'pansexual', 'curious', 'demisexual', 'aromantic', 'lesbian', 'dyke', 'fag']);

export const MAX_PROFILE_SEXUALITIES = 3;

export const ETHNICITIES = alphabetize(['Black', 'East Asian', 'Indigenous', 'Latino/Latina', 'Middle Eastern', 'Mixed', 'Other', 'Pacific Islander', 'South Asian', 'Southeast Asian', 'White']);

export const BODY_TYPES = alphabetize([
  'BBW', 'BBM', 'athletic', 'average', 'bear', 'chubby', 'chub', 'cub', 'curvy', 'full-figured', 'muscular', 'otter', 'petite', 'plus-size', 'slim', 'stocky', 'toned', 'twink'
]);

export const BODY_HAIR = ['Natural', 'Hairy', 'Trimmed', 'Shaved', 'Smooth'];

export const POSITIONS = alphabetize([
  'bottom', 'pillow princess', 'side', 'stone bottom', 'stone top', 'top', 'vers bottom', 'vers top', 'versatile'
]);

export const ROLES = alphabetize([
  'brat', 'dominant', 'handler', 'pet', 'rigger', 'rope bunny', 'service', 'submissive', 'switch', 'trainer', 'worship'
]);

export const LOOKING_FOR = alphabetize([
  'chat', 'cruise', 'dating', 'friends', 'group', 'hookup', 'networking', 'right now', 'threesome'
]);

export const AVAILABILITY = alphabetize([
  'later', 'now', 'online', 'open'
]);

export const HOSTING = alphabetize([
  'ask me', 'bathroom', 'can host', 'can travel', "can't host", "can't travel", 'car', 'hotel', 'locker room', 'outdoors', 'sauna'
]);

export const VIBE_GROUPS = [
  {
    label: 'Style & Energy',
    options: [
      'Academia', 'Alt', 'Artsy', 'Blue-collar', 'Chill', 'Clean-cut', 'Corporate', 'Cottagecore', 'Disabled', 'Discreet', 'Geek', 'Goth', 'Granola',
      'Hacker', 'Homebody', 'Hippie', 'Neurodivergent', 'Punk', 'Rugged', 'Spiritual'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
  {
    label: 'Scenes',
    options: [
      'Ballroom', 'Burner', 'Camping', 'Circuit', 'Club Kid', 'Collegiate', 'Cosplay', 'Country', 'Drag', 'Festival', 'Furry', 'Jock', 'Leather', 'Raver', 'Rubber', 'Sober', 'Stoner', 'Thespian'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
  {
    label: 'Archetypes',
    options: [
      'Angel', 'Baddie', 'Bimbo', 'Bull', 'Cuck', 'Cuckquean', 'Cyborg', 'Daddy', 'Doll', 'Goddess', 'Himbo', 'Hothusband', 'Hotwife', 'Incubus', 'Jester', 'King', 'Kitten', 'Masochist', 'Mommy', 'Pixie', 'Pony', 'Prince', 'Princess', 'Pup', 'Queen', 'Sadist', 'Succubus', 'Trade', 'Unicorn', 'Vampire', 'Wolf'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
];

export const VIBES = alphabetize(VIBE_GROUPS.flatMap((group) => group.options));

export const CROWDS = alphabetize(['Dyke', 'Gay', 'T4T']);

export function normalizeCrowdOption(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === 'Sapphic' ? 'Dyke' : trimmedValue;
}

export function normalizeCrowdValues(values: string[] = []) {
  return [...new Set(values.map(normalizeCrowdOption).filter(Boolean))];
}

export const HIV_STATUS = alphabetize(['negative', 'positive', 'prefer not to say', 'undetectable', 'unknown']);
export const CONDOMS = alphabetize(['always', 'discuss', 'never', 'prefer not to say', 'sometimes']);
export const PREP = alphabetize(['no', 'prefer not to say', 'yes']);
export const DOXYPEP = alphabetize(['no', 'prefer not to say', 'yes']);
export const COVID_VACCINE = alphabetize(['no', 'partial', 'prefer not to say', 'yes']);
export const MPOX_VACCINE = alphabetize(['no', 'partial', 'prefer not to say', 'yes']);
export const HEALTH_PREFERENCES = alphabetize(['COVID tested', 'Masks']);
export const BIRTH_CONTROL = alphabetize([
  'Arm implant',
  'Ask me',
  'Condoms',
  'Hormonal',
  'IUD',
  'Prefer not to say',
  'Rhythm method',
  'Spermicide',
]);
export const SUBSTANCE_BOUNDARIES = alphabetize([
  'No alcohol involved',
  'No cannabis involved',
  'No tobacco or vaping involved',
  'No poppers involved',
  'No PnP',
  'No other drugs involved',
  "Let's discuss",
]);

export const PROFILE_VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'mutual_cruushes', label: 'Mutuals' },
  { value: 'mutual_crowds', label: 'Mutual Crowds' },
];

export const KINK_CATALOG = [
  { id: 'anal', label: 'anal', category: 'Acts' },
  { id: 'massage', label: 'massage', category: 'Body & Touch' },
  { id: 'fingering', label: 'fingering', category: 'Body & Touch' },
  { id: 'frotting', label: 'frotting', category: 'Body & Touch' },
  { id: 'hand-jobs', label: 'hand jobs', category: 'Body & Touch' },
  { id: 'mutual-masturbation', label: 'mutual masturbation', category: 'Acts' },
  { id: 'nipple-play', label: 'nipple play', category: 'Acts' },
  { id: 'oral', label: 'oral', category: 'Acts' },
  { id: 'pegging', label: 'pegging', category: 'Acts' },
  { id: 'pits', label: 'pits', category: 'Body & Touch' },
  { id: 'feet', label: 'feet', category: 'Body & Touch' },
  { id: 'rimming', label: 'rimming', category: 'Acts' },
  { id: 'bondage', label: 'bondage', category: 'Bondage & Sensation' },
  { id: 'chastity', label: 'chastity', category: 'Power' },
  { id: 'edging', label: 'edging', category: 'Power' },
  { id: 'humiliation', label: 'humiliation', category: 'Power' },
  { id: 'impact', label: 'impact', category: 'Bondage & Sensation' },
  { id: 'praise', label: 'praise', category: 'Power' },
  { id: 'rough', label: 'rough', category: 'Power' },
  { id: 'spanking', label: 'spanking', category: 'Bondage & Sensation' },
  { id: 'costumes', label: 'costumes', category: 'Gear' },
  { id: 'leather', label: 'leather', category: 'Gear' },
  { id: 'lingerie', label: 'lingerie', category: 'Gear' },
  { id: 'uniforms', label: 'uniforms', category: 'Gear' },
  { id: 'dirty-talk', label: 'dirty talk', category: 'Roleplay' },
  { id: 'pet-play', label: 'pet play', category: 'Roleplay' },
  { id: 'roleplay', label: 'roleplay', category: 'Roleplay' },
  { id: 'group', label: 'group', category: 'Group' },
  { id: 'exhibitionism', label: 'exhibitionism', category: 'Public & Watching' },
  { id: 'public', label: 'public', category: 'Public & Watching' },
  { id: 'voyeurism', label: 'voyeurism', category: 'Public & Watching' },
  { id: 'sensation', label: 'sensation', category: 'Bondage & Sensation' },
  { id: 'wax', label: 'wax', category: 'Bondage & Sensation' },
  { id: 'toys', label: 'toys', category: 'Toys' },
  { id: 'breath-play', label: 'breath play', category: 'Edge' },
  { id: 'cock-ball-torture', label: 'cock & ball torture', category: 'Edge' },
  { id: 'fisting', label: 'fisting', category: 'Acts' },
  { id: 'gooning', label: 'gooning', category: 'Edge' },
  { id: 'tribbing', label: 'tribbing', category: 'Body & Touch' },
  { id: 'watersports', label: 'watersports', category: 'Other' },
  { id: 'biting', label: 'biting', category: 'Body & Touch' },
  { id: 'cuddling', label: 'cuddling', category: 'Body & Touch' },
  { id: 'deep-throat', label: 'deep throat', category: 'Acts' },
  { id: 'docking', label: 'docking', category: 'Acts' },
  { id: 'grinding', label: 'grinding', category: 'Acts' },
  { id: 'hair-pulling', label: 'hair pulling', category: 'Body & Touch' },
  { id: 'making-out', label: 'making out', category: 'Body & Touch' },
  { id: 'marking', label: 'marking', category: 'Body & Touch' },
  { id: 'muscle-worship', label: 'muscle worship', category: 'Body & Touch' },
  { id: 'scratching', label: 'scratching', category: 'Body & Touch' },
  { id: 'sixty-nine', label: 'sixty-nine', category: 'Acts' },
  { id: 'sweat', label: 'sweat', category: 'Body & Touch' },
  { id: 'brat-taming', label: 'brat taming', category: 'Power' },
  { id: 'collaring', label: 'collaring', category: 'Power' },
  { id: 'degradation', label: 'degradation', category: 'Power' },
  { id: 'discipline', label: 'discipline', category: 'Power' },
  { id: 'dominance', label: 'dominance', category: 'Power' },
  { id: 'obedience', label: 'obedience', category: 'Power' },
  { id: 'orgasm-control', label: 'orgasm control', category: 'Power' },
  { id: 'protocol', label: 'protocol', category: 'Power' },
  { id: 'service', label: 'service', category: 'Power' },
  { id: 'submission', label: 'submission', category: 'Power' },
  { id: 'worship', label: 'worship', category: 'Power' },
  { id: 'boots', label: 'boots', category: 'Gear' },
  { id: 'diaper', label: 'diaper', category: 'Gear' },
  { id: 'harness', label: 'harness', category: 'Gear' },
  { id: 'jockstraps', label: 'jockstraps', category: 'Gear' },
  { id: 'latex', label: 'latex', category: 'Gear' },
  { id: 'masks', label: 'masks', category: 'Gear' },
  { id: 'panties', label: 'panties', category: 'Gear' },
  { id: 'rubber', label: 'rubber', category: 'Gear' },
  { id: 'singlets', label: 'singlets', category: 'Gear' },
  { id: 'socks', label: 'socks', category: 'Gear' },
  { id: 'sportswear', label: 'sportswear', category: 'Gear' },
  { id: 'boss-and-worker', label: 'boss and worker', category: 'Roleplay' },
  { id: 'bimbofication', label: 'bimbofication', category: 'Roleplay' },
  { id: 'coach-and-athlete', label: 'coach and athlete', category: 'Roleplay' },
  { id: 'cuckholding', label: 'cuckholding', category: 'Roleplay' },
  { id: 'doctor-and-patient', label: 'doctor and patient', category: 'Roleplay' },
  { id: 'fantasy-scenes', label: 'fantasy scenes', category: 'Roleplay' },
  { id: 'hypno', label: 'hypno', category: 'Roleplay' },
  { id: 'stranger-scenes', label: 'stranger scenes', category: 'Roleplay' },
  { id: 'sissy', label: 'sissy', category: 'Roleplay' },
  { id: 'double-penetration', label: 'double penetration', category: 'Group' },
  { id: 'foursome', label: 'foursome', category: 'Group' },
  { id: 'gangbang', label: 'gangbang', category: 'Group' },
  { id: 'group-scenes', label: 'group scenes', category: 'Group' },
  { id: 'orgy', label: 'orgy', category: 'Group' },
  { id: 'partner-swap', label: 'partner swap', category: 'Group' },
  { id: 'spit-roast', label: 'spit roast', category: 'Group' },
  { id: 'threesome', label: 'threesome', category: 'Group' },
  { id: 'cum-dump', label: 'cum dump', category: 'Group' },
  { id: 'being-watched', label: 'being watched', category: 'Public & Watching' },
  { id: 'camera-play', label: 'camera play', category: 'Public & Watching' },
  { id: 'car-play', label: 'car play', category: 'Public & Watching' },
  { id: 'cruising-spots', label: 'cruising spots', category: 'Public & Watching' },
  { id: 'filming', label: 'filming', category: 'Public & Watching' },
  { id: 'glory-hole', label: 'glory hole', category: 'Public & Watching' },
  { id: 'mirrors', label: 'mirrors', category: 'Public & Watching' },
  { id: 'outdoor-scenes', label: 'outdoor scenes', category: 'Public & Watching' },
  { id: 'photos', label: 'photos', category: 'Public & Watching' },
  { id: 'watching-others', label: 'watching others', category: 'Public & Watching' },
  { id: 'windows', label: 'windows', category: 'Public & Watching' },
  { id: 'blindfolds', label: 'blindfolds', category: 'Bondage & Sensation' },
  { id: 'clamps', label: 'clamps', category: 'Bondage & Sensation' },
  { id: 'cold-play', label: 'cold play', category: 'Bondage & Sensation' },
  { id: 'feathers', label: 'feathers', category: 'Bondage & Sensation' },
  { id: 'ice', label: 'ice', category: 'Bondage & Sensation' },
  { id: 'light-bondage', label: 'light bondage', category: 'Bondage & Sensation' },
  { id: 'sensory-deprivation', label: 'sensory deprivation', category: 'Bondage & Sensation' },
  { id: 'spanking-implements', label: 'spanking implements', category: 'Bondage & Sensation' },
  { id: 'temperature-play', label: 'temperature play', category: 'Bondage & Sensation' },
  { id: 'tickling', label: 'tickling', category: 'Bondage & Sensation' },
  { id: 'anal-beads', label: 'anal beads', category: 'Toys' },
  { id: 'butt-plugs', label: 'butt plugs', category: 'Toys' },
  { id: 'cock-rings', label: 'cock rings', category: 'Toys' },
  { id: 'dildos', label: 'dildos', category: 'Toys' },
  { id: 'harness-toys', label: 'harness toys', category: 'Toys' },
  { id: 'plugs-in-public', label: 'plugs in public', category: 'Toys' },
  { id: 'prostate-toys', label: 'prostate toys', category: 'Toys' },
  { id: 'pumps', label: 'pumps', category: 'Toys' },
  { id: 'strap-ons', label: 'strap-ons', category: 'Toys' },
  { id: 'vibrators', label: 'vibrators', category: 'Toys' },
  { id: 'cnc', label: 'CNC', category: 'Edge' },
  { id: 'cunt-busting', label: 'cunt busting', category: 'Edge' },
  { id: 'electro', label: 'electro', category: 'Edge' },
  { id: 'fear-play', label: 'fear play', category: 'Edge' },
  { id: 'knife-play', label: 'knife play', category: 'Edge' },
  { id: 'needles', label: 'needles', category: 'Edge' },
  { id: 'rope-suspension', label: 'rope suspension', category: 'Edge' },
  { id: 'tit-torture', label: 'tit torture', category: 'Edge' },
  { id: 'chastity-keyholding', label: 'chastity keyholding', category: 'Power' },
  { id: 'food-play', label: 'food play', category: 'Other' },
  { id: 'messy-play', label: 'messy play', category: 'Other' },
  { id: 'pup-play', label: 'pup play', category: 'Roleplay' },
  { id: 'shibari', label: 'shibari', category: 'Bondage & Sensation' },
  { id: 'showers', label: 'showers', category: 'Other' },
  { id: 'sounding', label: 'sounding', category: 'Acts' },
  { id: 'spit', label: 'spit', category: 'Acts' },
].sort((a, b) => a.label.localeCompare(b.label));

/**
 * Where you stand with other people. Long on purpose: someone reading a profile
 * before they cross a city deserves the real answer, and "it's complicated" is
 * a real answer.
 */
export const RELATIONSHIP_STATUS = [
  'Single',
  'Single and looking',
  'Single, not looking',
  'Newly single',
  'Talking to someone',
  'Situationship',
  'Casually dating',
  'Dating around',
  'Seeing someone',
  'Exclusive',
  'Partnered',
  'Committed',
  'Engaged',
  'Married',
  'Domestic partnership',
  'Long distance',
  'Monogamish',
  'Open relationship',
  'Ethically non-monogamous',
  'Polyamorous',
  'Solo poly',
  'Relationship anarchy',
  'Nesting partner',
  'Comet',
  'Swinging',
  "Don't ask don't tell",
  'Partner knows',
  'Taking a break',
  'Separated',
  'Divorced',
  'Widowed',
  "It's complicated",
  "Let's discuss",
  'Ask me',
  'Prefer not to say',
];

export const ZODIAC = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

export const KINKS = KINK_CATALOG.map((kink) => kink.label);

export const KINK_GROUPS = [
  'Body & Touch',
  'Acts',
  'Power',
  'Bondage & Sensation',
  'Gear',
  'Toys',
  'Roleplay',
  'Group',
  'Public & Watching',
  'Edge',
  'Other',
].map((category) => ({
  label: category,
  options: KINK_CATALOG
    .filter((kink) => kink.category === category)
    .map((kink) => kink.label)
    .sort((a, b) => a.localeCompare(b)),
})).filter((group) => group.options.length > 0);

export const HOBBY_GROUPS = [
  {
    label: 'Arts & Culture',
    options: alphabetize([
      'art', 'comedy', 'comics', 'crafts', 'film/tv', 'makeup', 'painting', 'photography', 'poetry', 'pottery', 'reading', 'theater', 'vintage collecting', 'writing',
    ]),
  },
  {
    label: 'Food & Home',
    options: alphabetize(['baking', 'cooking', 'diy', 'gardening', 'thrifting']),
  },
  {
    label: 'Games & Fandom',
    options: alphabetize(['anime/manga', 'board games', 'cosplay', 'gaming', 'streaming']),
  },
  {
    label: 'Music & Nightlife',
    options: alphabetize(['dancing', 'djing', 'karaoke', 'music', 'singing']),
  },
  {
    label: 'Outdoors & Nature',
    options: alphabetize(['camping', 'hiking']),
  },
  {
    label: 'Sports & Fitness',
    options: alphabetize([
      'baseball', 'basketball', 'bowling', 'boxing', 'climbing', 'cycling', 'fitness', 'martial arts', 'pickleball', 'roller skating', 'running', 'skateboarding', 'soccer', 'softball', 'swimming', 'tennis', 'volleyball', 'weightlifting', 'yoga',
    ]),
  },
  {
    label: 'Community & Mind',
    options: alphabetize(['activism', 'astrology', 'journaling', 'meditation', 'volunteering']),
  },
].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));

export const HOBBIES = alphabetize(HOBBY_GROUPS.flatMap((group) => group.options));
