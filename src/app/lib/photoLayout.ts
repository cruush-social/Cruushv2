export const PROFILE_CARD_MEDIA_ASPECT_RATIO = '9 / 16';
export const PROFILE_CARD_MEDIA_ASPECT_STYLE = {
  aspectRatio: PROFILE_CARD_MEDIA_ASPECT_RATIO,
} as const;

export const PROFILE_HERO_ASPECT_RATIO = '4 / 5';
export const PROFILE_HERO_ASPECT_STYLE = {
  aspectRatio: PROFILE_HERO_ASPECT_RATIO,
} as const;
export const PROFILE_HERO_MEDIA_HEIGHT = 'min(calc(100vw * 1.25), 64vh, 38rem)';
export const PROFILE_HERO_MEDIA_STYLE = {
  ...PROFILE_HERO_ASPECT_STYLE,
  height: PROFILE_HERO_MEDIA_HEIGHT,
} as const;
