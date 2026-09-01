import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import type { FeedPhoto } from '../lib/postApi';

type FeedAttachmentPreviewProps = {
  photos: readonly FeedPhoto[];
  dlModeActive: boolean;
  onOpen: (index: number) => void;
};

function PhotoHeart({ photo, index, dlModeActive, className, onOpen }: {
  photo: FeedPhoto;
  index: number;
  dlModeActive: boolean;
  className: string;
  onOpen: (index: number) => void;
}) {
  const masked = dlModeActive && photo.explicit;
  return (
    <HeartPhoto
      className={className}
      fallback={<CruushIcon name="camera" className="h-3.5 w-3.5 opacity-35" />}
      label={masked ? `Feed photo ${index + 1} hidden by DL Mode` : `Open Feed photo ${index + 1}`}
      masked={masked}
      onClick={masked ? undefined : () => onOpen(index)}
      photo={photo.thumbnailUrl || photo.url}
      theme="nearby"
      userId={photo.id}
    />
  );
}

export default function FeedAttachmentPreview({ photos, dlModeActive, onOpen }: FeedAttachmentPreviewProps) {
  const visiblePhotos = photos.slice(0, 3);
  if (visiblePhotos.length === 0) {
    return null;
  }

  if (visiblePhotos.length === 1) {
    return (
      <div className="flex items-center" data-testid="feed-photo-preview-one">
        <PhotoHeart photo={visiblePhotos[0]} index={0} dlModeActive={dlModeActive} className="h-14 w-14" onOpen={onOpen} />
      </div>
    );
  }

  if (visiblePhotos.length === 2) {
    return (
      <div className="flex items-center" data-testid="feed-photo-preview-two">
        {visiblePhotos.map((photo, index) => (
          <div className={index === 0 ? '' : '-ml-2'} key={photo.id}>
            <PhotoHeart photo={photo} index={index} dlModeActive={dlModeActive} className="h-14 w-14" onOpen={onOpen} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative h-[4.75rem] w-[6.75rem]" data-testid="feed-photo-preview-three">
      <div className="absolute left-0 top-0 z-[1]">
        <PhotoHeart photo={visiblePhotos[0]} index={0} dlModeActive={dlModeActive} className="h-12 w-12" onOpen={onOpen} />
      </div>
      <div className="absolute left-10 top-0 z-[1]">
        <PhotoHeart photo={visiblePhotos[1]} index={1} dlModeActive={dlModeActive} className="h-12 w-12" onOpen={onOpen} />
      </div>
      <div className="absolute bottom-0 left-5 z-[2]">
        <PhotoHeart photo={visiblePhotos[2]} index={2} dlModeActive={dlModeActive} className="h-12 w-12" onOpen={onOpen} />
      </div>
    </div>
  );
}
