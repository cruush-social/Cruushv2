import { requestApi } from './apiClient';
import {
  PHOTO_MAX_COMPRESSED_BYTES,
  PHOTO_UPLOAD_FORMAT_MESSAGE,
  PHOTO_UPLOAD_ACCEPT,
  PHOTO_UPLOAD_EXTENSION_TYPES,
  PHOTO_UPLOAD_TYPE_ALIASES,
  PHOTO_UPLOAD_TYPES,
} from './photoUploadFormats';

export const MESSAGE_PHOTO_MAX_UPLOAD_BYTES = PHOTO_MAX_COMPRESSED_BYTES;
export const MESSAGE_PHOTO_UPLOAD_ACCEPT = PHOTO_UPLOAD_ACCEPT;

// The server decodes every one of these and re-encodes to WebP, so a photo
// straight off a phone goes up as it is. It used to be transcoded in the
// browser first, which fails outright where the browser cannot decode HEIC.
const SERVER_SUPPORTED_MESSAGE_PHOTO_TYPES = new Set<string>(PHOTO_UPLOAD_TYPES);
const PREVIEWABLE_MESSAGE_PHOTO_TYPES = new Set<string>(PHOTO_UPLOAD_TYPES);
const MESSAGE_PHOTO_TYPE_ALIASES = PHOTO_UPLOAD_TYPE_ALIASES;
const MESSAGE_PHOTO_EXTENSION_TYPES = PHOTO_UPLOAD_EXTENSION_TYPES;
const JPEG_QUALITY_STEPS = [0.92, 0.90, 0.88];
const MAX_DIMENSION_STEPS = [2048];

function typeFromFileName(name: string) {
  const extensionMatch = /\.([^.]+)$/.exec(name.trim().toLowerCase());

  return extensionMatch ? MESSAGE_PHOTO_EXTENSION_TYPES.get(extensionMatch[1]) ?? '' : '';
}

function normalizeFileType(file: File) {
  const declaredType = file.type.trim().toLowerCase();

  if (MESSAGE_PHOTO_TYPE_ALIASES.has(declaredType)) {
    return MESSAGE_PHOTO_TYPE_ALIASES.get(declaredType) ?? '';
  }

  return declaredType === 'application/octet-stream' ? typeFromFileName(file.name) : declaredType || typeFromFileName(file.name);
}

function normalizeOriginalUploadFile(file: File, normalizedType: string) {
  const declaredType = file.type.trim().toLowerCase();

  if (declaredType === normalizedType) {
    return file;
  }

  return new File([file], file.name, {
    type: normalizedType,
    lastModified: file.lastModified,
  });
}

function shouldSendOriginalMessagePhoto(file: File) {
  return file.size < MESSAGE_PHOTO_MAX_UPLOAD_BYTES &&
    SERVER_SUPPORTED_MESSAGE_PHOTO_TYPES.has(normalizeFileType(file));
}

function normalizedJpegName(name: string) {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'message-photo';
  return `${stem.slice(0, 80)}.jpg`;
}

function readImageDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('This photo format could not be opened. Try JPEG, PNG, or WebP.'));
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result);
        return;
      }

      reject(new Error('This photo format could not be opened. Try JPEG, PNG, or WebP.'));
    };
    reader.readAsDataURL(file);
  });
}

function loadImageFromSource(sourceUrl: string, cleanup?: () => void) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      cleanup?.();
      resolve(image);
    };
    image.onerror = () => {
      cleanup?.();
      reject(new Error('This photo format could not be opened. Try JPEG, PNG, or WebP.'));
    };
    image.src = sourceUrl;
  });
}

async function loadImageFromFile(file: File) {
  const fileType = normalizeFileType(file);

  if (fileType && !PREVIEWABLE_MESSAGE_PHOTO_TYPES.has(fileType)) {
    throw new Error(PHOTO_UPLOAD_FORMAT_MESSAGE);
  }

  if (typeof Image === 'undefined') {
    throw new Error('This photo format is not supported on this device.');
  }

  if (typeof FileReader !== 'undefined') {
    return loadImageFromSource(await readImageDataUrl(file));
  }

  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('This photo format is not supported on this device.');
  }

  const objectUrl = URL.createObjectURL(file);

  return loadImageFromSource(objectUrl, () => URL.revokeObjectURL(objectUrl));
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not prepare this photo for upload.'));
        return;
      }

      resolve(blob);
    }, 'image/jpeg', quality);
  });
}

async function createJpegCandidate(image: HTMLImageElement, maxDimension: number, quality: number) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('This photo format could not be opened. Try JPEG, PNG, or WebP.');
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not prepare this photo for upload.');
  }

  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvasToJpegBlob(canvas, quality);
}

async function preparePhotoOnServer(file: File) {
  const body = new FormData();
  body.set('photo', normalizeOriginalUploadFile(file, normalizeFileType(file)));
  const prepared = await requestApi<{ url: string }>('/api/profile-photos/preview', { method: 'POST', body });
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(prepared.url);
  if (!match) throw new Error('Could not prepare this photo for upload.');
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  if (bytes.length >= MESSAGE_PHOTO_MAX_UPLOAD_BYTES) throw new Error('Could not compress this photo below 5 MB.');
  const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
  return new File([bytes], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, { type: match[1] });
}

export async function prepareMessagePhotoForUpload(file: File) {
  if (shouldSendOriginalMessagePhoto(file)) {
    return normalizeOriginalUploadFile(file, normalizeFileType(file));
  }

  if (['image/dng', 'image/gif', 'image/tiff', 'image/bmp'].includes(normalizeFileType(file))) {
    return preparePhotoOnServer(file);
  }
  let image: HTMLImageElement;
  try {
    image = await loadImageFromFile(file);
  } catch (error) {
    if (!SERVER_SUPPORTED_MESSAGE_PHOTO_TYPES.has(normalizeFileType(file))) throw error;
    return preparePhotoOnServer(file);
  }

  for (const maxDimension of MAX_DIMENSION_STEPS) {
    for (const quality of JPEG_QUALITY_STEPS) {
      const candidate = await createJpegCandidate(image, maxDimension, quality);

      if (candidate.size < MESSAGE_PHOTO_MAX_UPLOAD_BYTES) {
        return new File([candidate], normalizedJpegName(file.name), { type: 'image/jpeg' });
      }
    }
  }

  throw new Error('Message photos must be 5 MB or smaller.');
}
