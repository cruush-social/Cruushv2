import { useId, useRef, useState } from 'react';
import { Link, useInRouterContext } from 'react-router';
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
  const inRouter = useInRouterContext();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const touchFocusRef = useRef(false);
  const guideLinkRef = useRef<HTMLAnchorElement>(null);
  const backgroundMaskId = `purgatory-background-${useId().replace(/:/g, '')}`;
  const explanation = <>
    <span className="block">This is a Purgatory member. They are </span>
    <span className="block">currently outside cruush’s service area.</span>
  </>;

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
          onBlur={(event) => {
            if (guideLinkRef.current?.contains(event.relatedTarget as Node)) event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Tab' && !event.shiftKey && open) {
              const link = guideLinkRef.current;
              if (link) {
                event.preventDefault();
                link.focus();
              }
            }
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
        onBlur={(event) => {
          if (!guideLinkRef.current?.contains(event.relatedTarget as Node) && event.relatedTarget !== triggerRef.current) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          triggerRef.current?.focus();
          if (event.shiftKey) event.preventDefault();
          else setOpen(false);
        }}
        aria-label="This is a Purgatory member. They are currently outside cruush’s service area."
        side="top"
        sideOffset={6}
        className="max-w-[calc(100vw-1rem)] pr-2 text-left [text-wrap:wrap]"
        onPointerDownOutside={(event) => {
          // The trigger is outside the portaled content. Let its click toggle
          // the current state instead of dismissing first and reopening it.
          if (triggerRef.current?.contains(event.detail.originalEvent.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        {inRouter ? (
          <Link ref={guideLinkRef} to="/purgatory" className="block text-inherit no-underline" onClick={(event) => { event.stopPropagation(); setOpen(false); }}>{explanation}</Link>
        ) : (
          <a ref={guideLinkRef} href="/purgatory" className="block text-inherit no-underline" onClick={(event) => event.stopPropagation()}>{explanation}</a>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
