/**
 * What a phone camera actually produces, in one place so the pickers cannot
 * drift apart from each other or from the server.
 *
 * HEIC is the iPhone default, including Portrait mode. AVIF turns up from
 * Android. TIFF comes out of the odd camera app. The server decodes all of them
 * and re-encodes to WebP for delivery, so the browser never has to transcode a
 * format it cannot even open.
 *
 * A photo is a still, so animated formats are out: GIF entirely, and an
 * animated WebP or APNG is rejected rather than frozen to its first frame.
 * SVG and camera raw are absent too: SVG carries script, and raw is not
 * something anyone shares from a phone.
 */
export const PHOTO_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/tiff',
] as const;

/** Some pickers only match on extension, so name the common ones too. */
const PHOTO_UPLOAD_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.tif', '.tiff'];

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
]);

export const PHOTO_UPLOAD_FORMAT_MESSAGE = 'Choose a still photo your phone or camera made: JPEG, PNG, HEIC, AVIF, WebP, or TIFF.';
