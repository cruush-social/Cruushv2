/** Accepted static-photo formats; phone RAW is decoded on the server. */
export const PHOTO_MAX_COMPRESSED_BYTES = 5_000_000;

export const PHOTO_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/tiff',
  'image/dng',
  'image/gif',
  'image/bmp',
] as const;

/** Some pickers only match on extension, so name the common ones too. */
const PHOTO_UPLOAD_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.tif', '.tiff', '.dng', '.gif', '.bmp'];

export const PHOTO_UPLOAD_ACCEPT = [...PHOTO_UPLOAD_TYPES, ...PHOTO_UPLOAD_EXTENSIONS].join(',');

/** Labels a browser puts on bytes it will not name canonically. */
export const PHOTO_UPLOAD_TYPE_ALIASES = new Map<string, string>([
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['image/x-png', 'image/png'],
  ['image/apng', 'image/png'],
  ['image/heic-sequence', 'image/heic'],
  ['image/heif-sequence', 'image/heif'],
  ['image/avif-sequence', 'image/avif'],
  ['image/x-tiff', 'image/tiff'],
  ['image/tif', 'image/tiff'],
  ['image/x-adobe-dng', 'image/dng'],
  ['image/x-bmp', 'image/bmp'],
  ['image/x-ms-bmp', 'image/bmp'],
]);

export const PHOTO_UPLOAD_EXTENSION_TYPES = new Map<string, string>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['avif', 'image/avif'],
  ['tif', 'image/tiff'],
  ['tiff', 'image/tiff'],
  ['dng', 'image/dng'],
  ['gif', 'image/gif'],
  ['bmp', 'image/bmp'],
]);

export const PHOTO_UPLOAD_FORMAT_MESSAGE = 'JPEG, PNG, HEIC/HEIF, AVIF, WebP, TIFF, DNG, BMP or still GIF.';
