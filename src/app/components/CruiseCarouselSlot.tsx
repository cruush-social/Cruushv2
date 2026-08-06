import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';
import { CruushIcon, type CruushIconName } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import { resolveMediaUrl } from '../lib/apiClient';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import type { DiscoveryUser } from '../lib/usersApi';

export type CruiseCarouselSlotMode = 'profile' | 'locked' | 'empty';
export type CruiseCarouselSlotVariant = 'panel' | 'page';

type CarouselItem =
  | {
      kind: 'icon';
      icon: CruushIconName;
      label: string;
    }
  | {
      kind: 'profile';
      user: DiscoveryUser;
      label: string;
    };

type CruiseCarouselSlotProps = {
  mode: CruiseCarouselSlotMode;
  variant: CruiseCarouselSlotVariant;
  targetUser?: DiscoveryUser | null;
  onClose?: () => void;
  onComplete?: () => void;
  onRetry?: () => void;
  onUpgrade?: () => void;
  browseDurationMs?: number;
};

const DEFAULT_BROWSE_DURATION_MS = 1100;
const FEATURED_ITEM_INDEX = 2;

const CAROUSEL_ICONS: CarouselItem[] = [
  { kind: 'icon', icon: 'cruush', label: 'cruush' },
  { kind: 'icon', icon: 'lucky', label: 'lucky' },
  { kind: 'icon', icon: 'map', label: 'map' },
  { kind: 'icon', icon: 'profile', label: 'profile' },
  { kind: 'icon', icon: 'messages', label: 'messages' },
  { kind: 'icon', icon: 'feed', label: 'feed' },
  { kind: 'icon', icon: 'ghost', label: 'ghost mode' },
  { kind: 'icon', icon: 'visibility', label: 'visibility' },
];

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(media.matches);

    syncPreference();
    media.addEventListener?.('change', syncPreference);

    return () => {
      media.removeEventListener?.('change', syncPreference);
    };
  }, []);

  return prefersReducedMotion;
}

function makeBrowseItems(mode: CruiseCarouselSlotMode, targetUser?: DiscoveryUser | null) {
  const featuredItem: CarouselItem = mode === 'profile' && targetUser
    ? {
        kind: 'profile',
        user: targetUser,
        label: targetUser.name,
      }
    : mode === 'locked'
    ? { kind: 'icon', icon: 'cruush', label: 'cruush+' }
    : mode === 'empty'
    ? { kind: 'icon', icon: 'visibility', label: 'no profiles nearby' }
    : { kind: 'icon', icon: 'profile', label: 'nearby profile' };

  return [
    CAROUSEL_ICONS[2],
    CAROUSEL_ICONS[7],
    featuredItem,
    CAROUSEL_ICONS[3],
    CAROUSEL_ICONS[4],
  ];
}

function CarouselTile({ item, featured }: { item: CarouselItem; featured: boolean }) {
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const sizeClass = featured ? 'h-[6.25rem] w-[6.25rem]' : 'h-[5rem] w-[5rem]';
  const frameClass = featured
    ? 'border-white/34 bg-white/[0.12] shadow-[0_0_34px_rgba(255,0,114,0.26)]'
    : 'border-white/12 bg-white/[0.055]';

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  if (item.kind === 'profile') {
    const photo = item.user.photo && !shouldMaskPhoto(dlModeActive, item.user.photoExplicit)
      ? resolveMediaUrl(item.user.photo)
      : null;
    const initial = item.user.name.trim().charAt(0).toUpperCase() || '?';

    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-[1.375rem] border ${frameClass} transition-all duration-500`}
      >
        {photo ? (
          <img
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            draggable={false}
            src={photo}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-white" style={{ background: 'var(--cruush-gradient)' }}>
            {initial}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-[1.375rem] border ${frameClass} transition-all duration-500`}
    >
      <CruushIcon name={item.icon} className={featured ? 'h-12 w-12' : 'h-10 w-10'} variant={featured ? 'colored' : 'white'} />
    </div>
  );
}

export default function CruiseCarouselSlot({
  mode,
  variant,
  targetUser = null,
  onClose,
  onComplete,
  onRetry,
  onUpgrade,
  browseDurationMs = DEFAULT_BROWSE_DURATION_MS,
}: CruiseCarouselSlotProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [settled, setSettled] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setSettled(false);

    const duration = prefersReducedMotion ? 140 : browseDurationMs;
    const timer = window.setTimeout(() => {
      setSettled(true);
      if (mode === 'profile') {
        onCompleteRef.current?.();
      }
    }, duration);

    return () => {
      window.clearTimeout(timer);
    };
  }, [browseDurationMs, mode, prefersReducedMotion, targetUser?.id]);

  const browseItems = useMemo(
    () => makeBrowseItems(mode, targetUser),
    [mode, targetUser],
  );

  const title = mode === 'profile'
    ? 'browsing nearby profiles'
    : mode === 'locked'
    ? 'cruise carousel is a cruush+ feature'
    : 'no profiles nearby';
  const description = mode === 'profile'
    ? targetUser
      ? `Found ${targetUser.name} nearby.`
      : 'Looking for someone nearby.'
    : mode === 'locked'
    ? <>Browse nearby profiles with <CruushPlusWord />.</>
    : 'No eligible nearby profiles are available right now.';

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">cruise carousel</p>
          <h2 className={`${variant === 'page' ? 'text-3xl' : 'text-2xl'} text-white`}>{title}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-sm transition hover:text-white"
            aria-label="Close cruise carousel"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className={`${variant === 'page' ? 'px-3 sm:px-6' : 'px-4'} flex-1`}>
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/55 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.4)]">
          <div className="pointer-events-none absolute inset-y-4 left-0 z-10 w-14 bg-gradient-to-r from-black/75 to-transparent" />
          <div className="pointer-events-none absolute inset-y-4 right-0 z-10 w-14 bg-gradient-to-l from-black/75 to-transparent" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[7rem] w-[7rem] -translate-x-1/2 -translate-y-1/2 rounded-[1.65rem] border border-white/18 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
          <div className="relative flex h-[9rem] items-center justify-center overflow-hidden" aria-hidden="true">
            <div className={`flex items-center gap-3 transition-transform duration-500 ease-out ${settled ? '' : 'cruise-carousel-browse'}`}>
              {browseItems.map((item, itemIndex) => (
                <CarouselTile
                  key={`${item.kind}-${item.kind === 'icon' ? item.icon : item.user.id}-${itemIndex}`}
                  item={item}
                  featured={settled && itemIndex === FEATURED_ITEM_INDEX}
                />
            ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center" aria-live="polite">
          <p className="text-sm text-white/78">{settled ? description : 'Browsing nearby profiles...'}</p>
          {settled && mode === 'locked' ? (
            <Button
              type="button"
              className="mt-4 h-11 rounded-xl text-white"
              style={{ background: 'var(--cruush-gradient)' }}
              onClick={onUpgrade}
            >
              <Lock className="h-4 w-4" />
              Get <CruushPlusWord />
            </Button>
          ) : null}
          {settled && mode === 'empty' && onRetry ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-11 rounded-xl border-white/18 text-white"
              onClick={onRetry}
            >
              <RefreshCw className="h-4 w-4" />
              Browse again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (variant === 'panel') {
    return (
      <aside
        aria-label="cruise carousel"
        className="absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-6 top-[8.75rem] z-50 hidden w-[23rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[28px] border border-white/10 bg-black/84 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl lg:block"
      >
        {content}
      </aside>
    );
  }

  return (
    <section
      aria-label="cruise carousel"
      className="mx-auto w-full max-w-2xl rounded-[28px] border border-white/10 bg-black/78 shadow-[0_24px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl"
    >
      {content}
    </section>
  );
}
