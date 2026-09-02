export type UserBorderTone = 'current' | 'mutual' | 'nearby' | 'mile-high' | 'pulse';

export const USER_BORDER_COLORS: Record<UserBorderTone, string> = {
  current: '#004BFF',
  mutual: '#6F00FF',
  nearby: '#FF0072',
  'mile-high': '#77B9DA',
  pulse: '#C8FF31',
};

export function resolveUserBorderTone({
  activePing = false,
  current = false,
  mileHigh = false,
  mutual = false,
}: {
  activePing?: boolean;
  current?: boolean;
  mileHigh?: boolean;
  mutual?: boolean;
}): UserBorderTone {
  if (mileHigh) return 'mile-high';
  if (activePing) return 'pulse';
  if (current) return 'current';
  return mutual ? 'mutual' : 'nearby';
}
