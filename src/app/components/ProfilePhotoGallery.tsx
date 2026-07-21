import { useEffect, useMemo, useState } from 'react';
import CruushIconImage from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { resolveMediaUrl } from '../lib/apiClient';
import { PROFILE_HERO_ASPECT_STYLE } from '../lib/photoLayout';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import ReportAction from './ReportAction';

interface ProfilePhotoGalleryProps {
  fallbackLabel?: string;
  name: string;
  photos: string[];
  reportTargetUserId?: string;
}

export default function ProfilePhotoGallery({
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

  return (
    <div
      data-testid="profile-hero-media"
      className="relative w-full overflow-hidden"
      style={{ ...PROFILE_HERO_ASPECT_STYLE, background: 'var(--cruush-gradient)' }}
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
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2 sm:right-4 sm:gap-3">
          {previewPhotos.map(({ index, photo }) => (
            <button
              key={photo}
              type="button"
              aria-label={`Show profile photo ${index + 1}`}
              onClick={() => setActiveIndex(index)}
              className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/45 p-1 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:h-16 sm:w-16"
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
