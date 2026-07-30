const PROFILE_GRADIENTS = [
  ['#FF0072', '#6f00ff', '#1181ff'],
  ['#00B8FF', '#0A7DF4', '#3236D4'],
  ['#FF4FB3', '#FF0072', '#6f00ff'],
  ['#00D8FF', '#13C0B5', '#19A46A'],
  ['#FFD166', '#FF7A59', '#FF0072'],
  ['#B8FF5A', '#13C0B5', '#1181ff'],
  ['#F9F871', '#FFB000', '#DA045D'],
  ['#C084FC', '#6f00ff', '#3826ff'],
] as const;

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getProfileGradientStops(userId: string | null | undefined) {
  if (!userId) {
    return [...PROFILE_GRADIENTS[0]];
  }

  return [...PROFILE_GRADIENTS[hashString(userId) % PROFILE_GRADIENTS.length]];
}

export function getProfileGradientCss(userId: string | null | undefined) {
  const [from, middle, to] = getProfileGradientStops(userId);

  return `linear-gradient(135deg, ${from} 0%, ${middle} 52%, ${to} 100%)`;
}
