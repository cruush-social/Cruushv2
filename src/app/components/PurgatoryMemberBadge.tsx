import { useId, useRef, useState } from 'react';
import purgatoryMemberApproved from '../assets/ui-icons/purgatory-member-approved.png';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const glyphSizes = {
  profile: 'h-14 w-14',
  card: 'h-10 w-10',
  map: 'h-5 w-5',
} as const;

export default function PurgatoryMemberBadge({ size = 'profile' }: {
  size?: keyof typeof glyphSizes;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const touchFocusRef = useRef(false);
  const backgroundMaskId = `purgatory-background-${useId().replace(/:/g, '')}`;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="pointer-events-auto ml-2 shrink-0 touch-manipulation"
          aria-label="This is a Purgatory member."
          aria-expanded={open}
          onPointerDown={(event) => {
            touchFocusRef.current = event.pointerType === 'touch';
          }}
          onPointerCancel={() => { touchFocusRef.current = false; }}
          onFocus={(event) => {
            // Mobile browsers may focus after pointerup but before click.
            // Let that tap open once; keep keyboard focus opening unchanged.
            if (touchFocusRef.current) event.preventDefault();
          }}
          onPointerLeave={(event) => {
            // Touch pointers leave after lifting the finger, before the click.
            // Only a mouse leaving should invoke TooltipTrigger's hover close.
            if (event.pointerType === 'touch') event.preventDefault();
          }}
          onClick={(event) => {
            // Keep Radix's hover/focus behavior, but let a touch tap toggle the
            // explanation instead of invoking TooltipTrigger's click-to-close.
            event.preventDefault();
            event.stopPropagation();
            touchFocusRef.current = false;
            setOpen((current) => !current);
          }}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            className={glyphSizes[size]}
            viewBox="194 82 960 960"
          >
            <defs>
              {/* Keep the approved raster's colors and geometry. Remove only
                  its near-black canvas, framing its painted height like MHC. */}
              <filter id={backgroundMaskId} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 1 1 0 0" />
                <feComponentTransfer>
                  <feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1" />
                </feComponentTransfer>
                <feComposite in="SourceGraphic" operator="in" />
              </filter>
            </defs>
            <image href={purgatoryMemberApproved} width="1374" height="1145" filter={`url(#${backgroundMaskId})`} />
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[calc(100vw-1rem)]"
        onPointerDownOutside={(event) => {
          // The trigger is outside the portaled content. Let its click toggle
          // the current state instead of dismissing first and reopening it.
          if (triggerRef.current?.contains(event.detail.originalEvent.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        This is a Purgatory member. They are currently outside cruush’s service area.
      </TooltipContent>
    </Tooltip>
  );
}
