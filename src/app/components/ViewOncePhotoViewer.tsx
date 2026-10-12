import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ViewOncePhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div
      aria-label="View-once photo viewer"
      aria-modal="true"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/96 p-4"
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <div className="relative flex h-full w-full items-center justify-center">
        <img alt="View-once photo" className="max-h-full max-w-full rounded-xl object-contain" src={url} />
        <button
          aria-label="Close view-once photo"
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/78 text-white transition hover:bg-white/10"
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
