export const MESSAGE_PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MESSAGE_PHOTO_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

const SERVER_SUPPORTED_MESSAGE_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PREVIEWABLE_MESSAGE_PHOTO_TYPES = new Set([
  ...SERVER_SUPPORTED_MESSAGE_PHOTO_TYPES,
  'image/heic',
  'image/heif',
]);
const JPEG_QUALITY_STEPS = [0.88, 0.78, 0.68];
const MAX_DIMENSION_STEPS = [1600, 1280, 960];

function normalizeFileType(file: File) {
  return file.type.trim().toLowerCase();
}

function shouldSendOriginalMessagePhoto(file: File) {
  return file.size <= MESSAGE_PHOTO_MAX_UPLOAD_BYTES &&
    SERVER_SUPPORTED_MESSAGE_PHOTO_TYPES.has(normalizeFileType(file));
}

function normalizedJpegName(name: string) {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'message-photo';
  return `${stem.slice(0, 80)}.jpg`;
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const fileType = normalizeFileType(file);

    if (fileType && !PREVIEWABLE_MESSAGE_PHOTO_TYPES.has(fileType)) {
      reject(new Error('Choose a JPEG, PNG, WebP, HEIC, or HEIF photo.'));
      return;
    }

    if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
      reject(new Error('This photo format is not supported on this device.'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('This photo format could not be opened. Try JPEG, PNG, or WebP.'));
    };
    image.src = objectUrl;
  });
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

export async function prepareMessagePhotoForUpload(file: File) {
  if (shouldSendOriginalMessagePhoto(file)) {
    return file;
  }

  const image = await loadImageFromFile(file);

  for (const maxDimension of MAX_DIMENSION_STEPS) {
    for (const quality of JPEG_QUALITY_STEPS) {
      const candidate = await createJpegCandidate(image, maxDimension, quality);

      if (candidate.size <= MESSAGE_PHOTO_MAX_UPLOAD_BYTES) {
        return new File([candidate], normalizedJpegName(file.name), { type: 'image/jpeg' });
      }
    }
  }

  throw new Error('Message photos must be 5 MB or smaller.');
}
