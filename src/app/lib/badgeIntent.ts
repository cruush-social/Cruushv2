/**
 * What a side badge says when someone reads it.
 *
 * The hanky code puts giving on the left and taking on the right, and plenty of
 * people ignore that, so the direction is something you say on purpose rather
 * than something the side decides for you. Say nothing and the badge is just
 * the thing itself.
 */

export type BadgeIntent = 'none' | 'give' | 'receive' | 'switch' | 'service' | 'stone';

export const BADGE_INTENTS: Array<{ id: BadgeIntent; label: string }> = [
  { id: 'none', label: 'Just the badge' },
  { id: 'give', label: 'Give' },
  { id: 'receive', label: 'Receive' },
  { id: 'switch', label: 'Switch' },
  { id: 'service', label: 'Service' },
  { id: 'stone', label: 'Stone' },
];

/** Always lower case, because it reads as a note rather than a heading. */
export function formatBadgeLabel(label: string, intent: BadgeIntent = 'none') {
  const name = label.trim().toLowerCase();

  return intent === 'none' ? name : `${intent}/${name}`;
}
