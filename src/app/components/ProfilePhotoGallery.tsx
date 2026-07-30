import { useEffect, useMemo, useState } from 'react';
import CruushIconImage from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { resolveMediaUrl } from '../lib/apiClient';
import { PROFILE_HERO_ASPECT_STYLE, PROFILE_HERO_MEDIA_STYLE, PROFILE_HERO_VIEWPORT_STYLE } from '../lib/photoLayout';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import ReportAction from './ReportAction';

interface ProfilePhotoGalleryProps {
  fitViewport?: boolean;
  fallbackLabel?: string;
  name: string;
  photos: string[];
  reportTargetUserId?: string;
}

export default function ProfilePhotoGallery({
  fitViewport = false,
  fallbackLabel = 'Profile photo',
  name,
  photos,
  reportTargetUserId,
}: ProfilePhotoGalleryProps) {
  const visiblePhotos = useMemo(() => photos.slice(0, 4), [photos]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= visiblePhotos.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, visiblePhotos.length]);

  const activePhoto = visiblePhotos[activeIndex] ?? null;
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
      {activePhoto ? (
        <img
          src={resolveMediaUrl(activePhoto)}
          alt={name}
          className="h-full w-full object-cover"
          style={PROFILE_HERO_ASPECT_STYLE}
        />
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
              className="flex items-center justify-center rounded-full border border-white/25 bg-black/45 p-1 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              style={{
                height: 'clamp(2.75rem, 9dvh, 4rem)',
                width: 'clamp(2.75rem, 9dvh, 4rem)',
              }}
            >
              <HeartPhoto
                label={`${fallbackLabel} ${index + 1}`}
                photo={photo}
                className="h-full w-full"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
