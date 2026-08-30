/**
 * What cruush+ unlocks.
 *
 * Extracted from Rewards so the plans page and the rewards page describe cruush+
 * identically. Payment processors compare what a site advertises against what a
 * subscriber actually receives, so these two surfaces must never drift apart.
 */
export const CRUUSH_PLUS_FEATURES = [
  {
    title: 'Full activity',
    description: 'See your full incoming cruush and profile-view lists.',
  },
  {
    title: 'More Pings',
    description: 'Send up to 3 Pings every 24 hours, with 4 hours between sends.',
  },
  {
    title: 'Post nearby',
    description: 'Create posts on the local feed. Basic users can still read nearby posts.',
  },
  {
    title: 'Cruise carousel',
    description: 'Spin through nearby profiles and browse again.',
  },
  {
    title: 'All seeking and visibility controls',
    description: 'Use every seeking filter and visibility control together.',
  },
  {
    title: 'Stealth Mode',
    description: 'Browse the map without appearing on it.',
  },
] as const;
