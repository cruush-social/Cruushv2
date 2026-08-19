import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';
import { CruushIcon, type CruushIconName } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import HeartPhoto from './HeartPhoto';
import { resolveMediaUrl } from '../lib/apiClient';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import type { DiscoveryUser } from '../lib/usersApi';
import { ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, shouldReduceMotion } from '../lib/accessibilityPreferences';

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
  candidateUsers?: DiscoveryUser[];
  targetUser?: DiscoveryUser | null;
  onClose?: () => void;
  onComplete?: () => void;
  onRetry?: () => void;
  onUpgrade?: () => void;
  browseDurationMs?: number;
};

const DEFAULT_BROWSE_DURATION_MS = 2400;
const FEATURED_ITEM_INDEX = 2;
const PROFILE_CYCLE_START_INTERVAL_MS = 70;
const PROFILE_CYCLE_END_INTERVAL_MS = 280;

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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(shouldReduceMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(shouldReduceMotion());

    syncPreference();
    media.addEventListener?.('change', syncPreference);
    window.addEventListener(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, syncPreference);

    return () => {
      media.removeEventListener?.('change', syncPreference);
      window.removeEventListener(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, syncPreference);
    };
  }, []);

  return prefersReducedMotion;
}

function uniqueProfileCandidates(candidateUsers: DiscoveryUser[], targetUser?: DiscoveryUser | null) {
  const candidatesById = new Map<string, DiscoveryUser>();

  candidateUsers.forEach((user) => candidatesById.set(user.id, user));
  if (targetUser) {
    candidatesById.set(targetUser.id, targetUser);
  }

  return Array.from(candidatesById.values());
}

function makeProfileBrowseItems(
  candidateUsers: DiscoveryUser[],
  targetUser: DiscoveryUser,
  cycleStep: number,
  settled: boolean,
): CarouselItem[] {
  const profileCandidates = uniqueProfileCandidates(candidateUsers, targetUser);
  const targetIndex = Math.max(0, profileCandidates.findIndex((user) => user.id === targetUser.id));
  const startIndex = settled
    ? targetIndex - FEATURED_ITEM_INDEX
    : cycleStep;
  const orderedProfiles = Array.from({ length: profileCandidates.length }, (_, offset) => (
    profileCandidates[(startIndex + offset + profileCandidates.length * 2) % profileCandidates.length]
  ));
  const profileItems: CarouselItem[] = orderedProfiles.slice(0, 5).map((user) => ({
    kind: 'profile',
    user,
    label: user.name,
  }));

  const fallbackIcons = CAROUSEL_ICONS.filter((item) => item.kind === 'icon');
  if (settled) {
    const selectedItem: CarouselItem = { kind: 'profile', user: targetUser, label: targetUser.name };
    const otherItems = profileItems.filter((item) => item.kind !== 'profile' || item.user.id !== targetUser.id);
    const leftItems = otherItems.slice(0, FEATURED_ITEM_INDEX);
    const rightItems = otherItems.slice(FEATURED_ITEM_INDEX, 4);

    while (leftItems.length < FEATURED_ITEM_INDEX) {
      leftItems.unshift(fallbackIcons[leftItems.length % fallbackIcons.length]);
    }
    while (rightItems.length < 2) {
      rightItems.push(fallbackIcons[(FEATURED_ITEM_INDEX + rightItems.length) % fallbackIcons.length]);
    }

    return [...leftItems, selectedItem, ...rightItems];
  }

  while (profileItems.length < 5) {
    profileItems.push(fallbackIcons[profileItems.length % fallbackIcons.length]);
  }

  return profileItems;
}

function makeBrowseItems(
  mode: CruiseCarouselSlotMode,
  targetUser: DiscoveryUser | null,
  candidateUsers: DiscoveryUser[],
  cycleStep: number,
  settled: boolean,
) {
  if (mode === 'profile' && targetUser) {
    return makeProfileBrowseItems(candidateUsers, targetUser, cycleStep, settled);
  }

  if (!settled) {
    return Array.from({ length: 5 }, (_, offset) => (
      CAROUSEL_ICONS[(cycleStep + offset) % CAROUSEL_ICONS.length]
    ));
  }

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

function CarouselTile({ item, featured, itemIndex, spinning, activePhotoIndex, onSelectPhoto }: {
  item: CarouselItem;
  featured: boolean;
  itemIndex: number;
  spinning: boolean;
  activePhotoIndex?: number;
  onSelectPhoto?: (index: number) => void;
}) {
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const profileSizeClass = featured ? 'aspect-[4/5] w-[9rem] sm:w-[11.5rem]' : 'aspect-[4/5] w-[4.8rem] sm:w-[5.6rem]';
  const iconSizeClass = featured ? 'h-[7.5rem] w-[7.5rem]' : 'h-[5rem] w-[5rem]';
  const tileFrameClass = featured
    ? 'border-white/34 bg-white/[0.12] shadow-[0_0_34px_rgba(255,0,114,0.32)] rounded-[1.375rem]'
    : 'border-white/24 bg-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.3)] rounded-[1rem] sm:rounded-[1.25rem]';
  const positionClass = featured
    ? 'scale-110 rotate-0 opacity-100 z-20'
    : 'scale-90 rotate-0 opacity-85 hover:opacity-100 z-10';
  const cycleClass = spinning ? 'cruise-carousel-profile-spinning' : '';

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  if (item.kind === 'profile') {
    const allPhotos = item.user.photos && item.user.photos.length > 0
      ? item.user.photos
      : item.user.photo
      ? [item.user.photo]
      : [];
    const photoUrl = featured ? (allPhotos[activePhotoIndex ?? 0] ?? item.user.photo) : item.user.photo;
    const photo = photoUrl && !shouldMaskPhoto(dlModeActive, item.user.photoExplicit)
      ? resolveMediaUrl(photoUrl)
      : null;
    const initial = item.user.name.trim().charAt(0).toUpperCase() || '?';

    return (
      <div
        data-carousel-profile-id={item.user.id}
        data-testid="cruise-carousel-profile-tile"
        className={`relative flex ${profileSizeClass} shrink-0 items-center justify-center overflow-hidden border ${tileFrameClass} ${positionClass} ${cycleClass} transition-all duration-300`}
      >
        {photo ? (
          <img
            alt={item.user.name}
            className="h-full w-full object-cover"
            draggable={false}
            src={photo}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl sm:text-4xl font-bold text-white" style={{ background: 'var(--cruush-gradient)' }}>
            {initial}
          </div>
        )}

        {featured && allPhotos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPhoto?.(( (activePhotoIndex ?? 0) - 1 + allPhotos.length ) % allPhotos.length);
              }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/80 hover:scale-110 active:scale-95"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPhoto?.(( (activePhotoIndex ?? 0) + 1 ) % allPhotos.length);
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/80 hover:scale-110 active:scale-95"
              aria-label="Next photo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 backdrop-blur-sm">
              {allPhotos.map((_, idx) => (
                <button
                  key={`photo-dot-${idx}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPhoto?.(idx);
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    (activePhotoIndex ?? 0) === idx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Go to photo ${idx + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`flex ${iconSizeClass} shrink-0 items-center justify-center border ${tileFrameClass} ${positionClass} transition-all duration-300`}
    >
      <CruushIcon name={item.icon} className={featured ? 'h-14 w-14' : 'h-10 w-10'} variant={featured ? 'colored' : 'white'} />
    </div>
  );
}

export default function CruiseCarouselSlot({
  mode,
  variant,
  candidateUsers = [],
  targetUser = null,
  onClose,
  onComplete,
  onRetry,
  onUpgrade,
  browseDurationMs = DEFAULT_BROWSE_DURATION_MS,
}: CruiseCarouselSlotProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [settled, setSettled] = useState(false);
  const [cycleStep, setCycleStep] = useState(0);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const profileCandidates = useMemo(
    () => uniqueProfileCandidates(candidateUsers, targetUser),
    [candidateUsers, targetUser],
  );
  const profileCandidateKey = profileCandidates.map((user) => user.id).join(':');

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [targetUser?.id]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setSettled(false);
    setCycleStep(0);

    const duration = prefersReducedMotion ? 140 : browseDurationMs;
    const hasCyclingItems = mode === 'profile' ? profileCandidates.length > 1 : true;
    const cycleStartedAt = window.performance.now();
    let cycleTimer: number | null = null;
    const advanceReel = () => {
      setCycleStep((currentStep) => currentStep + 1);
      const progress = Math.min(1, (window.performance.now() - cycleStartedAt) / duration);
      const nextDelay = PROFILE_CYCLE_START_INTERVAL_MS
        + Math.round((PROFILE_CYCLE_END_INTERVAL_MS - PROFILE_CYCLE_START_INTERVAL_MS) * progress ** 3);
      cycleTimer = window.setTimeout(advanceReel, nextDelay);
    };

    if (!prefersReducedMotion && hasCyclingItems) {
      cycleTimer = window.setTimeout(advanceReel, PROFILE_CYCLE_START_INTERVAL_MS);
    }
    const timer = window.setTimeout(() => {
      if (cycleTimer !== null) {
        window.clearTimeout(cycleTimer);
      }
      setSettled(true);
      if (mode === 'profile') {
        onCompleteRef.current?.();
      }
    }, duration);

    return () => {
      window.clearTimeout(timer);
      if (cycleTimer !== null) {
        window.clearTimeout(cycleTimer);
      }
    };
  }, [browseDurationMs, mode, prefersReducedMotion, profileCandidateKey, profileCandidates.length, targetUser?.id]);

  const browseItems = useMemo(
    () => makeBrowseItems(mode, targetUser, profileCandidates, cycleStep, settled),
    [cycleStep, mode, profileCandidates, settled, targetUser],
  );
  const featuredFrameClass = browseItems[FEATURED_ITEM_INDEX]?.kind === 'profile'
    ? 'aspect-[4/5] w-[9.6rem] sm:w-[12.2rem]'
    : 'h-[7rem] w-[7rem] sm:h-[10rem] sm:w-[10rem]';

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
          <div data-testid="cruise-carousel-featured-frame" className={`pointer-events-none absolute left-1/2 top-1/2 z-10 ${featuredFrameClass} -translate-x-1/2 -translate-y-1/2 rounded-[1.65rem] border border-white/18 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${settled ? '' : 'cruise-carousel-frame-spinning'}`} />
          <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-20 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-primary shadow-[0_0_14px_rgba(255,0,114,0.9)]" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-primary shadow-[0_0_14px_rgba(255,0,114,0.9)]" />
          <div className="relative flex h-[13.5rem] sm:h-[16rem] items-center justify-center overflow-hidden" aria-hidden="true">
            <div
              key={settled ? 'settled' : `reel-${cycleStep}`}
              className={`flex items-center gap-3 sm:gap-5 ${settled ? 'cruise-carousel-reel-lock' : 'cruise-carousel-reel-step'}`}
            >
              {browseItems.map((item, itemIndex) => (
                <CarouselTile
                  key={`${item.kind}-${item.kind === 'icon' ? item.icon : item.user.id}-${itemIndex}`}
                  item={item}
                  featured={settled && itemIndex === FEATURED_ITEM_INDEX}
                  itemIndex={itemIndex}
                  spinning={!settled && mode === 'profile'}
                  activePhotoIndex={activePhotoIndex}
                  onSelectPhoto={setActivePhotoIndex}
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
        className="absolute bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-6 top-[8.75rem] z-50 hidden w-[23rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[28px] border border-white/10 bg-black/84 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl lg:block"
      >
        {content}
      </aside>
    );
  }

  return (
    <section
      aria-label="cruise carousel"
      className="mx-auto h-full w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-black/78 shadow-[0_24px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl"
    >
      {content}
    </section>
  );
}
