import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../lib/apiClient';
import ProfileEdit, { getPhotoUploadRejectedMessage } from './ProfileEdit';

const { getAppMeta, getMyProfile, saveMyProfile, uploadProfilePhoto } = vi.hoisted(() => ({
  getAppMeta: vi.fn(),
  getMyProfile: vi.fn(),
  saveMyProfile: vi.fn(),
  uploadProfilePhoto: vi.fn(),
}));

vi.mock('../lib/metaApi', () => ({
  getAppMeta,
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
    saveMyProfile,
    uploadProfilePhoto,
  };
});

const existingProfilePhoto = '/api/media/assets/11111111-1111-4111-8111-111111111111/display';
const uploadedProfilePhoto = '/api/media/assets/d271f6da-c51d-4d73-a322-d9c56f45d4fa/display';

describe('ProfileEdit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    localStorage.clear();
    getAppMeta.mockReset();
    getMyProfile.mockReset();
    saveMyProfile.mockReset();
    uploadProfilePhoto.mockReset();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:profile-crop-preview'),
      revokeObjectURL: vi.fn(),
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
    })) as unknown as HTMLCanvasElement['getContext'];
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
      callback(new Blob(['cropped-profile-photo'], { type: 'image/jpeg' }));
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 1200,
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 1500,
    });

    const { emptyProfilePayload } = await import('../lib/profileApi');
    const profile = {
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      position: [],
      role: [],
      is_trans: false,
      trans_status_visibility: 'public',
      crowds: [],
      kinks: ['leather'],
      kink_interests: [{
        kink_id: 'leather',
        label: 'leather',
        roles: ['give'],
        is_seeking: true,
        visibility: 'public',
      }],
      kinks_visibility: 'public',
      scenes: [],
      archetypes: [],
      hiv_status: [],
      hiv_status_visibility: 'public',
      updated_at: '2026-04-29T12:00:00.000Z',
    };

    getMyProfile.mockResolvedValue(profile);
    getAppMeta.mockResolvedValue({
      service: 'cruush-server',
      auth: 'session-cookie',
      storage: 'postgres',
      migratedFromSupabase: true,
      alphaTest: {
        enabled: false,
        active: false,
        endsAt: null,
        ended: false,
      },
      photoUploads: {
        profilePhotos: true,
        messagePhotos: true,
      },
    });
    saveMyProfile.mockResolvedValue(profile);
    uploadProfilePhoto.mockResolvedValue({
      url: uploadedProfilePhoto,
      explicit: false,
    });
  });

  it('lets users set master position, master role, and field-level kink visibility', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const intimacyTab = await screen.findByRole('tab', { name: 'Intimacy' });
    fireEvent.pointerDown(intimacyTab, { button: 0, ctrlKey: false });
    fireEvent.click(intimacyTab);

    await waitFor(() => expect(intimacyTab).toHaveAttribute('aria-selected', 'true'));

    expect(await screen.findAllByText('leather')).not.toHaveLength(0);
    expect(screen.queryByLabelText('leather seeking')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('leather receive')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Position' }));
    await waitFor(() => expect(screen.getByRole('listbox', { name: 'Position' }).parentElement).toHaveClass('top-full', 'mt-2'));
    expect(screen.getByRole('option', { name: 'pillow princess' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'stone top' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'vers bottom' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'vers top' }));

    fireEvent.click(screen.getByRole('button', { name: 'Role' }));
    fireEvent.click(screen.getByRole('option', { name: 'service' }));

    fireEvent.click(screen.getByRole('button', { name: 'Kinks & Fetishes' }));
    expect(screen.getByRole('tablist', { name: 'Kinks & Fetishes categories' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Body & Touch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Gear' }));
    const gearGroup = screen.getByRole('group', { name: 'Gear' });
    expect(within(gearGroup).getByRole('option', { name: 'leather' })).toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: 'Kinks & Fetishes visibility' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kinks & Fetishes visibility' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mutual Crowds' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      position: ['vers top'],
      role: ['service'],
      kinks_visibility: 'mutual_crowds',
      kink_interests: [expect.objectContaining({
        kink_id: 'leather',
      })],
    })));
    const savedPayload = saveMyProfile.mock.calls[0]?.[0];
    expect(savedPayload).not.toHaveProperty('id');
    expect(savedPayload).not.toHaveProperty('updated_at');
    expect(savedPayload.kink_interests[0]).not.toHaveProperty('roles');
    expect(savedPayload.kink_interests[0]).not.toHaveProperty('is_seeking');
    expect(savedPayload.kink_interests[0]).not.toHaveProperty('visibility');
  }, 10000);

  it('keeps edited profile fields when moderation rejects the save', async () => {
    saveMyProfile.mockRejectedValueOnce(new Error(
      'Nothing was saved because we could not check this text for harmful content.'
    ));

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const displayName = await screen.findByPlaceholderText('Your display name');
    fireEvent.change(displayName, { target: { value: 'Still here' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Nothing was saved because we could not check this text for harmful content.')).toBeInTheDocument();
    expect(displayName).toHaveValue('Still here');
  });

  it('crops, uploads, promotes, removes, and persists profile photos immediately', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    const uploadedPhoto = uploadedProfilePhoto;

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      photos: [existingProfilePhoto],
      updated_at: '2026-04-29T12:00:00.000Z',
    });
    uploadProfilePhoto.mockResolvedValueOnce({
      url: uploadedPhoto,
      explicit: false,
    });
    saveMyProfile.mockImplementation(async (payload) => ({
      ...emptyProfilePayload,
      ...payload,
      id: 'user-1',
      updated_at: '2026-04-29T12:00:00.000Z',
    }));

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const photosTab = await screen.findByRole('tab', { name: 'Photos' });
    fireEvent.click(photosTab);

    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    expect(uploadInput).toBeTruthy();

    fireEvent.change(uploadInput as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' })],
      },
    });

    expect(await screen.findByRole('dialog', { name: 'Crop profile photo' })).toBeInTheDocument();
    fireEvent.load(screen.getByAltText('Profile crop preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    fireEvent.change(screen.getByLabelText('Zoom profile photo'), {
      target: {
        value: '1.4',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use cropped photo' }));

    await waitFor(() => expect(uploadProfilePhoto).toHaveBeenCalledTimes(1));
    const uploadedFile = uploadProfilePhoto.mock.calls[0]?.[0] as File;
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile.name).toBe('profile-crop.jpg');
    expect(uploadedFile.type).toBe('image/jpeg');

    fireEvent.click(await screen.findByRole('button', { name: 'Make photo 2 primary' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      photos: [uploadedPhoto, existingProfilePhoto],
    })));

    fireEvent.click(await screen.findByRole('button', { name: 'Remove photo 2' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      photos: [uploadedPhoto],
    })));
  });

  it('omits stale loaded photo URLs while saving profile edits', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    const canonicalAssetPhoto = '/api/media/assets/22222222-2222-4222-8222-222222222222/display';
    const legacyProfilePhoto = '/api/media/profile-photos/11111111-1111-4111-8111-111111111111-22222222-2222-4222-8222-222222222222.png';

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      photos: [
        `https://cruush.app${canonicalAssetPhoto}`,
        'https://example.com/old.jpg',
        'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
        legacyProfilePhoto.replace('/api', ''),
      ],
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      photos: [
        canonicalAssetPhoto,
        legacyProfilePhoto,
      ],
    })));
  });

  it('keeps an uploaded profile photo visible when switching edit tabs', async () => {
    const uploadedPhoto = uploadedProfilePhoto;
    uploadProfilePhoto.mockResolvedValueOnce({
      url: uploadedPhoto,
      explicit: false,
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const photosTab = await screen.findByRole('tab', { name: 'Photos' });
    fireEvent.click(photosTab);

    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    expect(uploadInput).toBeTruthy();

    fireEvent.change(uploadInput as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' })],
      },
    });
    fireEvent.load(await screen.findByAltText('Profile crop preview'));
    fireEvent.click(await screen.findByRole('button', { name: 'Use cropped photo' }));

    const uploadedImage = await screen.findByAltText('Primary profile photo');
    expect(uploadedImage).toHaveAttribute('src', expect.stringContaining(uploadedPhoto));

    const profileTab = screen.getByRole('tab', { name: 'Profile' });
    fireEvent.click(profileTab);
    expect(profileTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(photosTab);
    expect(screen.getByAltText('Primary profile photo')).toHaveAttribute('src', expect.stringContaining(uploadedPhoto));
  });

  it('publishes the server-authoritative uploaded photos when the follow-up profile read fails', async () => {
    const onSaved = vi.fn();
    const { emptyProfilePayload } = await import('../lib/profileApi');
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'user-1', display_name: 'Jordan' }));
    uploadProfilePhoto.mockResolvedValueOnce({
      url: uploadedProfilePhoto,
      explicit: false,
      photos: [existingProfilePhoto, uploadedProfilePhoto],
    });
    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      photos: [existingProfilePhoto],
    }).mockRejectedValueOnce(new Error('Profile refresh failed.'));

    render(
      <MemoryRouter>
        <ProfileEdit onSaved={onSaved} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));
    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    fireEvent.change(uploadInput as HTMLInputElement, {
      target: { files: [new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' })] },
    });
    fireEvent.load(await screen.findByAltText('Profile crop preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Use cropped photo' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      photos: [existingProfilePhoto, uploadedProfilePhoto],
    })));
  });

  it('masks explicit profile photos while treating unknown photos as safe in DL Mode', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    const explicitPhoto = '/api/media/assets/11111111-1111-4111-8111-111111111111/display';
    const safePhoto = '/api/media/assets/22222222-2222-4222-8222-222222222222/display';
    const unknownPhoto = '/api/media/assets/33333333-3333-4333-8333-333333333333/display';

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      photos: [explicitPhoto, safePhoto, unknownPhoto],
      photo_metadata: [
        { url: explicitPhoto, explicit: true },
        { url: safePhoto, explicit: false },
      ],
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));
    expect(await screen.findByAltText('Profile photo 2')).toHaveAttribute('src', expect.stringContaining(safePhoto));
    expect(screen.queryByAltText('Primary profile photo')).not.toBeInTheDocument();
    expect(screen.getByAltText('Profile photo 3')).toHaveAttribute('src', expect.stringContaining(unknownPhoto));
    expect(screen.getByRole('img', { name: 'Primary profile photo hidden by DL Mode' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Profile photo 3 hidden by DL Mode' })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(explicitPhoto);
  });

  it('closes the crop dialog and immediately reveals the upload rejection reason', async () => {
    uploadProfilePhoto.mockRejectedValueOnce(
      new ApiClientError(400, 'CONTENT_REJECTED', 'Profile photo must be of you.'),
    );

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    expect(uploadInput).toBeTruthy();

    fireEvent.change(uploadInput as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' })],
      },
    });

    const preview = await screen.findByAltText('Profile crop preview');
    fireEvent.load(preview);
    fireEvent.click(screen.getByRole('button', { name: 'Use cropped photo' }));

    await waitFor(() => expect(uploadProfilePhoto).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Crop profile photo' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Photo rejected: Profile photo must be of you.')).toBeVisible();
  });

  it('shows moderation outages without labeling them as photo rejections', async () => {
    uploadProfilePhoto.mockRejectedValueOnce(
      new ApiClientError(503, 'MODERATION_UNAVAILABLE', 'Automated photo safety checks are temporarily unavailable. Try again later.'),
    );

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    expect(uploadInput).toBeTruthy();

    fireEvent.change(uploadInput as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' })],
      },
    });

    const preview = await screen.findByAltText('Profile crop preview');
    fireEvent.load(preview);
    fireEvent.click(screen.getByRole('button', { name: 'Use cropped photo' }));

    await waitFor(() => expect(uploadProfilePhoto).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Crop profile photo' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Automated photo safety checks are temporarily unavailable. Try again later.')).toBeVisible();
    expect(screen.queryByText(/^Photo rejected:/)).not.toBeInTheDocument();
  });

  it('previews selected profile photos as data URLs before cropping', async () => {
    const previewDataUrl = 'data:image/png;base64,cHJvZmlsZQ==';
    const readAsDataURL = vi.fn();

    class MockFileReader {
      result: FileReader['result'] = null;
      onload: FileReader['onload'] = null;
      onerror: FileReader['onerror'] = null;

      readAsDataURL(file: Blob) {
        readAsDataURL(file);
        this.result = previewDataUrl;
        this.onload?.call(this as unknown as FileReader, new ProgressEvent('load') as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    expect(uploadInput).toBeTruthy();

    const selectedFile = new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' });
    fireEvent.change(uploadInput as HTMLInputElement, {
      target: {
        files: [selectedFile],
      },
    });

    const preview = await screen.findByAltText('Profile crop preview');
    expect(readAsDataURL).toHaveBeenCalledWith(selectedFile);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(preview).toHaveAttribute('src', previewDataUrl);

    fireEvent.load(preview);
    fireEvent.click(screen.getByRole('button', { name: 'Use cropped photo' }));

    await waitFor(() => expect(uploadProfilePhoto).toHaveBeenCalledTimes(1));
  });

  it('enables cropping when the preview image is already decoded', async () => {
    const completeSpy = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);

    try {
      render(
        <MemoryRouter>
          <ProfileEdit />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

      const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
      expect(uploadInput).toBeTruthy();

      fireEvent.change(uploadInput as HTMLInputElement, {
        target: {
          files: [new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' })],
        },
      });

      expect(await screen.findByRole('button', { name: 'Use cropped photo' })).toBeEnabled();
    } finally {
      completeSpy.mockRestore();
    }
  });

  it('hides profile photo upload when the profile already has 4 photos', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      photos: [
        '/api/media/assets/11111111-1111-4111-8111-111111111111/display',
        '/api/media/assets/22222222-2222-4222-8222-222222222222/display',
        '/api/media/assets/33333333-3333-4333-8333-333333333333/display',
        '/api/media/assets/44444444-4444-4444-8444-444444444444/display',
      ],
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    expect(screen.queryByText('Upload photo')).not.toBeInTheDocument();
    expect(screen.getByText('Add up to 4 photos of yourself. Your first photo will be your profile picture. SFW photos are suggested, not required.')).toBeInTheDocument();
  });

  it('disables profile photo upload when the API marks uploads unavailable', async () => {
    getAppMeta.mockResolvedValueOnce({
      service: 'cruush-server',
      auth: 'session-cookie',
      storage: 'postgres',
      migratedFromSupabase: true,
      alphaTest: {
        enabled: true,
        active: true,
        endsAt: '2099-07-28T23:59:00.000Z',
        ended: false,
      },
      photoUploads: {
        profilePhotos: false,
        messagePhotos: false,
      },
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    expect(await screen.findByText('Profile photo uploads are temporarily unavailable.')).toBeInTheDocument();
    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    expect(uploadInput).toBeDisabled();
  });

  it('states the profile photo ownership requirement and DL Mode suggestion without extra guidance', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    expect(screen.getByText('profile photos may be SFW or NSFW, but they must only be of you. add at least one SFW photo if you want people browsing in DL Mode to still see you.')).toBeInTheDocument();
    expect(screen.queryByText(/you must be 18 or older/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/face is optional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/naked or clothed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No group photos, pets, memes, screenshots, or objects/i)).not.toBeInTheDocument();
  });

  it('formats profile photo rejection reasons', () => {
    expect(getPhotoUploadRejectedMessage(new ApiClientError(400, 'CONTENT_REJECTED', 'Profile photo must be of you.'))).toBe(
      'Photo rejected: Profile photo must be of you.',
    );
  });

  it('leaves non-rejection profile photo errors unprefixed', () => {
    expect(
      getPhotoUploadRejectedMessage(
        new ApiClientError(503, 'MODERATION_UNAVAILABLE', 'Automated photo safety checks are temporarily unavailable. Try again later.'),
      ),
    ).toBe('Automated photo safety checks are temporarily unavailable. Try again later.');
  });

  it('does not try to crop a broken profile photo preview', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    const uploadInput = screen.getByText('Upload photo').closest('label')?.querySelector('input[type="file"]');
    expect(uploadInput).toBeTruthy();

    fireEvent.change(uploadInput as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' })],
      },
    });

    const preview = await screen.findByAltText('Profile crop preview');
    fireEvent.error(preview);

    expect(await screen.findByText('This image could not be loaded. Try a JPG, PNG, or WebP file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use cropped photo' })).toBeDisabled();
    expect(uploadProfilePhoto).not.toHaveBeenCalled();
  });

  it('lets users set trans status visibility, crowds, gender identities, categorized vibes, body type, and HIV status', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const profileTab = await screen.findByRole('tab', { name: 'Profile' });
    fireEvent.click(profileTab);

    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
    expect(screen.getByRole('tablist', { name: 'Vibes categories' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Style & Energy' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Scenes' }));
    const scenesGroup = screen.getByRole('group', { name: 'Scenes' });
    expect(within(scenesGroup).queryByRole('option', { name: 'Bear' })).not.toBeInTheDocument();
    for (const scene of ['Jock', 'Circuit', 'Club Kid', 'Camping', 'Cosplay', 'Country', 'Festival', 'Rubber', 'Leather', 'Burner', 'Sports', 'Sober', 'Stoner']) {
      expect(within(scenesGroup).getByRole('option', { name: scene })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Style & Energy' }));
    const styleGroup = screen.getByRole('group', { name: 'Style & Energy' });
    expect(within(styleGroup).queryByRole('option', { name: 'Sober' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Archetypes' }));
    const archetypesGroup = screen.getByRole('group', { name: 'Archetypes' });

    fireEvent.click(within(archetypesGroup).getByRole('option', { name: 'Daddy' }));

    const basicsTab = screen.getByRole('tab', { name: 'Basics' });
    fireEvent.click(basicsTab);

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identities' }));
    expect(screen.getByRole('option', { name: 'trans man' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'trans woman' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'trans man' }));
    fireEvent.click(screen.getByRole('option', { name: 'trans woman' }));
    fireEvent.click(screen.getByRole('option', { name: 'nonbinary' }));
    fireEvent.click(screen.getByRole('option', { name: 'woman' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gender Identities' }));

    fireEvent.click(screen.getByRole('button', { name: 'Body Type' }));
    fireEvent.click(screen.getByRole('option', { name: 'bear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Body Type' }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'I am trans' }));
    expect(screen.queryByRole('button', { name: 'Trans status visibility' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crowds' }));
    fireEvent.click(screen.getByRole('option', { name: 'T4T' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dyke' }));

    const healthTab = screen.getByRole('tab', { name: 'Health' });
    fireEvent.click(healthTab);

    fireEvent.click(screen.getByRole('button', { name: 'HIV Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'undetectable' }));

    expect(screen.queryByRole('button', { name: 'HIV status visibility' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      identities: ['trans woman', 'nonbinary', 'woman'],
      is_trans: true,
      trans_status_visibility: 'mutual_cruushes',
      crowds: ['T4T', 'Dyke'],
      body_type: ['bear'],
      vibes: ['Daddy'],
      scenes: [],
      archetypes: [],
      hiv_status: ['undetectable'],
      hiv_status_visibility: 'mutual_cruushes',
    })));
  }, 10000);

  it('saves only one selected value for each health status field', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const healthTab = await screen.findByRole('tab', { name: 'Health' });
    fireEvent.click(healthTab);

    fireEvent.click(screen.getByRole('button', { name: 'HIV Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'negative' }));
    fireEvent.click(screen.getByRole('button', { name: 'HIV Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'positive' }));

    fireEvent.click(screen.getByRole('button', { name: 'COVID Vaccine' }));
    fireEvent.click(screen.getByRole('option', { name: 'yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'COVID Vaccine' }));
    fireEvent.click(screen.getByRole('option', { name: 'no' }));

    fireEvent.click(screen.getByRole('button', { name: 'MPOX Vaccine' }));
    fireEvent.click(screen.getByRole('option', { name: 'yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'MPOX Vaccine' }));
    fireEvent.click(screen.getByRole('option', { name: 'partial' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      hiv_status: ['positive'],
      covid_vaccine: ['no'],
      mpox_vaccine: ['partial'],
    })));
  });

  it('drops stale T4T crowd membership and normalizes legacy Sapphic when trans status is not selected', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      is_trans: false,
      crowds: ['T4T', 'Sapphic'],
      visibility_rules: {
        ...emptyProfilePayload.visibility_rules,
        active_crowd_modes: ['T4T', 'Sapphic'],
        looking_for: ['hookup'],
      },
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      is_trans: false,
      crowds: ['Dyke'],
      visibility_rules: expect.objectContaining({
        active_crowd_modes: ['Dyke'],
        looking_for: ['hookup'],
      }),
    })));
  });

  it('preserves existing visibility rules while saving profile edits', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      is_trans: true,
      crowds: ['T4T', 'Dyke'],
      visibility_rules: {
        ...emptyProfilePayload.visibility_rules,
        active_crowd_modes: ['T4T'],
        distance: 10,
        looking_for: ['hookup'],
        kinks: ['leather'],
      },
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      visibility_rules: expect.objectContaining({
        active_crowd_modes: ['T4T'],
        distance: 10,
        looking_for: ['hookup'],
        kinks: ['leather'],
      }),
    })));
  });

  it('uses the stored session display name when saving a fresh empty profile', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');

    localStorage.setItem('cruush_user', JSON.stringify({
      display_name: 'River Local',
    }));
    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: '',
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      display_name: 'River Local',
    })));
  });

  it('publishes a saved display name to the current session state immediately', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    const onSaved = vi.fn();

    saveMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'River Updated',
      year_of_birth: 1998,
      updated_at: '2026-08-13T00:30:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit onSaved={onSaved} />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByPlaceholderText('Your display name'), {
      target: { value: 'River Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-1',
      display_name: 'River Updated',
    })));
    expect(JSON.parse(localStorage.getItem('cruush_user') ?? '{}')).toMatchObject({
      id: 'user-1',
      name: 'River Updated',
      display_name: 'River Updated',
    });
  });

  it('supports embedded profile editing without routing away', async () => {
    const onCancel = vi.fn();
    const onSaved = vi.fn();

    render(
      <MemoryRouter>
        <ProfileEdit embedded onCancel={onCancel} onSaved={onSaved} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to profile preview' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-1',
      display_name: 'Jordan',
    }));
  });

  it('lets desktop embedded users edit substance boundaries', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit embedded />
      </MemoryRouter>
    );

    const healthTab = await screen.findByRole('tab', { name: 'Health' });
    fireEvent.click(healthTab);

    fireEvent.click(screen.getByRole('button', { name: 'Substance Boundaries' }));
    const menu = screen.getByRole('listbox', { name: 'Substance Boundaries' });

    expect(menu.parentElement).toHaveStyle({
      position: 'fixed',
      zIndex: '121',
    });

    fireEvent.click(screen.getByRole('option', { name: 'No alcohol involved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      substance_boundaries: ['No alcohol involved'],
    })));
  });
});
