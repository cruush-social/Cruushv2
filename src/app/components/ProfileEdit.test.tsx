import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileEdit, { getPhotoUploadRejectedMessage } from './ProfileEdit';

const { getMyProfile, saveMyProfile, uploadProfilePhoto } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  saveMyProfile: vi.fn(),
  uploadProfilePhoto: vi.fn(),
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

describe('ProfileEdit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    localStorage.clear();
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
    saveMyProfile.mockResolvedValue(profile);
    uploadProfilePhoto.mockResolvedValue({
      url: '/media/profile-photos/d271f6da-c51d-4d73-a322-d9c56f45d4fa-7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2.png',
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

  it('crops, uploads, promotes, removes, and saves profile photos', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    const uploadedPhoto = '/media/profile-photos/d271f6da-c51d-4d73-a322-d9c56f45d4fa-7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2.png';

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      photos: ['https://example.com/old.jpg'],
      updated_at: '2026-04-29T12:00:00.000Z',
    });
    uploadProfilePhoto.mockResolvedValueOnce({
      url: uploadedPhoto,
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

    fireEvent.click(screen.getByRole('button', { name: 'Make photo 2 primary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      photos: [uploadedPhoto],
    })));
  });

  it('keeps an uploaded profile photo visible when switching edit tabs', async () => {
    const uploadedPhoto = '/media/profile-photos/d271f6da-c51d-4d73-a322-d9c56f45d4fa-7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2.png';
    uploadProfilePhoto.mockResolvedValueOnce({
      url: uploadedPhoto,
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

  it('hides profile photo upload when the profile already has 4 photos', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');
    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      photos: [
        'https://example.com/one.jpg',
        'https://example.com/two.jpg',
        'https://example.com/three.jpg',
        'https://example.com/four.jpg',
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
    expect(screen.getByText('Add up to 4 photos. Your first photo will be your profile picture.')).toBeInTheDocument();
  });

  it('explains profile photo requirements', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Photos' }));

    expect(screen.getByText(/Photos need to be of you only/i)).toBeInTheDocument();
    expect(screen.getByText(/No group photos, pets, memes, screenshots, or objects/i)).toBeInTheDocument();
    expect(screen.getByText(/you must be 18 or older/i)).toBeInTheDocument();
    expect(screen.getByText(/face is optional/i)).toBeInTheDocument();
    expect(screen.getByText(/naked or clothed/i)).toBeInTheDocument();
    expect(screen.getByText(/any clearly adult human body part/i)).toBeInTheDocument();
  });

  it('formats profile photo rejection reasons', () => {
    expect(getPhotoUploadRejectedMessage(new Error('Profile photo must be of you.'))).toBe(
      'Photo rejected: Profile photo must be of you.',
    );
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

  it('lets users set trans status visibility, crowds, gender identities, categorized vibes, and HIV status', async () => {
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
    fireEvent.click(within(scenesGroup).getByRole('option', { name: 'Bear' }));

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

    fireEvent.click(screen.getByRole('checkbox', { name: 'I am trans' }));

    fireEvent.click(screen.getByRole('button', { name: 'Trans status visibility' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mutual Crowds' }));

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
      identities: ['trans man', 'trans woman', 'nonbinary'],
      is_trans: true,
      trans_status_visibility: 'mutual_crowds',
      crowds: ['T4T', 'Dyke'],
      vibes: ['Bear', 'Daddy'],
      scenes: [],
      archetypes: [],
      hiv_status: ['undetectable'],
      hiv_status_visibility: 'mutual_cruushes',
    })));
  }, 10000);

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

    expect(menu.parentElement).toHaveClass('z-[100]');
    expect(menu.parentElement).toHaveStyle({ position: 'fixed' });

    fireEvent.click(screen.getByRole('option', { name: 'No alcohol involved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      substance_boundaries: ['No alcohol involved'],
    })));
  });
});
