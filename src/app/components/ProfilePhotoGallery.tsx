import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import CruushIconImage from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { resolveMediaUrl } from '../lib/apiClient';
import { PROFILE_HERO_ASPECT_STYLE, PROFILE_HERO_MEDIA_STYLE, PROFILE_HERO_VIEWPORT_STYLE } from '../lib/photoLayout';
import { useDlMode, shouldMaskPhoto, getNsfwPhotoRestriction, type DlModePhotoRelationship } from '../lib/dlMode';
import { getProfileGradientCss } from '../lib/profileGradient';
import type { ProfilePhotoMetadata } from '../lib/profileApi';
import type { HeartPinTheme } from '../lib/heartPin';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import DlModePhotoPlaceholder from './DlModePhotoPlaceholder';
import type { UserBorderTone } from '../lib/userBorderTone';

interface ProfilePhotoGalleryProps {
  fitViewport?: boolean;
  relationship?: DlModePhotoRelationship;
  fallbackLabel?: string;
  name: string;
  onExpandPhoto?: (photo: string) => void;
  photos: string[];
  photoMetadata?: ProfilePhotoMetadata[];
  reportTargetUserId?: string;
  theme?: HeartPinTheme;
  borderTone?: UserBorderTone;
  userId?: string | null;
}

export default function ProfilePhotoGallery({
  fitViewport = false,
  relationship,
  fallbackLabel = 'Profile photo',
  name,
  onExpandPhoto,
  photoMetadata = [],
  photos,
  reportTargetUserId,
  theme = 'nearby',
  borderTone,
  userId = null,
}: ProfilePhotoGalleryProps) {
  const visiblePhotos = useMemo(() => photos.slice(0, 4), [photos]);
  const [activeIndex, setActiveIndex] = useState(0);
  const dlModeActive = useDlMode();
  const photoMetadataByUrl = useMemo(() => new Map(
    photoMetadata.map((metadata) => [metadata.url, metadata.explicit]),
  ), [photoMetadata]);

  useEffect(() => {
    if (activeIndex >= visiblePhotos.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, visiblePhotos.length]);

  const activePhoto = visiblePhotos[activeIndex] ?? null;
  const activePhotoMasked = Boolean(activePhoto && shouldMaskPhoto(dlModeActive, photoMetadataByUrl.get(activePhoto), relationship));
  const previewPhotos = visiblePhotos
    .map((photo, index) => ({
      index,
      photo,
    }))
    .filter((item) => item.index !== activeIndex)
    .slice(0, 3);
  const mediaStyle = fitViewport ? PROFILE_HERO_VIEWPORT_STYLE : PROFILE_HERO_MEDIA_STYLE;

  return (
    <div
      data-testid="profile-hero-media"
      className="relative w-full overflow-hidden"
      style={{ ...mediaStyle, background: 'var(--cruush-gradient)' }}
    >
      {activePhoto && !activePhotoMasked ? (
        onExpandPhoto ? (
          // Tapping the photo hands it to the full screen viewer, where it is
          // shown on its own with nothing written over it.
          <button
            aria-label={`Show ${name}'s photo full screen`}
            className="block h-full w-full border-0 bg-transparent p-0"
            data-testid="profile-photo-expand"
            onClick={() => onExpandPhoto(activePhoto)}
            type="button"
          >
            <img
              src={resolveMediaUrl(activePhoto)}
              alt={name}
              className="h-full w-full object-cover"
              style={PROFILE_HERO_ASPECT_STYLE}
            />
          </button>
        ) : (
          <img
            src={resolveMediaUrl(activePhoto)}
            alt={name}
            className="h-full w-full object-cover"
            style={PROFILE_HERO_ASPECT_STYLE}
          />
        )
      ) : activePhotoMasked ? (
        <div
          aria-label={name}
          className="flex h-full w-full items-center justify-center"
          role="img"
          style={{ ...PROFILE_HERO_ASPECT_STYLE, background: getProfileGradientCss(userId ?? activePhoto) }}
        >
          <DlModePhotoPlaceholder restriction={getNsfwPhotoRestriction(activePhoto ? photoMetadataByUrl.get(activePhoto) : false, relationship)} />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <CruushIconImage src={cruushIconWhite} className="h-24 w-24 opacity-20" />
        </div>
      )}

      {previewPhotos.length > 0 ? (
        <div
          className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col sm:right-4"
          style={{ gap: 'clamp(0.375rem, 1.25dvh, 0.75rem)' }}
        >
          {previewPhotos.map(({ index, photo }) => (
            <button
              key={photo}
              type="button"
              aria-label={`Show profile photo ${index + 1}`}
              onClick={() => setActiveIndex(index)}
              className="flex items-center justify-center overflow-visible border-0 bg-transparent p-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.42)] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              style={{
                height: 'clamp(3.25rem, 10.5dvh, 4.75rem)',
                width: 'clamp(3.25rem, 10.5dvh, 4.75rem)',
              }}
            >
              <HeartPhoto
                borderTone={borderTone}
                label={`${fallbackLabel} ${index + 1}`}
                restriction={getNsfwPhotoRestriction(photoMetadataByUrl.get(photo), relationship)}
                masked={shouldMaskPhoto(dlModeActive, photoMetadataByUrl.get(photo), relationship)}
                photo={photo}
                className="h-full w-full"
                theme={theme}
                userId={userId ?? photo}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
