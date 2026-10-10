import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { resolveMediaUrl } from '../lib/apiClient';
import type { FeedPhoto } from '../lib/postApi';
import ReportAction from './ReportAction';

type FeedPhotoViewerProps = {
  photos: readonly FeedPhoto[];
  index: number;
  postId: string;
  authorName: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

export default function FeedPhotoViewer({
  photos,
  index,
  postId,
  authorName,
  onIndexChange,
  onClose,
}: FeedPhotoViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A Report dialog is portaled outside this viewer and owns its own keys.
    if (!(event.target instanceof Node) || !viewerRef.current?.contains(event.target)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (photos.length > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      onIndexChange((index + direction + photos.length) % photos.length);
    } else if (event.key === 'Tab') {
      const buttons = Array.from(viewerRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  const photo = photos[index];
  if (!photo) {
    return null;
  }

  return (
    <div
      aria-label="Confessional photo viewer"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/96 p-4"
      data-testid="feed-photo-viewer"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      ref={viewerRef}
      role="dialog"
    >
      <div className="relative flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <img
          alt={`Confessional photo ${index + 1} by ${authorName}`}
          className="max-h-full max-w-full rounded-xl object-contain"
          src={resolveMediaUrl(photo.url)}
        />
        <div className="absolute right-2 top-2 flex items-center gap-2">
          <ReportAction
            className="h-10 w-10 rounded-full border border-white/20 bg-black/78 text-white hover:bg-white/10"
            dialogClassName="z-[130] scrollbar-hide"
            iconOnly
            label="Report Confessional photo"
            size="icon"
            targetId={postId}
            targetLabel={`photo by ${authorName}`}
            targetType="post"
            variant="ghost"
          />
          <button
            aria-label="Close Confessional photo"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/78 text-white transition hover:bg-white/10"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {photos.length > 1 ? (
          <>
            <button
              aria-label="Previous Confessional photo"
              className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition hover:bg-white/10"
              onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
              type="button"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              aria-label="Next Confessional photo"
              className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition hover:bg-white/10"
              onClick={() => onIndexChange((index + 1) % photos.length)}
              type="button"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
