import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import type { FeedPhoto } from '../lib/postApi';
import { shouldMaskPhoto, getNsfwPhotoRestriction, type DlModePhotoRelationship } from '../lib/dlMode';

type FeedAttachmentPreviewProps = {
  photos: readonly FeedPhoto[];
  dlModeActive: boolean;
  borderColor?: string;
  relationship?: DlModePhotoRelationship;
  onOpen: (index: number) => void;
};

function PhotoHeart({ photo, index, dlModeActive, borderColor, relationship, className, onOpen }: {
  photo: FeedPhoto;
  index: number;
  dlModeActive: boolean;
  borderColor?: string;
  relationship?: DlModePhotoRelationship;
  className: string;
  onOpen: (index: number) => void;
}) {
  const masked = shouldMaskPhoto(dlModeActive, photo.explicit, relationship);
  return (
    <HeartPhoto
      borderColor={borderColor}
      className={className}
      fallback={<CruushIcon name="camera" className="h-3.5 w-3.5 opacity-35" />}
      label={masked ? `Confessional photo ${index + 1} hidden by DL Mode` : `Open Confessional photo ${index + 1}`}
      masked={masked}
      restriction={getNsfwPhotoRestriction(photo.explicit, relationship)}
      onClick={masked ? undefined : () => onOpen(index)}
      photo={photo.thumbnailUrl || photo.url}
      theme="nearby"
      userId={photo.id}
    />
  );
}

export default function FeedAttachmentPreview({ photos, dlModeActive, borderColor, relationship, onOpen }: FeedAttachmentPreviewProps) {
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
          borderColor={borderColor}
          className="h-16 w-16 shrink-0"
          dlModeActive={dlModeActive}
          relationship={relationship}
          index={index}
          key={photo.id}
          onOpen={onOpen}
          photo={photo}
        />
      ))}
    </div>
  );
}
