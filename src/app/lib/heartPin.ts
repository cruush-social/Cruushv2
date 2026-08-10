export const HEART_PIN_PATH =
  'M32 56C30.55 54.67 8 39.75 8 23.75C8 14.95 13.95 8 22 8C27.05 8 30.2 10.78 32 14.05C33.8 10.78 36.95 8 42 8C50.05 8 56 14.95 56 23.75C56 39.75 33.45 54.67 32 56Z';

export const HEART_PIN_THEMES = {
  current: {
    border: '#004BFF',
    stops: ['#3826FF', '#004BFF', '#1181FF'],
  },
  mutual: {
    border: '#6f00ff',
    stops: ['#A64DFF', '#6f00ff', '#3B00A8'],
  },
  ghost: {
    border: '#0BA8FF',
    stops: ['#0BA8FF', '#0BA8FF', '#0BA8FF'],
  },
  nearby: {
    border: '#FF0072',
    stops: ['#FF0072', '#DA045D', '#B40849'],
  },
} as const;

export type HeartPinTheme = keyof typeof HEART_PIN_THEMES;
