import type { ChangeEvent, PointerEvent } from 'react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, RotateCcw, RotateCw, Star, Trash2, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import MultiSelect from './MultiSelect';
import {
  emptyProfilePayload,
  getMyProfile,
  ProfileApiError,
  saveMyProfile,
  toDefaultKinkInterest,
  toKinkId,
  uploadProfilePhoto,
  type ProfileVisibility,
  type ProfilePayload,
  type ProfileVisibilityRules,
} from '../lib/profileApi';
import { resolveMediaUrl } from '../lib/apiClient';
import { getStoredCurrentUser, persistCurrentUser } from '../lib/sessionUser';
import {
  AVAILABILITY,
  BODY_TYPES,
  CONDOMS,
  COVID_VACCINE,
  CROWDS,
  DOXYPEP,
  ETHNICITIES,
  HIV_STATUS,
  HOBBIES,
  HOSTING,
  IDENTITIES,
  KINK_GROUPS,
  LOOKING_FOR,
  MPOX_VACCINE,
  normalizeCrowdValues,
  POSITIONS,
  PREP,
  PRESENTATIONS,
  PROFILE_VISIBILITY_OPTIONS,
  PRONOUNS,
  ROLES,
  SEXUALITY,
  SUBSTANCE_BOUNDARIES,
  VIBE_GROUPS,
} from '../lib/profileOptions';

const MAX_PROFILE_PHOTOS = 4;
const MAX_GENDER_IDENTITIES = 3;
const PROFILE_PHOTO_LOAD_ERROR = 'This image could not be loaded. Try a JPG, PNG, or WebP file.';

const VISIBILITY_OPTION_LABELS = PROFILE_VISIBILITY_OPTIONS.map((option) => option.label);
const FIXED_PRIVATE_PROFILE_VISIBILITY: ProfileVisibility = 'mutual_cruushes';

type PendingProfilePhoto = {
  url: string;
  objectUrl?: string;
};

function getVisibilityLabel(value: ProfileVisibility): string {
  return PROFILE_VISIBILITY_OPTIONS.find((option) => option.value === value)?.label ?? 'Public';
}

function getVisibilityValue(label: string | undefined): ProfileVisibility {
  return (PROFILE_VISIBILITY_OPTIONS.find((option) => option.label === label)?.value ?? 'public') as ProfileVisibility;
}

function getSaveDisplayName(profile: ProfilePayload) {
  const profileDisplayName = (profile.display_name ?? '').trim();

  if (profileDisplayName.length >= 2) {
    return profileDisplayName;
  }

  const storedUser = getStoredCurrentUser();

  return (storedUser?.display_name ?? storedUser?.name ?? 'cruush user').trim();
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function limitGenderIdentities(values: string[]) {
  return uniqueValues(values).slice(0, MAX_GENDER_IDENTITIES);
}

function canvasToJpegFile(canvas: HTMLCanvasElement) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not crop profile photo.'));
        return;
      }

      resolve(new File([blob], 'profile-crop.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

function readProfilePhotoPreviewUrl(file: File): Promise<PendingProfilePhoto> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      const objectUrl = URL.createObjectURL(file);
      resolve({
        url: objectUrl,
        objectUrl,
      });
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error(PROFILE_PHOTO_LOAD_ERROR));
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve({
          url: reader.result,
        });
        return;
      }

      reject(new Error(PROFILE_PHOTO_LOAD_ERROR));
    };
    reader.readAsDataURL(file);
  });
}

export function getPhotoUploadRejectedMessage(uploadError: unknown) {
  const reason = uploadError instanceof Error ? uploadError.message : 'Failed to upload profile photo.';

  return `Photo rejected: ${reason}`;
}

function ProfilePhotoCropper({
  onCancel,
  onConfirm,
  processing,
  sourceUrl,
}: {
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
  processing: boolean;
  sourceUrl: string;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cropError, setCropError] = useState<string | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    setCropError(null);

    if (!image?.complete) {
      setImageStatus('loading');
      return;
    }

    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setImageStatus('ready');
      return;
    }

    setImageStatus('error');
    setCropError(PROFILE_PHOTO_LOAD_ERROR);
  }, [sourceUrl]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setOffset((current) => ({
      x: Math.max(-180, Math.min(180, current.x + deltaX)),
      y: Math.max(-225, Math.min(225, current.y + deltaY)),
    }));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleConfirm = async () => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    setCropError(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1500;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Could not crop profile photo.');
      }

      if (imageStatus !== 'ready' || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        throw new Error(PROFILE_PHOTO_LOAD_ERROR);
      }

      const imageWidth = image.naturalWidth || image.width || canvas.width;
      const imageHeight = image.naturalHeight || image.height || canvas.height;
      const baseScale = Math.max(canvas.width / imageWidth, canvas.height / imageHeight);
      const drawScale = baseScale * zoom;
      const drawWidth = imageWidth * drawScale;
      const drawHeight = imageHeight * drawScale;

      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(canvas.width / 2 + offset.x * 2, canvas.height / 2 + offset.y * 2);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();

      await onConfirm(await canvasToJpegFile(canvas));
    } catch (error) {
      setCropError(error instanceof Error ? error.message : 'Could not crop profile photo.');
    }
  };

  return (
    <div
      aria-label="Crop profile photo"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/78 p-4 backdrop-blur-md"
      role="dialog"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/12 bg-background text-foreground shadow-[0_28px_90px_rgba(0,0,0,0.52)]">
        <div
          className="relative mx-auto aspect-[4/5] w-full max-w-sm touch-none overflow-hidden bg-black"
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
        >
          <img
            ref={imageRef}
            alt="Profile crop preview"
            className="h-full w-full select-none object-cover"
            draggable={false}
            onError={() => {
              setImageStatus('error');
              setCropError(PROFILE_PHOTO_LOAD_ERROR);
            }}
            onLoad={(event) => {
              const loadedImage = event.currentTarget;
              if (loadedImage.naturalWidth > 0 && loadedImage.naturalHeight > 0) {
                setImageStatus('ready');
                setCropError(null);
              } else {
                setImageStatus('error');
                setCropError(PROFILE_PHOTO_LOAD_ERROR);
              }
            }}
            src={sourceUrl}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
            }}
          />
        </div>

        <div className="space-y-4 p-4">
          {cropError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {cropError}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="profile-photo-zoom">Zoom</Label>
            <input
              aria-label="Zoom profile photo"
              className="w-full accent-primary"
              id="profile-photo-zoom"
              max="2.5"
              min="1"
              onChange={(event) => setZoom(Number(event.target.value))}
              step="0.05"
              type="range"
              value={zoom}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button aria-label="Rotate left" onClick={() => setRotation((value) => value - 90)} type="button" variant="outline">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button aria-label="Rotate right" onClick={() => setRotation((value) => value + 90)} type="button" variant="outline">
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button onClick={onCancel} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={processing || imageStatus !== 'ready'} onClick={handleConfirm} type="button">
                {processing ? 'Uploading...' : 'Use cropped photo'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function mergeCategorizedVibes(profile: ProfilePayload) {
  return uniqueValues([
    ...(profile.vibes ?? []),
    ...(profile.scenes ?? []),
    ...(profile.archetypes ?? []),
  ]);
}

function sanitizeCrowds(profile: ProfilePayload) {
  const allowedCrowds = new Set(profile.is_trans === true ? CROWDS : CROWDS.filter((crowd) => crowd !== 'T4T'));

  return normalizeCrowdValues(profile.crowds ?? []).filter((crowd) => allowedCrowds.has(crowd));
}

function sanitizeKinkInterests(profile: ProfilePayload): ProfilePayload['kink_interests'] {
  const sourceInterests = (profile.kink_interests ?? []).length > 0
    ? profile.kink_interests ?? []
    : (profile.kinks ?? []).map(toDefaultKinkInterest);
  const seen = new Set<string>();

  return sourceInterests
    .map((interest) => {
      const kinkId = toKinkId(interest.kink_id || interest.label || '');

      if (!kinkId || seen.has(kinkId)) {
        return null;
      }

      seen.add(kinkId);

      return {
        kink_id: kinkId,
        label: interest.label?.trim() || interest.kink_id,
        category: interest.category?.trim() || undefined,
      };
    })
    .filter((interest): interest is ProfilePayload['kink_interests'][number] => Boolean(interest));
}

function sanitizeVisibilityRules(profile: ProfilePayload): ProfileVisibilityRules {
  const rules = profile.visibility_rules ?? emptyProfilePayload.visibility_rules;
  const allowedActiveCrowds = new Set(sanitizeCrowds(profile));

  return {
    ...emptyProfilePayload.visibility_rules,
    ...rules,
    active_crowd_modes: normalizeCrowdValues(rules.active_crowd_modes ?? []).filter((crowd) => allowedActiveCrowds.has(crowd)),
    identities: uniqueValues(rules.identities ?? []),
    presentations: uniqueValues(rules.presentations ?? []),
    looking_for: uniqueValues(rules.looking_for ?? []),
    timing: uniqueValues(rules.timing ?? []),
    hosting: uniqueValues(rules.hosting ?? []),
    vibes: uniqueValues(rules.vibes ?? []),
    crowds: normalizeCrowdValues(rules.crowds ?? []),
    hobbies: uniqueValues(rules.hobbies ?? []),
    positions: uniqueValues(rules.positions ?? []),
    roles: uniqueValues(rules.roles ?? []),
    kinks: uniqueValues(rules.kinks ?? []),
    body_types: uniqueValues(rules.body_types ?? []),
    sexuality: uniqueValues(rules.sexuality ?? []),
    substance_boundaries: uniqueValues(rules.substance_boundaries ?? []),
    age_range: rules.age_range ?? null,
    distance: rules.distance ?? null,
  };
}

function toProfileSavePayload(profile: ProfilePayload): ProfilePayload {
  return {
    display_name: getSaveDisplayName(profile),
    photos: profile.photos ?? [],
    bio: (profile.bio ?? '').trim(),
    pronouns: profile.pronouns ?? [],
    custom_pronouns: (profile.custom_pronouns ?? '').trim(),
    year_of_birth: profile.year_of_birth ?? null,
    ethnicity: profile.ethnicity ?? '',
    identities: limitGenderIdentities(profile.identities ?? []),
    presentation: profile.presentation ?? [],
    sexuality: profile.sexuality ?? [],
    body_type: profile.body_type ?? [],
    height: profile.height ?? '',
    weight: profile.weight ?? '',
    position: profile.position ?? [],
    role: profile.role ?? [],
    is_trans: profile.is_trans ?? null,
    trans_status_visibility: profile.trans_status_visibility ?? FIXED_PRIVATE_PROFILE_VISIBILITY,
    crowds: sanitizeCrowds(profile),
    availability: profile.availability ?? [],
    hosting_travel: profile.hosting_travel ?? [],
    kinks: profile.kinks ?? [],
    kink_interests: sanitizeKinkInterests(profile),
    kinks_visibility: profile.kinks_visibility ?? 'public',
    vibes: mergeCategorizedVibes(profile),
    scenes: [],
    archetypes: [],
    hobbies: profile.hobbies ?? [],
    custom_hobby: (profile.custom_hobby ?? '').trim(),
    looking_for: profile.looking_for ?? [],
    hiv_status: profile.hiv_status ?? [],
    hiv_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
    custom_hiv_status: (profile.custom_hiv_status ?? '').trim(),
    condoms: profile.condoms ?? [],
    custom_condoms: (profile.custom_condoms ?? '').trim(),
    prep: profile.prep ?? [],
    custom_prep: (profile.custom_prep ?? '').trim(),
    doxypep: profile.doxypep ?? [],
    custom_doxypep: (profile.custom_doxypep ?? '').trim(),
    covid_vaccine: profile.covid_vaccine ?? [],
    custom_covid_vaccine: (profile.custom_covid_vaccine ?? '').trim(),
    mpox_vaccine: profile.mpox_vaccine ?? [],
    custom_mpox_vaccine: (profile.custom_mpox_vaccine ?? '').trim(),
    substance_boundaries: profile.substance_boundaries ?? [],
    visibility_rules: sanitizeVisibilityRules(profile),
  };
}

interface ProfileEditProps {
  embedded?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
}

export default function ProfileEdit({ embedded = false, onCancel, onSaved }: ProfileEditProps = {}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfilePayload);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [pendingPhoto, setPendingPhoto] = useState<PendingProfilePhoto | null>(null);
  const photoPreviewRequestRef = useRef(0);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMyProfile();
        setProfile({
          ...emptyProfilePayload,
          ...data,
        });
      } catch (fetchError) {
        if (fetchError instanceof ProfileApiError && fetchError.status === 404) {
          setProfile(emptyProfilePayload);
        } else {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load profile.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    return () => {
      if (pendingPhoto?.objectUrl) {
        URL.revokeObjectURL(pendingPhoto.objectUrl);
      }
    };
  }, [pendingPhoto]);

  const handleChange = <K extends keyof ProfilePayload>(field: K, value: ProfilePayload[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleTransChange = (checked: boolean) => {
    setProfile((prev) => ({
      ...prev,
      is_trans: checked,
      crowds: checked ? prev.crowds ?? [] : (prev.crowds ?? []).filter((crowd) => crowd !== 'T4T'),
      visibility_rules: checked
        ? prev.visibility_rules
        : {
            ...(prev.visibility_rules ?? emptyProfilePayload.visibility_rules),
            active_crowd_modes: (prev.visibility_rules?.active_crowd_modes ?? []).filter((crowd) => crowd !== 'T4T'),
          },
    }));
  };

  const handleCrowdsChange = (crowds: string[]) => {
    const normalizedCrowds = normalizeCrowdValues(crowds);

    setProfile((prev) => ({
      ...prev,
      crowds: normalizedCrowds,
      visibility_rules: {
        ...(prev.visibility_rules ?? emptyProfilePayload.visibility_rules),
        active_crowd_modes: normalizeCrowdValues(prev.visibility_rules?.active_crowd_modes ?? []).filter((crowd) => normalizedCrowds.includes(crowd)),
      },
    }));
  };

  const handleKinksChange = (selectedKinks: string[]) => {
    setProfile((prev) => {
      const existingById = new Map((prev.kink_interests ?? []).map((interest) => [interest.kink_id, interest]));

      return {
        ...prev,
        kinks: selectedKinks,
        kink_interests: selectedKinks.map((kink) => existingById.get(toKinkId(kink)) ?? toDefaultKinkInterest(kink)),
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const savedProfile = await saveMyProfile(toProfileSavePayload(profile));
      setProfile({
        ...emptyProfilePayload,
        ...savedProfile,
      });
      persistCurrentUser({
        id: savedProfile.id,
        name: savedProfile.display_name,
        display_name: savedProfile.display_name,
        age: savedProfile.year_of_birth ? new Date().getFullYear() - savedProfile.year_of_birth : null,
        year_of_birth: savedProfile.year_of_birth,
      });
      if (embedded) {
        onSaved?.();
      } else {
        navigate(-1);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if ((profile.photos ?? []).length >= MAX_PROFILE_PHOTOS) {
      setPhotoUploadError(`Photo rejected: You can add up to ${MAX_PROFILE_PHOTOS} photos.`);
      return;
    }

    const requestId = photoPreviewRequestRef.current + 1;
    photoPreviewRequestRef.current = requestId;
    setPhotoUploadError(null);
    setError(null);

    try {
      const pendingPreview = await readProfilePhotoPreviewUrl(file);
      if (photoPreviewRequestRef.current !== requestId) {
        if (pendingPreview.objectUrl) {
          URL.revokeObjectURL(pendingPreview.objectUrl);
        }
        return;
      }

      setPendingPhoto(pendingPreview);
    } catch (previewError) {
      if (photoPreviewRequestRef.current === requestId) {
        setPhotoUploadError(previewError instanceof Error ? previewError.message : PROFILE_PHOTO_LOAD_ERROR);
      }
    }
  };

  const handleCancelCrop = () => {
    setPendingPhoto(null);
  };

  const handleConfirmCrop = async (croppedFile: File) => {
    setUploadingPhoto(true);
    setError(null);

    try {
      const uploaded = await uploadProfilePhoto(croppedFile);
      setProfile((prev) => ({
        ...prev,
        photos: [...(prev.photos ?? []), uploaded.url].slice(0, MAX_PROFILE_PHOTOS),
      }));
      setPendingPhoto(null);
      setPhotoUploadError(null);
    } catch (uploadError) {
      setPhotoUploadError(getPhotoUploadRejectedMessage(uploadError));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSetPrimaryPhoto = (photo: string) => {
    setProfile((prev) => ({
      ...prev,
      photos: [photo, ...(prev.photos ?? []).filter((item) => item !== photo)].slice(0, MAX_PROFILE_PHOTOS),
    }));
  };

  const handleRemovePhoto = (photo: string) => {
    setProfile((prev) => ({
      ...prev,
      photos: (prev.photos ?? []).filter((item) => item !== photo),
    }));
  };

  const handleCancel = () => {
    if (embedded) {
      onCancel?.();
    } else {
      navigate(-1);
    }
  };

  if (loading) {
    return <div className={embedded ? 'p-5 text-sm text-white/60' : ''}>Loading...</div>;
  }

  const normalizedProfile: ProfilePayload = {
    ...profile,
    photos: (profile.photos || []).slice(0, MAX_PROFILE_PHOTOS),
    pronouns: profile.pronouns || [],
    identities: limitGenderIdentities(profile.identities || []),
    presentation: profile.presentation || [],
    sexuality: profile.sexuality || [],
    body_type: profile.body_type || [],
    position: profile.position || [],
    role: profile.role || [],
    is_trans: profile.is_trans ?? null,
    trans_status_visibility: profile.trans_status_visibility ?? FIXED_PRIVATE_PROFILE_VISIBILITY,
    crowds: sanitizeCrowds(profile),
    availability: profile.availability || [],
    hosting_travel: profile.hosting_travel || [],
    kinks: profile.kinks || [],
    kink_interests: profile.kink_interests || [],
    kinks_visibility: profile.kinks_visibility || 'public',
    vibes: mergeCategorizedVibes(profile),
    scenes: [],
    archetypes: [],
    hobbies: profile.hobbies || [],
    looking_for: profile.looking_for || [],
    hiv_status: profile.hiv_status || [],
    hiv_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
    condoms: profile.condoms || [],
    prep: profile.prep || [],
    doxypep: profile.doxypep || [],
    covid_vaccine: profile.covid_vaccine || [],
    mpox_vaccine: profile.mpox_vaccine || [],
    substance_boundaries: profile.substance_boundaries || [],
    visibility_rules: sanitizeVisibilityRules(profile),
    year_of_birth: profile.year_of_birth,
  };
  return (
    <div className={embedded ? 'bg-transparent pb-0' : 'min-h-screen bg-background pb-20'}>
      <header className={`${embedded ? 'top-0 border-white/10 bg-black/85 text-white' : 'top-0 border-border bg-card/80'} sticky z-10 flex items-center justify-between border-b p-4 backdrop-blur-sm`}>
        <Button variant="ghost" size="icon" onClick={handleCancel} aria-label={embedded ? 'Back to profile preview' : 'Back'}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Edit Profile</h2>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: 'var(--cruush-gradient)',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </header>

      <div className={embedded ? 'px-5 py-5' : 'max-w-2xl mx-auto p-6'}>
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* ...existing code for TabsList... */}
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="photos" onClick={() => setActiveTab('photos')}>Photos</TabsTrigger>
            <TabsTrigger value="profile" onClick={() => setActiveTab('profile')}>Profile</TabsTrigger>
            <TabsTrigger value="basics" onClick={() => setActiveTab('basics')}>Basics</TabsTrigger>
            <TabsTrigger value="intimacy" onClick={() => setActiveTab('intimacy')}>Intimacy</TabsTrigger>
            <TabsTrigger value="health" onClick={() => setActiveTab('health')}>Health</TabsTrigger>
          </TabsList>

          <TabsContent value="photos" className="space-y-4 mt-6">
            <div className="rounded-md border border-border bg-card/70 p-3 text-sm text-muted-foreground">
              photos must be of you only.
            </div>
            {photoUploadError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {photoUploadError}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {normalizedProfile.photos.map((photo, index) => (
                <div key={photo} className="group overflow-hidden rounded-lg border border-border bg-card/70">
                  <div className="relative aspect-[4/5] bg-accent">
                    <img
                      alt={index === 0 ? 'Primary profile photo' : `Profile photo ${index + 1}`}
                      className="h-full w-full object-cover"
                      src={resolveMediaUrl(photo)}
                    />
                    {index === 0 ? (
                      <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-1 text-[11px] text-white">
                        PFP
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-2">
                    <Button
                      aria-label={`Make photo ${index + 1} primary`}
                      disabled={index === 0}
                      onClick={() => handleSetPrimaryPhoto(photo)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() => handleRemovePhoto(photo)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {normalizedProfile.photos.length < MAX_PROFILE_PHOTOS ? (
                <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/60 p-4 text-center transition-colors hover:bg-accent/50">
                  <Upload className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{uploadingPhoto ? 'Uploading...' : 'Upload photo'}</span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={uploadingPhoto}
                    onChange={handlePhotoUpload}
                    type="file"
                  />
                </label>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">Add up to {MAX_PROFILE_PHOTOS} photos. Your first photo will be your profile picture.</p>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                placeholder="Your display name"
                value={normalizedProfile.display_name}
                onChange={(e) => handleChange('display_name', e.target.value)}
                className="bg-input-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Looking For</Label>
              <MultiSelect options={LOOKING_FOR} value={normalizedProfile.looking_for} onChange={(vals) => handleChange('looking_for', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Availability</Label>
              <MultiSelect options={AVAILABILITY} value={normalizedProfile.availability} onChange={(vals) => handleChange('availability', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect options={HOSTING} value={normalizedProfile.hosting_travel} onChange={(vals) => handleChange('hosting_travel', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Vibes</Label>
              <MultiSelect
                ariaLabel="Vibes"
                optionGroups={VIBE_GROUPS}
                value={normalizedProfile.vibes}
                onChange={(vals) => handleChange('vibes', vals)}
              />
            </div>
          </TabsContent>

          <TabsContent value="basics" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell people about yourself..."
                value={normalizedProfile.bio}
                onChange={e => handleChange('bio', e.target.value)}
                className="min-h-[120px] bg-input-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Pronouns</Label>
              <MultiSelect options={PRONOUNS} value={normalizedProfile.pronouns} onChange={(vals) => handleChange('pronouns', vals)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Year of Birth</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="2000"
                  value={normalizedProfile.year_of_birth ?? ''}
                  onChange={e => handleChange('year_of_birth', e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="bg-input-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ethnicity">Ethnicity</Label>
                <select className="w-full h-10 px-3 rounded-md bg-input-background border border-input" value={normalizedProfile.ethnicity} onChange={e => handleChange('ethnicity', e.target.value)}>
                  <option value="">Select...</option>
                  {ETHNICITIES.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Gender Identities</Label>
              <MultiSelect
                ariaLabel="Gender Identities"
                maxSelections={MAX_GENDER_IDENTITIES}
                options={IDENTITIES}
                value={normalizedProfile.identities}
                onChange={(vals) => handleChange('identities', limitGenderIdentities(vals))}
              />
              <p className="text-xs text-muted-foreground">Select up to 3</p>
            </div>


            <div className="space-y-2">
              <Label>Presentation</Label>
              <MultiSelect options={PRESENTATIONS} value={normalizedProfile.presentation} onChange={(vals) => handleChange('presentation', vals)} />
            </div>

            <div className="space-y-2">
              <Label>Sexuality</Label>
              <MultiSelect options={SEXUALITY} value={normalizedProfile.sexuality} onChange={(vals) => handleChange('sexuality', vals)} />
            </div>

            <div className="space-y-3 rounded-md border border-border bg-card/40 p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="is_trans"
                  checked={normalizedProfile.is_trans === true}
                  onCheckedChange={(checked) => handleTransChange(checked === true)}
                />
                <Label htmlFor="is_trans">I am trans</Label>
              </div>

              <div className="space-y-2">
                <Label>Trans status visibility</Label>
                <MultiSelect
                  ariaLabel="Trans status visibility"
                  options={VISIBILITY_OPTION_LABELS}
                  value={[getVisibilityLabel(normalizedProfile.trans_status_visibility)]}
                  onChange={(values) => handleChange('trans_status_visibility', getVisibilityValue(values[0]))}
                  selectionMode="single"
                  placeholder="Select visibility..."
                />
              </div>

              <div className="space-y-2">
                <Label>Crowds</Label>
                <MultiSelect
                  ariaLabel="Crowds"
                  options={normalizedProfile.is_trans === true ? CROWDS : CROWDS.filter((crowd) => crowd !== 'T4T')}
                  value={normalizedProfile.crowds}
                  onChange={handleCrowdsChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Body Type</Label>
              <MultiSelect options={BODY_TYPES} value={normalizedProfile.body_type} onChange={(vals) => handleChange('body_type', vals)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <Input id="height" placeholder={'5\'8"'} value={normalizedProfile.height} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('height', e.target.value)} className="bg-input-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <Input id="weight" placeholder="155 lbs" value={normalizedProfile.weight} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('weight', e.target.value)} className="bg-input-background" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hobbies</Label>
              <MultiSelect options={HOBBIES} value={normalizedProfile.hobbies} onChange={(vals) => handleChange('hobbies', vals)} />
            </div>
          </TabsContent>

          <TabsContent value="intimacy" className="space-y-6 mt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Position</Label>
                <MultiSelect
                  ariaLabel="Position"
                  options={POSITIONS}
                  value={normalizedProfile.position}
                  onChange={(vals) => handleChange('position', vals)}
                  selectionMode="single"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <MultiSelect
                  ariaLabel="Role"
                  options={ROLES}
                  value={normalizedProfile.role}
                  onChange={(vals) => handleChange('role', vals)}
                  selectionMode="single"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Availability</Label>
              <MultiSelect options={AVAILABILITY} value={normalizedProfile.availability} onChange={vals => handleChange('availability', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect options={HOSTING} value={normalizedProfile.hosting_travel} onChange={vals => handleChange('hosting_travel', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Kinks & Fetishes</Label>
              <MultiSelect
                ariaLabel="Kinks & Fetishes"
                optionGroups={KINK_GROUPS}
                value={normalizedProfile.kinks}
                onChange={handleKinksChange}
              />
            </div>
            <div className="space-y-2">
              <Label>Kinks & Fetishes visibility</Label>
              <MultiSelect
                ariaLabel="Kinks & Fetishes visibility"
                options={VISIBILITY_OPTION_LABELS}
                value={[getVisibilityLabel(normalizedProfile.kinks_visibility)]}
                onChange={(values) => handleChange('kinks_visibility', getVisibilityValue(values[0]))}
                selectionMode="single"
                placeholder="Select visibility..."
              />
            </div>
          </TabsContent>

          <TabsContent value="health" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>HIV Status</Label>
              <MultiSelect ariaLabel="HIV Status" options={HIV_STATUS} value={normalizedProfile.hiv_status} onChange={vals => handleChange('hiv_status', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Condoms</Label>
              <MultiSelect options={CONDOMS} value={normalizedProfile.condoms} onChange={vals => handleChange('condoms', vals)} />
            </div>
            <div className="space-y-2">
              <Label>PrEP</Label>
              <MultiSelect options={PREP} value={normalizedProfile.prep} onChange={vals => handleChange('prep', vals)} />
            </div>
            <div className="space-y-2">
              <Label>DoxyPEP</Label>
              <MultiSelect options={DOXYPEP} value={normalizedProfile.doxypep} onChange={vals => handleChange('doxypep', vals)} />
            </div>
            <div className="space-y-2">
              <Label>COVID Vaccine</Label>
              <MultiSelect options={COVID_VACCINE} value={normalizedProfile.covid_vaccine} onChange={vals => handleChange('covid_vaccine', vals)} />
            </div>
            <div className="space-y-2">
              <Label>MPOX Vaccine</Label>
              <MultiSelect options={MPOX_VACCINE} value={normalizedProfile.mpox_vaccine} onChange={vals => handleChange('mpox_vaccine', vals)} />
            </div>
            <div className="space-y-2">
              <Label>Substance Boundaries</Label>
              <p className="text-sm text-muted-foreground">Select anything you do not want involved when meeting.</p>
              <MultiSelect
                ariaLabel="Substance Boundaries"
                menuPortal={embedded}
                menuPlacement="top"
                options={SUBSTANCE_BOUNDARIES}
                value={normalizedProfile.substance_boundaries}
                onChange={vals => handleChange('substance_boundaries', vals)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      {pendingPhoto ? (
        <ProfilePhotoCropper
          onCancel={handleCancelCrop}
          onConfirm={handleConfirmCrop}
          processing={uploadingPhoto}
          sourceUrl={pendingPhoto.url}
        />
      ) : null}
    </div>
  );
}
