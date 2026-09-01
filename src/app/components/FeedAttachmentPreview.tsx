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

  return (
    <div
      className="flex items-center gap-2"
      data-testid={`feed-photo-preview-${visiblePhotos.length === 1 ? 'one' : visiblePhotos.length === 2 ? 'two' : 'three'}`}
    >
      {visiblePhotos.map((photo, index) => (
        <PhotoHeart
          className="h-16 w-16 shrink-0"
          dlModeActive={dlModeActive}
          index={index}
          key={photo.id}
          onOpen={onOpen}
          photo={photo}
        />
      ))}
    </div>
  );
}
