import type { ChangeEvent, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { DROPDOWN_TRIGGER_CLASS } from '../lib/controlStyles';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';
import { PHOTO_UPLOAD_ACCEPT } from '../lib/photoUploadFormats';
import { SIGNAL_MAX_LENGTH } from '../lib/profileLimits';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Eye, Hash, RotateCcw, RotateCw, Star, Trash2, Upload, X } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import { getMyBillingStatus } from '../lib/billingApi';
import MultiSelect from './MultiSelect';
import SingleSelect from './SingleSelect';
import {
  emptyProfilePayload,
  getMyProfile,
  notifyProfileChanged,
  ProfileApiError,
  saveMyProfile,
  toDefaultKinkInterest,
  toKinkId,
  uploadProfilePhoto,
  type ProfileRecord,
  type ProfileVisibility,
  type ProfilePayload,
  type ProfileVisibilityRules,
} from '../lib/profileApi';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';
import { getAppMeta } from '../lib/metaApi';
import { getStoredCurrentUser, persistCurrentUser } from '../lib/sessionUser';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import DlModePhotoPlaceholder from './DlModePhotoPlaceholder';
import { getProfileGradientCss } from '../lib/profileGradient';
import { saveDistancePreferences, useDistancePreferences } from '../lib/distancePreferences';
import {
  AVAILABILITY,
  BODY_TYPES,
  CROWDS,
  ETHNICITIES,
  findStructuredProfileFieldForTag,
  HIV_STATUS,
  HOBBY_GROUPS,
  HOSTING,
  IDENTITIES,
  KINK_CATALOG,
  KINK_GROUPS,
  LOOKING_FOR,
  RELATIONSHIP_STATUS,
  ZODIAC,
  MAX_PROFILE_SEXUALITIES,
  normalizeCrowdValues,
  POSITIONS,
  PREFERRED_SPOTS,
  PRESENTATIONS,
  PROTECTION_BOUNDARIES,
  PROFILE_VISIBILITY_OPTIONS,
  PROTECTIONS,
  PRONOUNS,
  ROLES,
  SEXUALITY,
  SUBSTANCE_BOUNDARIES,
  VIBE_GROUPS,
} from '../lib/profileOptions';

const MAX_PROFILE_PHOTOS = 4;
const BadgePickerPreview = lazy(() => import('./BadgePickerPreview'));
const MAX_PROFILE_GROUP_SELECTIONS = 3;
const MAX_PROFILE_VIBES = 3;
const MAX_PROFILE_HOBBIES = 3;
const MAX_PROFILE_KINKS = 3;
const BASIC_PROFILE_TAGS = 3;
const CRUUSH_PLUS_PROFILE_TAGS = 10;
/** cruush+ lifts the ceiling rather than raising it. */
const UNLIMITED_PROFILE_KINKS = Number.POSITIVE_INFINITY;
const MAX_GENDER_IDENTITIES = MAX_PROFILE_GROUP_SELECTIONS;
const PROFILE_PHOTO_LOAD_ERROR = 'This image could not be loaded. Try a JPG, PNG, or WebP file.';
const PROFILE_PHOTO_SAVE_PATH_PATTERN = /^\/api\/media\/(?:profile-photos\/[0-9a-f-]{36}-[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\.(?:jpg|png|webp)|assets\/[0-9a-f-]{36}\/display)$/i;

const VISIBILITY_OPTION_LABELS = PROFILE_VISIBILITY_OPTIONS.map((option) => option.label);
const FIXED_PRIVATE_PROFILE_VISIBILITY: ProfileVisibility = 'mutual_cruushes';

export type PendingProfilePhoto = {
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

function normalizeProfileTag(value: string) {
  const normalized = value.trim().replace(/^#+/, '').toLowerCase();
  return /^[a-z0-9_]{1,24}$/.test(normalized) ? normalized : '';
}

function latestUniqueValues(values: string[]) {
  const seen = new Set<string>();
  const nextValues: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim();

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    nextValues.unshift(value);
  }

  return nextValues;
}

function singleValue(values: string[] = []) {
  return latestUniqueValues(values).slice(-1);
}

function limitToThree(values: string[] = []) {
  return latestUniqueValues(values).slice(-MAX_PROFILE_GROUP_SELECTIONS);
}

function limitToFive(values: string[] = []) {
  return latestUniqueValues(values).slice(-5);
}

function limitKinks(values: string[] = [], limit: number = MAX_PROFILE_KINKS) {
  const unique = latestUniqueValues(values);

  return Number.isFinite(limit) ? unique.slice(-limit) : unique;
}

function limitGenderIdentities(values: string[]) {
  return limitToThree(values);
}

function normalizeProfilePhotoForSave(photo: string) {
  const trimmedPhoto = photo.trim();

  if (!trimmedPhoto) {
    return null;
  }

  let pathname = trimmedPhoto;

  if (!trimmedPhoto.startsWith('/')) {
    const absoluteUrlPathMatch = /^https?:\/\/[^/?#]+(?<pathname>\/[^?#]*)/i.exec(trimmedPhoto);

    if (!absoluteUrlPathMatch?.groups?.pathname) {
      return null;
    }

    pathname = absoluteUrlPathMatch.groups.pathname;
  }

  const canonicalPathname = pathname.startsWith('/media/profile-photos/')
    ? `/api${pathname}`
    : pathname;

  return PROFILE_PHOTO_SAVE_PATH_PATTERN.test(canonicalPathname) ? canonicalPathname : null;
}

function sanitizeProfilePhotos(photos: string[] = []) {
  return latestUniqueValues(
    photos
      .map((photo) => normalizeProfilePhotoForSave(photo))
      .filter((photo): photo is string => Boolean(photo)),
  ).slice(0, MAX_PROFILE_PHOTOS);
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

export function readProfilePhotoPreviewUrl(file: File): Promise<PendingProfilePhoto> {
  try {
    const objectUrl = URL.createObjectURL(file);
    return Promise.resolve({ url: objectUrl, objectUrl });
  } catch {
    return Promise.reject(new Error(PROFILE_PHOTO_LOAD_ERROR));
  }
}

export function getPhotoUploadRejectedMessage(uploadError: unknown) {
  if (uploadError instanceof ApiClientError) {
    return uploadError.code === 'CONTENT_REJECTED'
      ? `Photo rejected: ${uploadError.message}`
      : uploadError.message;
  }

  return uploadError instanceof Error ? uploadError.message : 'Failed to upload profile photo.';
}

export function ProfilePhotoCropper({
  onCancel,
  onConfirm,
  processing,
  sourceUrl,
  subjectLabel,
}: {
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
  processing: boolean;
  sourceUrl: string;
  subjectLabel?: string;
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

  // The sheet this cropper lives in is its own stacking context, so its
  // z-index never reached the root and anything fixed at the root could paint
  // over its buttons. Portaled to the body, it competes where dialogs do.
  return createPortal(
    <div
      aria-label={subjectLabel ? `Crop ${subjectLabel}` : 'Crop profile photo'}
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/78 p-2 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
    >
      <div className="my-auto max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-white/12 bg-background text-foreground shadow-[0_28px_90px_rgba(0,0,0,0.52)] sm:max-h-[calc(100dvh-2rem)]">
        <div
          className="relative mx-auto aspect-[4/5] touch-none overflow-hidden bg-black"
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          style={{ width: 'min(100%, 41.6dvh, 24rem)' }}
        >
          <img
            ref={imageRef}
            alt={subjectLabel ? `${subjectLabel} crop preview` : 'Profile crop preview'}
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
              aria-label={subjectLabel ? `Zoom ${subjectLabel}` : 'Zoom profile photo'}
              className="cruush-range"
              id="profile-photo-zoom"
              max="2.5"
              min="1"
              onChange={(event) => setZoom(Number(event.target.value))}
              step="0.05"
              type="range"
              value={zoom}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="profile-photo-rotation">Rotation</Label>
              <span className="text-xs text-muted-foreground" aria-live="polite">{rotation}°</span>
            </div>
            <input
              aria-label="Rotate photo"
              className="cruush-range"
              id="profile-photo-rotation"
              max="180"
              min="-180"
              onChange={(event) => setRotation(Number(event.target.value))}
              step="1"
              type="range"
              value={rotation}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="ml-auto flex min-w-0 gap-2">
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
    </div>,
    document.body,
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
  const allowedKinkIds = new Set(KINK_CATALOG.map((kink) => kink.id));

  return sourceInterests
    .map((interest) => {
      const kinkId = toKinkId(interest.kink_id || interest.label || '');

      if (!kinkId || seen.has(kinkId) || !allowedKinkIds.has(kinkId)) {
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

function normalizeProfileHobbies(values: string[]) {
  return limitToThree(uniqueValues(values).map((value) => value.trim().toLowerCase() === 'gaming' ? 'video games' : value));
}

function sanitizeVisibilityRules(profile: ProfilePayload): ProfileVisibilityRules {
  const rules = profile.visibility_rules ?? emptyProfilePayload.visibility_rules;
  const allowedActiveCrowds = new Set(sanitizeCrowds(profile));

  return {
    ...emptyProfilePayload.visibility_rules,
    ...rules,
    active_crowd_modes: normalizeCrowdValues(rules.active_crowd_modes ?? []).filter((crowd) => allowedActiveCrowds.has(crowd)).slice(0, MAX_PROFILE_GROUP_SELECTIONS),
    identities: uniqueValues(rules.identities ?? []),
    presentations: uniqueValues(rules.presentations ?? []),
    looking_for: uniqueValues(rules.looking_for ?? []),
    timing: uniqueValues(rules.timing ?? []),
    hosting: uniqueValues(rules.hosting ?? []),
    preferred_spots: uniqueValues(rules.preferred_spots ?? []),
    vibes: uniqueValues(rules.vibes ?? []),
    crowds: normalizeCrowdValues(rules.crowds ?? []).slice(0, MAX_PROFILE_GROUP_SELECTIONS),
    hobbies: uniqueValues(rules.hobbies ?? []),
    positions: uniqueValues(rules.positions ?? []),
    roles: uniqueValues(rules.roles ?? []),
    kinks: uniqueValues(rules.kinks ?? []),
    body_types: uniqueValues(rules.body_types ?? []),
    sexuality: uniqueValues(rules.sexuality ?? []),
    substance_boundaries: uniqueValues(rules.substance_boundaries ?? []),
    protection_boundaries: uniqueValues(rules.protection_boundaries ?? []),
    age_range: rules.age_range ?? null,
    distance: rules.distance ?? null,
  };
}

function toProfileSavePayload(
  profile: ProfilePayload,
  kinkLimit: number = MAX_PROFILE_KINKS,
  profileTagLimit: number = BASIC_PROFILE_TAGS,
): ProfilePayload {
  return {
    display_name: getSaveDisplayName(profile),
    photos: sanitizeProfilePhotos(profile.photos ?? []),
    bio: (profile.bio ?? '').trim(),
    tags: uniqueValues(profile.tags ?? []).map(normalizeProfileTag).filter((tag) => Boolean(tag) && !findStructuredProfileFieldForTag(tag)).slice(0, profileTagLimit),
    signal: (profile.signal ?? '').trim(),
    pronouns: limitToThree(profile.pronouns ?? []),
    custom_pronouns: (profile.custom_pronouns ?? '').trim(),
    year_of_birth: profile.year_of_birth ?? null,
    ethnicity: profile.ethnicity ?? '',
    identities: limitGenderIdentities(profile.identities || []),
    presentation: limitToThree(profile.presentation ?? []),
    sexuality: limitToThree(profile.sexuality ?? []),
    body_type: limitToThree(profile.body_type ?? []),
    height: profile.height ?? '',
    weight: profile.weight ?? '',
    position: limitToThree(profile.position ?? []),
    role: limitToThree(profile.role ?? []),
    is_trans: profile.is_trans ?? null,
    trans_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
    crowds: sanitizeCrowds(profile),
    availability: limitToThree(profile.availability ?? []),
    hosting_travel: limitToThree(profile.hosting_travel ?? []),
    preferred_spots: limitToThree(profile.preferred_spots ?? []),
    relationship_status: limitToThree(profile.relationship_status ?? []),
    zodiac: (profile.zodiac ?? []).slice(-1),
    kinks: limitKinks(profile.kinks ?? [], kinkLimit),
    kink_interests: Number.isFinite(kinkLimit)
      ? sanitizeKinkInterests(profile).slice(-kinkLimit)
      : sanitizeKinkInterests(profile),
    kinks_visibility: profile.kinks_visibility ?? 'public',
    vibes: limitToThree(mergeCategorizedVibes(profile)),
    scenes: [],
    archetypes: [],
    hobbies: normalizeProfileHobbies(profile.hobbies ?? []),
    custom_hobby: (profile.custom_hobby ?? '').trim(),
    looking_for: limitToThree(profile.looking_for ?? []),
    hiv_status: singleValue(profile.hiv_status ?? []),
    hiv_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
    custom_hiv_status: (profile.custom_hiv_status ?? '').trim(),
    condoms: singleValue(profile.condoms ?? []),
    custom_condoms: (profile.custom_condoms ?? '').trim(),
    prep: singleValue(profile.prep ?? []),
    custom_prep: (profile.custom_prep ?? '').trim(),
    doxypep: singleValue(profile.doxypep ?? []),
    custom_doxypep: (profile.custom_doxypep ?? '').trim(),
    covid_vaccine: singleValue(profile.covid_vaccine ?? []),
    custom_covid_vaccine: (profile.custom_covid_vaccine ?? '').trim(),
    mpox_vaccine: singleValue(profile.mpox_vaccine ?? []),
    custom_mpox_vaccine: (profile.custom_mpox_vaccine ?? '').trim(),
    health_preferences: profile.health_preferences ?? [],
    birth_control: profile.birth_control ?? [],
    protections: profile.protections ?? [],
    substance_boundaries: profile.substance_boundaries ?? [],
    protection_boundaries: singleValue(profile.protection_boundaries ?? []),
    visibility_rules: sanitizeVisibilityRules(profile),
  };
}

interface ProfileEditProps {
  embedded?: boolean;
  onCancel?: () => void;
  onSaved?: (savedProfile: ProfileRecord) => void;
}

export default function ProfileEdit({ embedded = false, onCancel, onSaved }: ProfileEditProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedProfileSection = (location.state as { profileSection?: 'vibes' | 'kinks' } | null)?.profileSection;
  const distancePreferences = useDistancePreferences();
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfilePayload);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [photoUploadNotice, setPhotoUploadNotice] = useState<string | null>(null);
  const [profileTagDraft, setProfileTagDraft] = useState('');
  const [profileTagError, setProfileTagError] = useState<string | null>(null);
  const [profilePhotoUploadsAvailable, setProfilePhotoUploadsAvailable] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState(requestedProfileSection === 'kinks' ? 'intimacy' : 'basics');
  const badgeExitGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  const badgeSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const [badgeDirty, setBadgeDirty] = useState(false);
  const [badgeSaveState, setBadgeSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pendingPhoto, setPendingPhoto] = useState<PendingProfilePhoto | null>(null);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const photoPreviewRequestRef = useRef(0);
  const profileSaveRequestRef = useRef(0);

  // The badge picker is embedded in this screen, so its "Edit profile vibes"
  // link navigates to the route we are already on. Without following the
  // requested section here the tab never moved and the button looked dead.
  useEffect(() => {
    if (!requestedProfileSection) {
      return;
    }

    setActiveTab(requestedProfileSection === 'kinks' ? 'intimacy' : 'basics');
  }, [requestedProfileSection, location.key]);

  useEffect(() => {
    if (loading || !requestedProfileSection) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`profile-${requestedProfileSection}`)?.scrollIntoView({ block: 'center' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loading, requestedProfileSection, location.key]);

  const applySavedProfile = (savedProfile: ProfileRecord) => {
    const loadedProfile = {
      ...emptyProfilePayload,
      ...savedProfile,
    };

    setProfile(loadedProfile);
    persistCurrentUser({
      id: savedProfile.id,
      name: savedProfile.display_name,
      display_name: savedProfile.display_name,
      age: savedProfile.year_of_birth ? new Date().getFullYear() - savedProfile.year_of_birth : null,
      year_of_birth: savedProfile.year_of_birth,
    });
    onSaved?.(loadedProfile);

    return loadedProfile;
  };

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

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
    let active = true;

    getAppMeta()
      .then((meta) => {
        if (active && typeof meta.photoUploads?.profilePhotos === 'boolean') {
          setProfilePhotoUploadsAvailable(meta.photoUploads.profilePhotos);
        }
      })
      .catch(() => {
        if (active) {
          setProfilePhotoUploadsAvailable(null);
        }
      });

    return () => {
      active = false;
    };
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

  // Basic profiles carry three kinks. cruush+ can use the full catalog.
  const [cruushPlus, setCruushPlus] = useState(false);

  useEffect(() => {
    let active = true;

    getMyBillingStatus()
      .then((status) => {
        if (active) {
          setCruushPlus(status.cruushPlus === true);
        }
      })
      .catch(() => {
        if (active) {
          setCruushPlus(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const kinkLimit = cruushPlus ? UNLIMITED_PROFILE_KINKS : MAX_PROFILE_KINKS;
  const profileTagLimit = cruushPlus ? CRUUSH_PLUS_PROFILE_TAGS : BASIC_PROFILE_TAGS;

  const handleKinksChange = (selectedKinks: string[]) => {
    setProfile((prev) => {
      const limitedSelectedKinks = limitKinks(selectedKinks, kinkLimit);
      const existingById = new Map((prev.kink_interests ?? []).map((interest) => [interest.kink_id, interest]));

      return {
        ...prev,
        kinks: limitedSelectedKinks,
        kink_interests: limitedSelectedKinks.map((kink) => existingById.get(toKinkId(kink)) ?? toDefaultKinkInterest(kink)),
      };
    });
  };

  const handleSave = async () => {
    const requestId = profileSaveRequestRef.current + 1;
    profileSaveRequestRef.current = requestId;
    setSaving(true);
    setError(null);
    try {
      const savedProfile = await saveMyProfile(toProfileSavePayload(profile, kinkLimit, profileTagLimit));
      if (profileSaveRequestRef.current !== requestId) {
        return;
      }

      applySavedProfile(savedProfile);
      if (embedded) {
        return;
      } else {
        navigate(-1);
      }
    } catch (saveError) {
      if (profileSaveRequestRef.current === requestId) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save profile.');
      }
    } finally {
      if (profileSaveRequestRef.current === requestId) {
        setSaving(false);
      }
    }
  };

  const persistProfilePhotoEdit = async (nextProfile: ProfilePayload) => {
    const requestId = profileSaveRequestRef.current + 1;
    profileSaveRequestRef.current = requestId;

    setProfile(nextProfile);
    setSaving(true);
    setError(null);
    setPhotoUploadError(null);

    try {
      const savedProfile = await saveMyProfile(toProfileSavePayload(nextProfile, kinkLimit, profileTagLimit));

      if (profileSaveRequestRef.current === requestId) {
        applySavedProfile(savedProfile);
      }
    } catch (saveError) {
      if (profileSaveRequestRef.current !== requestId) {
        return;
      }

      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile.');

      try {
        const freshProfile = await getMyProfile();

        if (profileSaveRequestRef.current === requestId) {
          applySavedProfile(freshProfile);
        }
      } catch {
        // Keep the visible optimistic edit plus the save error.
      }
    } finally {
      if (profileSaveRequestRef.current === requestId) {
        setSaving(false);
      }
    }
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (profilePhotoUploadsAvailable === false) {
      setPhotoUploadError('Profile photo uploads are temporarily unavailable.');
      return;
    }

    if ((profile.photos ?? []).length >= MAX_PROFILE_PHOTOS) {
      setPhotoUploadError(`Photo rejected: You can add up to ${MAX_PROFILE_PHOTOS} photos.`);
      return;
    }

    const requestId = photoPreviewRequestRef.current + 1;
    photoPreviewRequestRef.current = requestId;
    setPhotoUploadError(null);
    setPhotoUploadNotice(null);
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
    const previousPhotos = profile.photos ?? [];
    const previousMetadata = profile.photo_metadata ?? [];

    try {
      const uploaded = await uploadProfilePhoto(croppedFile);

      if (uploaded.status === 'pending_review') {
        setPendingPhoto(null);
        setPhotoUploadError(null);
        setPhotoUploadNotice('Photo submitted for review.');
        return;
      }

      const uploadedPhotos = (uploaded.photos ?? [...previousPhotos, uploaded.url]).slice(0, MAX_PROFILE_PHOTOS);
      const uploadedMetadata = [
        ...previousMetadata.filter((metadata) => metadata.url !== uploaded.url),
        { url: uploaded.url, explicit: uploaded.explicit === true },
      ].filter((metadata) => uploadedPhotos.includes(metadata.url)).slice(-MAX_PROFILE_PHOTOS);
      const currentUserId = getStoredCurrentUser()?.id;

      setProfile((prev) => ({
        ...prev,
        photos: uploadedPhotos,
        photo_metadata: uploadedMetadata,
      }));

      if (currentUserId) {
        applySavedProfile({
          ...profile,
          id: currentUserId,
          updated_at: new Date().toISOString(),
          photos: uploadedPhotos,
          photo_metadata: uploadedMetadata,
        });
      }

      const freshProfile = await getMyProfile().catch(() => null);

      if (freshProfile) {
        const loadedProfile = {
          ...emptyProfilePayload,
          ...freshProfile,
        };
        const loadedPhotos = loadedProfile.photos ?? [];
        const photos = loadedPhotos.includes(uploaded.url)
          ? loadedPhotos
          : uploadedPhotos;
        const loadedMetadata = loadedProfile.photo_metadata ?? [];
        const photo_metadata = loadedMetadata.some((metadata) => metadata.url === uploaded.url)
          ? loadedMetadata
          : uploadedMetadata;
        const mergedProfile = {
          ...loadedProfile,
          photos,
          photo_metadata,
        };

        applySavedProfile(mergedProfile);
      }
      setPendingPhoto(null);
      setPhotoUploadError(null);
      setPhotoUploadNotice(null);
    } catch (uploadError) {
      setPendingPhoto(null);
      setPhotoUploadNotice(null);
      setPhotoUploadError(getPhotoUploadRejectedMessage(uploadError));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSetPrimaryPhoto = (photo: string) => {
    const nextProfile = {
      ...profile,
      photos: [photo, ...(profile.photos ?? []).filter((item) => item !== photo)].slice(0, MAX_PROFILE_PHOTOS),
    };

    void persistProfilePhotoEdit(nextProfile);
  };

  const handleRemovePhoto = (photo: string) => {
    const nextProfile = {
      ...profile,
      photos: (profile.photos ?? []).filter((item) => item !== photo),
    };

    void persistProfilePhotoEdit(nextProfile);
  };

  const handleCancel = async () => {
    if (activeTab === 'badges' && badgeExitGuardRef.current && !(await badgeExitGuardRef.current())) {
      return;
    }

    if (embedded) {
      onCancel?.();
    } else {
      navigate(-1);
    }
  };

  const handleTabChange = (nextTab: string) => {
    if (activeTab === 'badges' && nextTab !== 'badges' && badgeExitGuardRef.current) {
      void badgeExitGuardRef.current().then((canLeave) => {
        if (canLeave) {
          setActiveTab(nextTab);
        }
      });
      return;
    }

    setActiveTab(nextTab);
  };

  const handleHeaderSave = () => {
    if (activeTab === 'badges') {
      void badgeSaveRef.current?.();
      return;
    }

    void handleSave();
  };

  if (loading) {
    return <LoadingCardSkeletons className={embedded ? 'p-5' : 'mx-auto max-w-2xl p-5'} count={3} label="Loading profile editor" />;
  }

  const normalizedProfile: ProfilePayload = {
    ...profile,
    photos: sanitizeProfilePhotos(profile.photos || []),
    tags: uniqueValues(profile.tags || []).map(normalizeProfileTag).filter((tag) => Boolean(tag) && !findStructuredProfileFieldForTag(tag)).slice(0, profileTagLimit),
    signal: profile.signal ?? '',
    pronouns: profile.pronouns || [],
    identities: limitGenderIdentities(profile.identities || []),
    presentation: limitToThree(profile.presentation || []),
    sexuality: singleValue(profile.sexuality || []),
    body_type: limitToThree(profile.body_type || []),
    position: limitToThree(profile.position || []),
    role: limitToThree(profile.role || []),
    is_trans: profile.is_trans ?? null,
    trans_status_visibility: profile.trans_status_visibility ?? FIXED_PRIVATE_PROFILE_VISIBILITY,
    crowds: sanitizeCrowds(profile),
    availability: limitToThree(profile.availability || []),
    hosting_travel: limitToThree(profile.hosting_travel || []),
    preferred_spots: limitToThree(profile.preferred_spots || []),
    kinks: profile.kinks || [],
    kink_interests: profile.kink_interests || [],
    kinks_visibility: profile.kinks_visibility || 'public',
    vibes: limitToThree(mergeCategorizedVibes(profile)),
    scenes: [],
    archetypes: [],
    hobbies: normalizeProfileHobbies(profile.hobbies || []),
    looking_for: limitToThree(profile.looking_for || []),
    hiv_status: singleValue(profile.hiv_status || []),
    hiv_status_visibility: FIXED_PRIVATE_PROFILE_VISIBILITY,
    condoms: singleValue(profile.condoms || []),
    prep: singleValue(profile.prep || []),
    doxypep: singleValue(profile.doxypep || []),
    covid_vaccine: singleValue(profile.covid_vaccine || []),
    mpox_vaccine: singleValue(profile.mpox_vaccine || []),
    health_preferences: profile.health_preferences || [],
    birth_control: profile.birth_control || [],
    protections: profile.protections || [],
    substance_boundaries: profile.substance_boundaries || [],
    protection_boundaries: singleValue(profile.protection_boundaries || []),
    visibility_rules: sanitizeVisibilityRules(profile),
    year_of_birth: profile.year_of_birth,
  };
  const photoMetadataByUrl = new Map(
    (((profile as ProfileRecord).photo_metadata ?? []) as Array<{ url?: unknown; explicit?: unknown }>)
      .filter((metadata) => typeof metadata.url === 'string')
      .map((metadata) => [
        metadata.url as string,
        metadata.explicit === true ? true : metadata.explicit === false ? false : undefined,
      ] as const)
  );
  const profileMenuProps = {
    menuPortal: true,
  };
  const addProfileTag = () => {
    const tag = normalizeProfileTag(profileTagDraft);
    const structuredField = findStructuredProfileFieldForTag(profileTagDraft);

    if (structuredField) {
      setProfileTagError(`That is already a profile option. Add it under ${structuredField}.`);
      return;
    }
    if (!tag || normalizedProfile.tags.includes(tag) || normalizedProfile.tags.length >= profileTagLimit) return;

    handleChange('tags', [...normalizedProfile.tags, tag]);
    setProfileTagDraft('');
    setProfileTagError(null);
  };
  return (
    <div className={embedded ? 'bg-transparent pb-0' : 'min-h-screen bg-background pb-20'}>
      <header className={`${embedded ? 'top-0 border-white/10 bg-black text-white' : 'top-0 border-border bg-card/80'} sticky z-30 flex items-center justify-between border-b p-4 backdrop-blur-sm`}>
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => void handleCancel()} aria-label={embedded ? 'Back to profile preview' : 'Back'}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="truncate text-xl">Edit Profile</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleHeaderSave}
            disabled={activeTab === 'badges' ? badgeSaveState === 'saving' || !badgeDirty : saving}
            style={{
              background: 'var(--cruush-gradient)',
            }}
          >
            {activeTab === 'badges' && badgeSaveState === 'saving' || activeTab !== 'badges' && saving ? 'Saving...' : 'Save'}
          </Button>
          {/* The bug button docks into this row like every other header, so
              it is on this screen whether or not the map is behind it. Close
              stays the last thing on the right. */}
          <div className="h-10 w-10 shrink-0" data-testid="profile-edit-bug-button-slot" ref={registerBugButtonSlot} />
          {embedded ? (
            <Button variant="ghost" size="icon" onClick={() => void handleCancel()} aria-label="Close Edit Profile">
              <X className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className={embedded ? 'px-5 py-5' : 'max-w-2xl mx-auto p-6'}>
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="sticky top-0 z-20 grid h-auto w-full grid-cols-5 rounded-full border border-white/10 bg-background/92 p-1 backdrop-blur-md">
            <TabsTrigger value="photos" className="min-h-11">Photos</TabsTrigger>
            <TabsTrigger
              value="badges"
              className="min-h-11"
            >
              Badges
            </TabsTrigger>
            <TabsTrigger value="basics" className="min-h-11">Basics</TabsTrigger>
            <TabsTrigger value="intimacy" className="min-h-11">Intimacy</TabsTrigger>
            <TabsTrigger value="health" className="min-h-11">Health</TabsTrigger>
          </TabsList>

          <TabsContent forceMount value="badges" className="mt-0 data-[state=inactive]:hidden">
            <Suspense fallback={<LoadingCardSkeletons className="px-5 py-6" count={2} label="Loading badge editor" />}>
              <BadgePickerPreview
                embedded
                onClose={() => handleTabChange('basics')}
                onExitGuardReady={(guard) => {
                  badgeExitGuardRef.current = guard;
                }}
                onDirtyChange={setBadgeDirty}
                onSaveReady={(save) => {
                  badgeSaveRef.current = save;
                }}
                onSaveStateChange={setBadgeSaveState}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="photos" className="space-y-4 mt-6">
            <div className="rounded-md border border-border bg-card/70 p-3 text-xs leading-snug text-muted-foreground sm:text-sm">
              <ul className="list-disc space-y-1 pl-5">
                <li>Profile photos may be SFW or NSFW.</li>
                <li>Use a photo of you or your gear.</li>
                <li>Add at least one SFW photo if you want people browsing in DL Mode to still see you.</li>
                <li>You don't have to show your face.</li>
              </ul>
            </div>
            {photoUploadNotice ? (
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
                {photoUploadNotice}
              </div>
            ) : null}
            {photoUploadError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {photoUploadError}
              </div>
            ) : null}
            {profilePhotoUploadsAvailable === false ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Profile photo uploads are temporarily unavailable.
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {normalizedProfile.photos.map((photo, index) => {
                const photoMasked = shouldMaskPhoto(dlModeActive, photoMetadataByUrl.get(photo));

                return (
                <div key={photo} className="group overflow-hidden rounded-lg border border-border bg-card/70">
                  <div className="relative aspect-[4/5] bg-accent">
                    {photoMasked ? (
                      <div
                        aria-label={index === 0 ? 'Primary profile photo hidden by DL Mode' : `Profile photo ${index + 1} hidden by DL Mode`}
                        className="flex h-full w-full items-center justify-center"
                        role="img"
                        style={{ background: getProfileGradientCss(`${(profile as ProfileRecord).id ?? 'profile'}:${index}`) }}
                      >
                        <DlModePhotoPlaceholder />
                      </div>
                    ) : (
                      <img
                        alt={index === 0 ? 'Primary profile photo' : `Profile photo ${index + 1}`}
                        className="h-full w-full object-cover"
                        src={resolveMediaUrl(photo)}
                      />
                    )}
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
                );
              })}

              {normalizedProfile.photos.length < MAX_PROFILE_PHOTOS ? (
                <label className={`flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/60 p-4 text-center transition-colors ${profilePhotoUploadsAvailable === false ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-accent/50'}`}>
                  <Upload className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{uploadingPhoto ? 'Uploading...' : 'Upload photo'}</span>
                  <input
                    accept={PHOTO_UPLOAD_ACCEPT}
                    className="sr-only"
                    disabled={uploadingPhoto || profilePhotoUploadsAvailable === false}
                    onChange={handlePhotoUpload}
                    type="file"
                  />
                </label>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="basics" className="space-y-6 mt-6">
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
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell people about yourself..."
                value={normalizedProfile.bio}
                onChange={e => handleChange('bio', e.target.value)}
                className="min-h-[120px] bg-input-background"
              />
              <p className="text-xs text-muted-foreground">Add tags below so people can find your profile in Seeking and Visibility. Basic includes 3; cruush+ includes 10.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-tags">Tags</Label>
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-input-background px-3">
                <Hash aria-hidden="true" className="h-4 w-4 shrink-0 text-white/55" />
                <input
                  aria-label="Add profile tag"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
                  disabled={normalizedProfile.tags.length >= profileTagLimit}
                  id="profile-tags"
                  maxLength={25}
                  onChange={(event) => {
                    setProfileTagDraft(event.target.value);
                    setProfileTagError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addProfileTag();
                  }}
                  placeholder="#tag"
                  value={profileTagDraft}
                />
                <button
                  className="text-sm font-semibold text-white/72 disabled:opacity-35"
                  disabled={!normalizeProfileTag(profileTagDraft) || normalizedProfile.tags.includes(normalizeProfileTag(profileTagDraft)) || normalizedProfile.tags.length >= profileTagLimit}
                  onClick={addProfileTag}
                  type="button"
                >
                  Add
                </button>
              </div>
              {profileTagError ? <p className="text-sm text-destructive">{profileTagError}</p> : null}
              {normalizedProfile.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2" data-testid="profile-tags-draft">
                  {normalizedProfile.tags.map((tag) => (
                    <button
                      aria-label={`Remove #${tag}`}
                      className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-black/55 px-2.5 py-1 text-xs text-white/72"
                      key={tag}
                      onClick={() => handleChange('tags', normalizedProfile.tags.filter((profileTag) => profileTag !== tag))}
                      type="button"
                    >
                      #{tag}
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="signal">
                Signal <span className="text-muted-foreground">{SIGNAL_MAX_LENGTH} characters max</span>
              </Label>
              <Input
                id="signal"
                maxLength={SIGNAL_MAX_LENGTH}
                placeholder="A short hover note for your map pin"
                value={normalizedProfile.signal}
                onChange={(e) => handleChange('signal', e.target.value)}
                className="bg-input-background"
              />
              <p className="text-xs text-muted-foreground">This appears when someone hovers over your heart pin on the map.</p>
            </div>

            <div className="space-y-2" id="profile-vibes">
              <Label>Vibes</Label>
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="Vibes"
                maxSelections={MAX_PROFILE_VIBES}
                optionGroups={VIBE_GROUPS}
                value={normalizedProfile.vibes}
                onChange={(vals) => handleChange('vibes', limitToThree(vals))}
              />
            </div>

            <div className="space-y-2">
              <Label>Pronouns</Label>
              <MultiSelect {...profileMenuProps} maxSelections={MAX_PROFILE_GROUP_SELECTIONS} options={PRONOUNS} value={normalizedProfile.pronouns} onChange={(vals) => handleChange('pronouns', limitToThree(vals))} />
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
                <select className={DROPDOWN_TRIGGER_CLASS} value={normalizedProfile.ethnicity} onChange={e => handleChange('ethnicity', e.target.value)}>
                  <option value="">Select...</option>
                  {ETHNICITIES.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Zodiac</Label>
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="Zodiac"
                maxSelections={1}
                options={ZODIAC}
                value={normalizedProfile.zodiac}
                onChange={(vals) => handleChange('zodiac', vals.slice(-1))}
              />
            </div>

            <div className="space-y-2">
              <Label>Gender Identities</Label>
              <MultiSelect
                {...profileMenuProps}
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
              <MultiSelect {...profileMenuProps} maxSelections={MAX_PROFILE_GROUP_SELECTIONS} options={PRESENTATIONS} value={normalizedProfile.presentation} onChange={(vals) => handleChange('presentation', limitToThree(vals))} />
              <p className="text-xs text-muted-foreground">Select up to 3</p>
            </div>

            <div className="space-y-2">
              <Label>Sexuality</Label>
              <MultiSelect {...profileMenuProps} maxSelections={MAX_PROFILE_SEXUALITIES} options={SEXUALITY} value={normalizedProfile.sexuality} onChange={(vals) => handleChange('sexuality', limitToThree(vals))} />
              <p className="text-xs text-muted-foreground">Select up to {MAX_PROFILE_SEXUALITIES}</p>
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
                <Label>Crowds</Label>
                <MultiSelect
                  {...profileMenuProps}
                  ariaLabel="Crowds"
                  maxSelections={MAX_PROFILE_GROUP_SELECTIONS}
                  options={normalizedProfile.is_trans === true ? CROWDS : CROWDS.filter((crowd) => crowd !== 'T4T')}
                  value={normalizedProfile.crowds}
                  onChange={handleCrowdsChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Body Type</Label>
              <MultiSelect {...profileMenuProps} ariaLabel="Body Type" maxSelections={MAX_PROFILE_GROUP_SELECTIONS} options={BODY_TYPES} value={normalizedProfile.body_type} onChange={(vals) => handleChange('body_type', limitToThree(vals))} />
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
              <MultiSelect {...profileMenuProps} ariaLabel="Hobbies" maxSelections={MAX_PROFILE_HOBBIES} optionGroups={HOBBY_GROUPS} value={normalizedProfile.hobbies} onChange={(vals) => handleChange('hobbies', limitToThree(vals))} />
            </div>
          </TabsContent>

          <TabsContent value="intimacy" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Relationship status</Label>
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="Relationship status"
                maxSelections={MAX_PROFILE_GROUP_SELECTIONS}
                options={RELATIONSHIP_STATUS}
                value={normalizedProfile.relationship_status}
                onChange={(vals) => handleChange('relationship_status', limitToThree(vals))}
              />
            </div>

            <div className="space-y-2">
              <Label>Looking For</Label>
              <MultiSelect {...profileMenuProps} maxSelections={MAX_PROFILE_GROUP_SELECTIONS} options={LOOKING_FOR} value={normalizedProfile.looking_for} onChange={(vals) => handleChange('looking_for', limitToThree(vals))} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Position</Label>
                <MultiSelect
                  {...profileMenuProps}
                  ariaLabel="Position"
                  maxSelections={MAX_PROFILE_GROUP_SELECTIONS}
                  options={POSITIONS}
                  value={normalizedProfile.position}
                  onChange={(vals) => handleChange('position', limitToThree(vals))}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <MultiSelect
                  {...profileMenuProps}
                  ariaLabel="Role"
                  maxSelections={MAX_PROFILE_GROUP_SELECTIONS}
                  options={ROLES}
                  value={normalizedProfile.role}
                  onChange={(vals) => handleChange('role', limitToThree(vals))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Availability</Label>
              <MultiSelect {...profileMenuProps} maxSelections={MAX_PROFILE_GROUP_SELECTIONS} options={AVAILABILITY} value={normalizedProfile.availability} onChange={vals => handleChange('availability', limitToThree(vals))} />
            </div>
            <div className="space-y-2">
              <Label>Hosting/Travel</Label>
              <MultiSelect {...profileMenuProps} maxSelections={MAX_PROFILE_GROUP_SELECTIONS} options={HOSTING} value={normalizedProfile.hosting_travel} onChange={vals => handleChange('hosting_travel', limitToThree(vals))} />
            </div>
            <div className="space-y-2">
              <Label>Preferred spots</Label>
              <MultiSelect {...profileMenuProps} maxSelections={MAX_PROFILE_GROUP_SELECTIONS} options={PREFERRED_SPOTS} value={normalizedProfile.preferred_spots} onChange={vals => handleChange('preferred_spots', limitToThree(vals))} />
            </div>

            <div className="space-y-2" id="profile-kinks">
              <Label>Kinks & Fetishes</Label>
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="Kinks & Fetishes"
                maxSelections={Number.isFinite(kinkLimit) ? kinkLimit : undefined}
                optionGroups={KINK_GROUPS}
                searchable
                value={normalizedProfile.kinks}
                onChange={handleKinksChange}
              />
              <p className="text-xs text-muted-foreground">Basic includes 3. cruush+ has no profile kink limit.</p>
            </div>
            <div className="space-y-2">
              <Label>Kinks & Fetishes visibility</Label>
              <MultiSelect
                {...profileMenuProps}
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
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="HIV Status"
                options={HIV_STATUS}
                value={normalizedProfile.hiv_status}
                onChange={vals => handleChange('hiv_status', singleValue(vals))}
                selectionMode="single"
              />
            </div>
            <div className="space-y-2">
              <Label>Protections</Label>
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="Protections"
                options={PROTECTIONS}
                value={normalizedProfile.protections}
                onChange={vals => handleChange('protections', vals)}
              />
            </div>
            <div className="space-y-2">
              <Label>Substance Boundaries</Label>
              <p className="text-sm text-muted-foreground">Select anything you do not want involved when meeting.</p>
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="Substance Boundaries"
                options={SUBSTANCE_BOUNDARIES}
                value={normalizedProfile.substance_boundaries}
                onChange={vals => handleChange('substance_boundaries', vals)}
              />
            </div>
            <div className="space-y-2">
              <Label>Protection boundaries</Label>
              <MultiSelect
                {...profileMenuProps}
                ariaLabel="Protection boundaries"
                options={PROTECTION_BOUNDARIES}
                value={normalizedProfile.protection_boundaries}
                onChange={vals => handleChange('protection_boundaries', singleValue(vals))}
                selectionMode="single"
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
