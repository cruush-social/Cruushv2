import { PLACE_FACILITY_LABELS, PLACE_FACILITY_TYPES } from './places';

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

const ONBOARDING_FIRST_IDENTITIES = alphabetize([
  'man', 'woman', 'cis man', 'cis woman', 'trans woman', 'trans man',
  'transmasc', 'transfemme', 'nonbinary', 'two-spirit',
]);
export const ONBOARDING_IDENTITIES = [
  ...ONBOARDING_FIRST_IDENTITIES,
  ...IDENTITIES.filter((identity) => !ONBOARDING_FIRST_IDENTITIES.includes(identity)),
];

export const PRESENTATIONS = alphabetize([
  'androgynous', 'boi', 'butch', 'drag king', 'drag queen', 'drag thing', 'femboy', 'femme', 'femme queen', 'fluid', 'genderpunk', 'hard butch', 'hard femme',
  'high femme', 'masc', 'nonconforming', 'soft butch', 'soft femme', 'stone butch', 'stone femme', 'stud', 'tomboy'
]);

export const PRONOUNS = alphabetize(['ask me', 'fae/faer', 'he/him', 'she/her', 'they/them', 'xe/xem', 'ze/zir']);

export const SEXUALITY = alphabetize(['asexual', 'bisexual', 'straight', 'gay', 'queer', 'questioning', 'other', 'pansexual', 'curious', 'demisexual', 'aromantic', 'lesbian', 'dyke', 'fag']);

export const MAX_PROFILE_SEXUALITIES = 3;

export const ETHNICITIES = alphabetize(['Black', 'East Asian', 'Indigenous', 'Latino/Latina', 'Middle Eastern', 'Mixed', 'Other', 'Pacific Islander', 'South Asian', 'Southeast Asian', 'White']);

export const BODY_TYPES = alphabetize([
  'BBW', 'BBM', 'athletic', 'average', 'bear', 'big and tall', 'chubby', 'chub', 'cub', 'curvy', 'dad bod', 'disabled',
  'fat', 'full-figured', 'lean', 'little person', 'muscular', 'otter', 'petite', 'plus-size', 'round', 'slim', 'soft',
  'stocky', 'thick', 'toned', 'twink', 'wheelchair user'
]);


export const POSITIONS = alphabetize([
  'bottom', 'hands only', 'oral only', 'side', 'stone bottom', 'stone top', 'top', 'vers bottom', 'vers top', 'versatile'
]);

export const ROLES = alphabetize([
  'brat', 'brat tamer', 'caregiver', 'degradee', 'degrader', 'dominant', 'handler', 'hunter', 'little', 'masochist', 'owner',
  'pet', 'pleasure dom', 'pleasure sub', 'pleasure switch', 'prey', 'rigger', 'rope bunny', 'sadist', 'sadomasochist', 'service',
  'service dom', 'service sub', 'service switch', 'submissive', 'switch', 'trainer',
  'worshipped', 'worshipper'
]);

export const LOOKING_FOR = alphabetize([
  'chat', 'cruise', 'cyber sex', 'dating', 'dynamic', 'friends', 'group', 'hookup', 'networking', 'play partner', 'right now', 'role play partner', 'sex parties', 'sneaky link', 'threesome'
]);

export const AVAILABILITY = alphabetize([
  'later', 'now', 'online', 'open'
]);

export const HOSTING = alphabetize([
  'ask me', 'can host', 'can travel', "can't host", "can't travel"
]);

export const PREFERRED_SPOTS = alphabetize([
  ...new Set([
    ...PLACE_FACILITY_TYPES.map((facilityType) => PLACE_FACILITY_LABELS[facilityType]),
    'My place',
    'Your place',
    'Car',
    'Locker room',
    'Outdoors',
  ]),
]);

export const VIBE_GROUPS = [
  {
    label: 'Style',
    options: [
      'Academia', 'Alt', 'Artsy', 'Blue-collar', 'Camp', 'Clean-cut', 'Corporate', 'Cottagecore', 'DIY', 'Discreet', 'Earthy', 'Eclectic',
      'Elegant', 'Futurist', 'Geek', 'Glam', 'Granola', 'Hippie', 'Maximalist', 'Minimalist', 'Polished', 'Primitivist', 'Rugged', 'Techie',
      'Newly out', 'Trade', 'Vagabond', 'Vintage', 'Witchy'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
  {
    label: 'Energy',
    options: [
      'Adventurous', 'Affectionate', 'Alpha', 'Beta', 'Bold', 'Chaotic', 'Chill', 'Cozy', 'Curious', 'Deadpan', 'Deviant', 'Direct', 'Dreamy',
      'Experimental', 'Flirty', 'Freak', 'Gentle', 'Goofy', 'High-energy', 'Homebody', 'Intense', 'Mysterious', 'Night owl', 'Normie',
      'Outdoorsy', 'Playful', 'Romantic', 'Sensual', 'Soft-spoken', 'Spiritual', 'Spontaneous', 'Tender', 'Unfiltered', 'Vanilla', 'Warm', 'Weird'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
  {
    label: 'Scenes',
    options: [
      'Art scene', 'Ballroom', 'Beach', 'Burlesque', 'Burner', 'Cabaret', 'Camping', 'Circuit', 'Club Kid', 'Collegiate',
      'Cosplay', 'Country', 'Disco', 'Drag', 'Fashion', 'Festival', 'Furry', 'Goth', 'Horror', 'House', 'Hyperpop', 'Musician',
      'Footwork', 'Hardcore', 'Indie', 'Industrial', 'Jock', 'Karaoke', 'Kiki', 'LARPing', 'Leather', 'Maker', 'Metal', 'Nature', 'Nudist',
      'Organizer', 'Party', 'Producer', 'Punk', 'Queer arts', 'Queer nightlife', 'Raver', 'Rubber', 'Sci-fi', 'Sex-positive', 'Skate', 'Sober',
      'Stoner', 'Techno', 'Thespian', 'Vocalist',
      'Underground'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
  {
    label: 'Archetypes',
    options: [
      'Angel', 'Baddie', 'Bimbo', 'Bitch', 'Boss', 'Bro', 'Bull', 'Bully', 'Clown', 'Cock sleeve', 'Cougar', 'Cuck', 'Cuckquean',
      'Cum dump', 'Cyborg', 'Daddy', 'Deity', 'Demon', 'Doll', 'Dominatrix', 'Domme', 'Drone', 'Dude', 'God/Goddess', 'Gooner', 'Gremlin', 'Hedonist', 'Himbo',
      'Hothusband', 'Hotwife', 'Incubus', 'Jester', 'King', 'Kitten', 'Master', 'Minx', 'Mistress', 'Mommy', 'Nympho',
      'Object', 'Outlaw', 'Owned', 'Pervert', 'Pig', 'Pixie', 'Plaything', 'Pony', 'Pornstar', 'Prince', 'Princess', 'Pup', 'Queen',
      'Sensualist', 'Servant', 'Side piece', 'Silver fox', 'Siren', 'Sis', 'Sissy', 'Size royalty', 'Slut', 'Succubus', 'Swinger', 'Thembo',
      'Toilet', 'Unicorn', 'Vampire', 'Werewolf', 'Whore', 'Wolf', 'Zaddy'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
  {
    label: 'Identity',
    options: [
      'Blind/low vision', 'Chronically ill', 'Deaf', 'Disabled', 'Hard of hearing',
      'Mobility-aid user', 'Neurodivergent'
    ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
  },
];

export const VIBES = alphabetize(VIBE_GROUPS.flatMap((group) => group.options));
export const VISIBILITY_VIBE_GROUPS = VIBE_GROUPS.filter((group) => group.label !== 'Identity');

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

/**
 * One list replacing the separate Condoms, PrEP, DoxyPEP, COVID vaccine, Mpox
 * vaccine and birth control fields. A member picks everything they use rather
 * than answering six yes/no questions.
 */
export const PROTECTIONS = [
  'Condoms',
  'Dental dams',
  'Gloves',
  'Masks',
  'Birth control',
  'PrEP',
  'DoxyPEP',
  'COVID vaccine',
  'Mpox vaccine',
  'Prefer not to say',
];

export const PROTECTION_BOUNDARIES = [
  'Bareback only',
  'Bareback if on PrEP',
  'Barriers only',
  'Bareback or barriers',
  'Talk first',
  'Prefer not to say',
];

export const PROFILE_VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'mutual_cruushes', label: 'Mutuals' },
  { value: 'mutual_crowds', label: 'Mutual Crowds' },
];

export const KINK_CATALOG = [
  { id: 'anal', label: 'anal', category: 'Body & Touch' },
  { id: 'massage', label: 'massage', category: 'Bondage & Sensation' },
  { id: 'fingering', label: 'fingering', category: 'Body & Touch' },
  { id: 'fisting', label: 'fisting', category: 'Body & Touch' },
  { id: 'frotting', label: 'frotting', category: 'Body & Touch' },
  { id: 'hand-jobs', label: 'hand jobs', category: 'Body & Touch' },
  { id: 'pegging', label: 'pegging', category: 'Body & Touch' },
  { id: 'pits', label: 'pits', category: 'Body & Touch' },
  { id: 'feet', label: 'feet', category: 'Body & Touch' },
  { id: 'rimming', label: 'rimming', category: 'Body & Touch' },
  { id: 'bondage', label: 'bondage', category: 'Bondage & Sensation' },
  { id: 'heavy-bondage', label: 'heavy bondage', category: 'Bondage & Sensation' },
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
  { id: 'gooning', label: 'gooning', category: 'Edge' },
  { id: 'tribbing', label: 'tribbing', category: 'Body & Touch' },
  { id: 'watersports', label: 'watersports', category: 'Other' },
  { id: 'biting', label: 'biting', category: 'Body & Touch' },
  { id: 'cuddling', label: 'cuddling', category: 'Body & Touch' },
  { id: 'bukkake', label: 'bukkake', category: 'Body & Touch' },
  { id: 'cum-play', label: 'cum play', category: 'Body & Touch' },
  { id: 'cunnilingus', label: 'cunnilingus', category: 'Body & Touch' },
  { id: 'deep-throat', label: 'deep throat', category: 'Body & Touch' },
  { id: 'docking', label: 'docking', category: 'Body & Touch' },
  { id: 'facials', label: 'facials', category: 'Body & Touch' },
  { id: 'grinding', label: 'grinding', category: 'Body & Touch' },
  { id: 'hands', label: 'hands', category: 'Body & Touch' },
  { id: 'humping', label: 'humping', category: 'Body & Touch' },
  { id: 'hair-pulling', label: 'hair pulling', category: 'Body & Touch' },
  { id: 'making-out', label: 'making out', category: 'Body & Touch' },
  { id: 'marking', label: 'marking', category: 'Body & Touch' },
  { id: 'muscle-worship', label: 'muscle worship', category: 'Body & Touch' },
  { id: 'mutual-masturbation', label: 'mutual masturbation', category: 'Body & Touch' },
  { id: 'navel-belly', label: 'navel/belly', category: 'Body & Touch' },
  { id: 'penetrative-sex', label: 'penetrative sex', category: 'Body & Touch' },
  { id: 'piercings', label: 'piercings', category: 'Body & Touch' },
  { id: 'scratching', label: 'scratching', category: 'Body & Touch' },
  { id: 'sixty-nine', label: 'sixty-nine', category: 'Body & Touch' },
  { id: 'spooning', label: 'spooning', category: 'Body & Touch' },
  { id: 'squirting', label: 'squirting', category: 'Body & Touch' },
  { id: 'sweat', label: 'sweat', category: 'Body & Touch' },
  { id: 'tattoos', label: 'tattoos', category: 'Body & Touch' },
  { id: 'twenty-four-seven', label: '24/7', category: 'Power' },
  { id: 'cuckholding', label: 'cuckholding', category: 'Power' },
  { id: 'degradation', label: 'degradation', category: 'Power' },
  { id: 'discipline', label: 'discipline', category: 'Power' },
  { id: 'financial-domination', label: 'financial domination', category: 'Power' },
  { id: 'femdom', label: 'femdom', category: 'Power' },
  { id: 'free-use', label: 'free use', category: 'Power' },
  { id: 'obedience', label: 'obedience', category: 'Power' },
  { id: 'orgasm-control', label: 'orgasm control', category: 'Power' },
  { id: 'orgasm-denial', label: 'orgasm denial', category: 'Power' },
  { id: 'power-exchange', label: 'power exchange', category: 'Power' },
  { id: 'protocol', label: 'protocol', category: 'Power' },
  { id: 'training', label: 'training', category: 'Power' },
  { id: 'worship', label: 'worship', category: 'Power' },
  { id: 'ass-worship', label: 'ass worship', category: 'Power' },
  { id: 'cock-worship', label: 'cock worship', category: 'Power' },
  { id: 'pussy-worship', label: 'pussy worship', category: 'Power' },
  { id: 'tit-worship', label: 'tit worship', category: 'Power' },
  { id: 'boots', label: 'boots', category: 'Gear' },
  { id: 'boxers', label: 'boxers', category: 'Gear' },
  { id: 'breast-plate', label: 'breast plate', category: 'Gear' },
  { id: 'briefs', label: 'briefs', category: 'Gear' },
  { id: 'cage', label: 'cage', category: 'Gear' },
  { id: 'chains', label: 'chains', category: 'Gear' },
  { id: 'collars', label: 'collars', category: 'Gear' },
  { id: 'corsets', label: 'corsets', category: 'Gear' },
  { id: 'cuffs', label: 'cuffs', category: 'Gear' },
  { id: 'crops', label: 'crops', category: 'Gear' },
  { id: 'diaper', label: 'diapers', category: 'Gear' },
  { id: 'gloves', label: 'gloves', category: 'Gear' },
  { id: 'fursuits', label: 'fursuits', category: 'Gear' },
  { id: 'harness', label: 'harness', category: 'Gear' },
  { id: 'high-heels', label: 'high heels', category: 'Gear' },
  { id: 'hoods', label: 'hoods', category: 'Gear' },
  { id: 'jockstraps', label: 'jockstraps', category: 'Gear' },
  { id: 'latex', label: 'latex', category: 'Gear' },
  { id: 'masks', label: 'masks', category: 'Gear' },
  { id: 'panties', label: 'panties', category: 'Gear' },
  { id: 'paddles', label: 'paddles', category: 'Gear' },
  { id: 'pvc', label: 'PVC', category: 'Gear' },
  { id: 'rope', label: 'rope', category: 'Gear' },
  { id: 'rubber', label: 'rubber', category: 'Gear' },
  { id: 'singlets', label: 'singlets', category: 'Gear' },
  { id: 'sneakers', label: 'sneakers', category: 'Gear' },
  { id: 'socks', label: 'socks', category: 'Gear' },
  { id: 'sportswear', label: 'sportswear', category: 'Gear' },
  { id: 'spreader-bar', label: 'spreader bar', category: 'Gear' },
  { id: 'suits', label: 'suits', category: 'Gear' },
  { id: 'boss-and-worker', label: 'boss and worker', category: 'Roleplay' },
  { id: 'bimbofication', label: 'bimbofication', category: 'Roleplay' },
  { id: 'coach-and-athlete', label: 'coach and athlete', category: 'Roleplay' },
  { id: 'doctor-and-patient', label: 'doctor and patient', category: 'Roleplay' },
  { id: 'fantasy-roleplay', label: 'fantasy roleplay', category: 'Roleplay' },
  { id: 'feminization', label: 'feminization', category: 'Roleplay' },
  { id: 'fantasy-scenes', label: 'fantasy scenes', category: 'Roleplay' },
  { id: 'feral', label: 'feral', category: 'Roleplay' },
  { id: 'gender-play', label: 'gender play', category: 'Roleplay' },
  { id: 'hypno', label: 'hypno', category: 'Roleplay' },
  { id: 'forced-bi', label: 'forced-bi', category: 'Roleplay' },
  { id: 'kitten-play', label: 'kitten play', category: 'Roleplay' },
  { id: 'pig-play', label: 'pig play', category: 'Roleplay' },
  { id: 'pony-play', label: 'pony play', category: 'Roleplay' },
  { id: 'primal', label: 'primal', category: 'Roleplay' },
  { id: 'prey-and-predator', label: 'prey and predator', category: 'Roleplay' },
  { id: 'professor-and-student', label: 'professor and student', category: 'Roleplay' },
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
  { id: 'anonymous', label: 'anonymous', category: 'Public & Watching' },
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
  { id: 'fire-play', label: 'fire play', category: 'Bondage & Sensation' },
  { id: 'ice', label: 'ice', category: 'Bondage & Sensation' },
  { id: 'light-bondage', label: 'light bondage', category: 'Bondage & Sensation' },
  { id: 'mummification', label: 'mummification', category: 'Bondage & Sensation' },
  { id: 'sensory-deprivation', label: 'sensory deprivation', category: 'Bondage & Sensation' },
  { id: 'temperature-play', label: 'temperature play', category: 'Bondage & Sensation' },
  { id: 'tickling', label: 'tickling', category: 'Bondage & Sensation' },
  { id: 'anal-beads', label: 'anal beads', category: 'Toys' },
  { id: 'butt-plugs', label: 'butt plugs', category: 'Toys' },
  { id: 'cock-rings', label: 'cock rings', category: 'Toys' },
  { id: 'dildos', label: 'dildos', category: 'Toys' },
  { id: 'fantasy-dildos', label: 'fantasy dildos', category: 'Toys' },
  { id: 'fuck-machine', label: 'fuck machine', category: 'Toys' },
  { id: 'harness-toys', label: 'harness toys', category: 'Toys' },
  { id: 'plugs-in-public', label: 'plugs in public', category: 'Toys' },
  { id: 'large-insertions', label: 'large insertions', category: 'Toys' },
  { id: 'prostate-toys', label: 'prostate toys', category: 'Toys' },
  { id: 'pumps', label: 'pumps', category: 'Toys' },
  { id: 'rose-toy', label: 'rose toy', category: 'Toys' },
  { id: 'strap-ons', label: 'strap-ons', category: 'Toys' },
  { id: 'vibrators', label: 'vibrators', category: 'Toys' },
  { id: 'cnc', label: 'CNC', category: 'Edge' },
  { id: 'cunt-busting', label: 'cunt busting', category: 'Edge' },
  { id: 'electro', label: 'electro', category: 'Edge' },
  { id: 'fear-play', label: 'fear play', category: 'Edge' },
  { id: 'knife-play', label: 'knife play', category: 'Edge' },
  { id: 'needles', label: 'needles', category: 'Edge' },
  { id: 'rope-suspension', label: 'rope suspension', category: 'Edge' },
  { id: 'small-penis-humiliation', label: 'small penis humiliation', category: 'Power' },
  { id: 'chastity-keyholding', label: 'chastity keyholding', category: 'Power' },
  { id: 'breeding', label: 'breeding', category: 'Body & Touch' },
  { id: 'erotic-literature', label: 'erotic literature', category: 'Other' },
  { id: 'food-play', label: 'food play', category: 'Other' },
  { id: 'hentai', label: 'hentai', category: 'Other' },
  { id: 'messy-play', label: 'messy play', category: 'Other' },
  { id: 'omorashi', label: 'omorashi', category: 'Other' },
  { id: 'pup-play', label: 'pup play', category: 'Roleplay' },
  { id: 'shibari', label: 'shibari', category: 'Bondage & Sensation' },
  { id: 'showers', label: 'showers', category: 'Other' },
  { id: 'sexting', label: 'sexting', category: 'Other' },
  { id: 'sounding', label: 'sounding', category: 'Edge' },
  { id: 'spit', label: 'spit', category: 'Body & Touch' },
  { id: 'streaming', label: 'streaming', category: 'Other' },
  { id: 'phone-sex', label: 'phone sex', category: 'Other' },
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

// Retired choices remain canonical so existing saved interests and badges keep their identity.
const SELECTABLE_KINK_CATALOG = KINK_CATALOG.filter((kink) => (
  kink.id !== 'fantasy-roleplay' && kink.id !== 'fantasy-scenes'
));

export const KINKS = SELECTABLE_KINK_CATALOG.map((kink) => kink.label);

export const KINK_GROUPS = [
  'Body & Touch',
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
  options: SELECTABLE_KINK_CATALOG
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
    options: alphabetize(['anime/manga', 'backgammon', 'board games', 'card games', 'checkers', 'chess', 'cosplay', 'streaming', 'tabletop games', 'video games']),
  },
  {
    label: 'Music & Nightlife',
    options: alphabetize(['dancing', 'djing', 'karaoke', 'music', 'singing']),
  },
  {
    label: 'Music',
    options: alphabetize(['bass', 'drums', 'guitar', 'keyboard', 'producing', 'songwriting']),
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

export type StructuredProfileOptionField = {
  label: string;
  options: string[];
};

export const STRUCTURED_PROFILE_OPTION_FIELDS: StructuredProfileOptionField[] = [
  { label: 'Pronouns', options: PRONOUNS },
  { label: 'Identity', options: IDENTITIES },
  { label: 'Presentation', options: PRESENTATIONS },
  { label: 'Sexuality', options: SEXUALITY },
  { label: 'Ethnicity', options: ETHNICITIES },
  { label: 'Body type', options: BODY_TYPES },
  { label: 'Position', options: POSITIONS },
  { label: 'Role', options: ROLES },
  { label: 'Availability', options: AVAILABILITY },
  { label: 'Hosting/Travel', options: HOSTING },
  { label: 'Preferred spots', options: PREFERRED_SPOTS },
  { label: 'Relationship status', options: RELATIONSHIP_STATUS },
  { label: 'Zodiac', options: ZODIAC },
  // Catalog choices do not change existing free-text tag reservations.
  { label: 'Kinks', options: KINK_CATALOG.filter((kink) => !['fisting', 'heavy-bondage', 'humping', 'spooning'].includes(kink.id)).map((kink) => kink.label) },
  { label: 'Vibes', options: VIBES },
  { label: 'Hobbies', options: HOBBIES },
  { label: 'Looking for', options: LOOKING_FOR },
  { label: 'Crowd Mode', options: CROWDS },
  { label: 'HIV status', options: HIV_STATUS },
  { label: 'Condoms', options: CONDOMS },
  { label: 'PrEP', options: PREP },
  { label: 'DoxyPEP', options: DOXYPEP },
  { label: 'COVID vaccine', options: COVID_VACCINE },
  { label: 'MPOX vaccine', options: MPOX_VACCINE },
  { label: 'Health preferences', options: HEALTH_PREFERENCES },
  { label: 'Birth control', options: BIRTH_CONTROL },
  { label: 'Substance boundaries', options: SUBSTANCE_BOUNDARIES },
  { label: 'Protection boundaries', options: PROTECTION_BOUNDARIES },
];

function singularizeProfileOptionToken(token: string) {
  if (token === 'men') return 'man';
  if (token === 'women') return 'woman';
  if (token === 'people') return 'person';
  if (/[^aeiou]ies$/.test(token)) return `${token.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes|ses)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function normalizeStructuredProfileOption(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeProfileOptionToken)
    .join(' ');
}

export const PROFILE_TAG_RESERVATIONS = STRUCTURED_PROFILE_OPTION_FIELDS.flatMap((field) => (
  field.options.map((option) => ({
    field: field.label,
    normalized: normalizeStructuredProfileOption(option),
  }))
)).filter((entry, index, entries) => (
  entry.normalized && entries.findIndex((candidate) => candidate.normalized === entry.normalized) === index
));

export function findStructuredProfileFieldForTag(value: string) {
  const normalized = normalizeStructuredProfileOption(value);
  return PROFILE_TAG_RESERVATIONS.find((entry) => entry.normalized === normalized)?.field ?? null;
}
