import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MESSAGE_PHOTO_MAX_UPLOAD_BYTES,
  MESSAGE_PHOTO_UPLOAD_ACCEPT,
  prepareMessagePhotoForUpload,
} from './messagePhotoProcessing';

describe('message photo preprocessing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps small backend-supported message photos unchanged', async () => {
    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });

    await expect(prepareMessagePhotoForUpload(file)).resolves.toBe(file);
  });

  it('accepts phone-native image types for browser conversion', () => {
    expect(MESSAGE_PHOTO_UPLOAD_ACCEPT).toContain('image/heic');
    expect(MESSAGE_PHOTO_UPLOAD_ACCEPT).toContain('image/heif');
  });

  it('converts oversized or phone-native photos to a JPEG upload candidate', async () => {
    const readAsDataURL = vi.fn(function readAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/heic;base64,cGhvbmU=',
      });
      queueMicrotask(() => this.onload?.(new ProgressEvent('load')));
    });
    vi.stubGlobal('FileReader', class {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      result: string | ArrayBuffer | null = null;
      readAsDataURL = readAsDataURL;
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:phone-photo'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 4032;
      naturalHeight = 3024;
      width = 4032;
      height = 3024;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '#000',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    });

    const file = new File(
      [new Uint8Array(MESSAGE_PHOTO_MAX_UPLOAD_BYTES + 1)],
      'camera.heic',
      { type: 'image/heic' },
    );
    const prepared = await prepareMessagePhotoForUpload(file);

    expect(prepared).not.toBe(file);
    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.name).toBe('camera.jpg');
    expect(readAsDataURL).toHaveBeenCalledWith(file);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('normalizes phone JPEG MIME aliases before upload', async () => {
    const file = new File(['image-bytes'], 'photo.JPG', { type: 'image/jpg' });
    const prepared = await prepareMessagePhotoForUpload(file);

    expect(prepared).not.toBe(file);
    expect(prepared.name).toBe('photo.JPG');
    expect(prepared.type).toBe('image/jpeg');
  });
});
