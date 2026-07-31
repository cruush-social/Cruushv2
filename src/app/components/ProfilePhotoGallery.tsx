import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import CruushIconImage from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { resolveMediaUrl } from '../lib/apiClient';
import { PROFILE_HERO_ASPECT_STYLE, PROFILE_HERO_MEDIA_STYLE, PROFILE_HERO_VIEWPORT_STYLE } from '../lib/photoLayout';
import { addDlModeChangedListener, isDlModeEnabled } from '../lib/dlMode';
import { getProfileGradientCss } from '../lib/profileGradient';
import type { ProfilePhotoMetadata } from '../lib/profileApi';
import type { HeartPinTheme } from '../lib/heartPin';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import ReportAction from './ReportAction';

interface ProfilePhotoGalleryProps {
  fitViewport?: boolean;
  fallbackLabel?: string;
  name: string;
  photos: string[];
  photoMetadata?: ProfilePhotoMetadata[];
  reportTargetUserId?: string;
  theme?: HeartPinTheme;
  userId?: string | null;
}

export default function ProfilePhotoGallery({
  fitViewport = false,
  fallbackLabel = 'Profile photo',
  name,
  photoMetadata = [],
  photos,
  reportTargetUserId,
  theme = 'nearby',
  userId = null,
}: ProfilePhotoGalleryProps) {
  const visiblePhotos = useMemo(() => photos.slice(0, 4), [photos]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const explicitPhotoUrls = useMemo(() => new Set(
    photoMetadata
      .filter((metadata) => metadata.explicit)
      .map((metadata) => metadata.url)
  ), [photoMetadata]);

  useEffect(() => {
    if (activeIndex >= visiblePhotos.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, visiblePhotos.length]);
  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  const activePhoto = visiblePhotos[activeIndex] ?? null;
  const activePhotoMasked = Boolean(activePhoto && dlModeActive && explicitPhotoUrls.has(activePhoto));
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
        <img
          src={resolveMediaUrl(activePhoto)}
          alt={name}
          className="h-full w-full object-cover"
          style={PROFILE_HERO_ASPECT_STYLE}
        />
      ) : activePhotoMasked ? (
        <div
          aria-label={name}
          className="flex h-full w-full items-center justify-center"
          role="img"
          style={{ ...PROFILE_HERO_ASPECT_STYLE, background: getProfileGradientCss(userId ?? activePhoto) }}
        >
          <Eye className="h-12 w-12 text-white/80" strokeWidth={2.35} />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <CruushIconImage src={cruushIconWhite} className="h-24 w-24 opacity-15" />
        </div>
      )}

      {activePhoto && reportTargetUserId ? (
        <div className="absolute bottom-3 left-3 rounded-full bg-black/55 backdrop-blur-sm">
          <ReportAction
            targetType="profile_photo"
            targetId={activePhoto}
            targetUserId={reportTargetUserId}
            targetLabel={`photo ${activeIndex + 1} from ${name}`}
            label="Report this profile photo"
          />
        </div>
      ) : null}

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
                height: 'clamp(2.75rem, 9dvh, 4rem)',
                width: 'clamp(2.75rem, 9dvh, 4rem)',
              }}
            >
              <HeartPhoto
                label={`${fallbackLabel} ${index + 1}`}
                masked={dlModeActive && explicitPhotoUrls.has(photo)}
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
