export const HEART_PIN_PATH =
  'M32 56C30.55 54.67 8 39.75 8 23.75C8 14.95 13.95 8 22 8C27.05 8 30.2 10.78 32 14.05C33.8 10.78 36.95 8 42 8C50.05 8 56 14.95 56 23.75C56 39.75 33.45 54.67 32 56Z';

export const HEART_PIN_PHOTO_PATH =
  'M32 52.16C30.78 51.04 11.84 38.51 11.84 25.07C11.84 17.68 16.84 11.84 23.6 11.84C27.84 11.84 30.49 14.18 32 16.92C33.51 14.18 36.16 11.84 40.4 11.84C47.16 11.84 52.16 17.68 52.16 25.07C52.16 38.51 33.22 51.04 32 52.16Z';

export const HEART_PIN_THEMES = {
  current: {
    border: '#0BA8FF',
    stops: ['#00B8FF', '#0A7DF4', '#3236D4'],
  },
  mutual: {
    border: '#6f00ff',
    stops: ['#A64DFF', '#6f00ff', '#3B00A8'],
  },
  nearby: {
    border: '#FF0072',
    stops: ['#FF0072', '#DA045D', '#B40849'],
  },
} as const;

export type HeartPinTheme = keyof typeof HEART_PIN_THEMES;
