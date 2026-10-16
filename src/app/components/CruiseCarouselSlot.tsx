import { formatVibeLabel } from '../lib/vibeLabels';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { ChevronLeft, ChevronRight, Lock, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';
import { CruushIcon, type CruushIconName } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import HeartPhoto from './HeartPhoto';
import DlModePhotoPlaceholder from './DlModePhotoPlaceholder';
import { resolveMediaUrl, resolveMediaThumbnailUrl } from '../lib/apiClient';
import { useDlMode, shouldMaskPhoto, getNsfwPhotoRestriction } from '../lib/dlMode';
import type { DiscoveryUser } from '../lib/usersApi';
import { PROFILE_OVERLAY_TEXT_STYLE } from './ProfileView';
import { formatDistanceWithAway, useDistancePreferences } from '../lib/distancePreferences';
import { resolveVibeTone, vibeCapsuleStyle } from '../lib/vibeTone';
import { ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, shouldReduceMotion } from '../lib/accessibilityPreferences';
import { trackCruushPlusConversion } from '../lib/posthog';
import { getProfileGradientCss } from '../lib/profileGradient';

export type CruiseCarouselSlotMode = 'profile' | 'locked' | 'empty';
export type CruiseCarouselSlotVariant = 'panel' | 'page';

type CarouselItem =
  | {
      kind: 'icon';
      icon: CruushIconName;
      label: string;
    }
  | {
      kind: 'plus-ad';
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
const PROFILE_CYCLE_START_INTERVAL_MS = 52;
const PROFILE_CYCLE_END_INTERVAL_MS = 240;

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

  const repeatProfile = (index: number): CarouselItem => {
    const user = profileCandidates[index % Math.max(1, profileCandidates.length)] ?? targetUser;
    return { kind: 'profile', user, label: user.name };
  };

  if (settled) {
    const selectedItem: CarouselItem = { kind: 'profile', user: targetUser, label: targetUser.name };
    const otherItems = profileItems.filter((item) => item.kind !== 'profile' || item.user.id !== targetUser.id);
    const leftItems = otherItems.slice(0, FEATURED_ITEM_INDEX);
    const rightItems = otherItems.slice(FEATURED_ITEM_INDEX, 4);

    while (leftItems.length < FEATURED_ITEM_INDEX) {
      leftItems.unshift(repeatProfile(leftItems.length));
    }
    while (rightItems.length < 2) {
      rightItems.push(repeatProfile(FEATURED_ITEM_INDEX + rightItems.length + 1));
    }

    return [...leftItems, selectedItem, ...rightItems];
  }

  while (profileItems.length < 5) {
    profileItems.push(repeatProfile(profileItems.length));
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

  const spinCandidates = candidateUsers.filter((user) => !user.isCurrentUser);

  if (!settled) {
    if (spinCandidates.length > 0) {
      return Array.from({ length: 5 }, (_, offset) => {
        const user = spinCandidates[(cycleStep + offset) % spinCandidates.length];
        return { kind: 'profile', user, label: user.name } as CarouselItem;
      });
    }

    return Array.from({ length: 5 }, (_, offset) => (
      CAROUSEL_ICONS[(cycleStep + offset) % CAROUSEL_ICONS.length]
    ));
  }

  if (mode === 'locked') {
    const surround = (offset: number): CarouselItem => {
      const user = spinCandidates[offset % Math.max(1, spinCandidates.length)];
      return user
        ? { kind: 'profile', user, label: user.name }
        : CAROUSEL_ICONS[offset % CAROUSEL_ICONS.length];
    };

    return [
      surround(0),
      surround(1),
      { kind: 'plus-ad', label: 'cruush+' },
      surround(2),
      surround(3),
    ];
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

function CarouselTile({ item, featured, itemIndex, spinning, activePhotoIndex, onSelectPhoto, plusAdRef, plusAdFit }: {
  item: CarouselItem;
  featured: boolean;
  itemIndex: number;
  spinning: boolean;
  activePhotoIndex?: number;
  onSelectPhoto?: (index: number) => void;
  plusAdRef?: Ref<HTMLDivElement>;
  plusAdFit?: { scale: number; offsetY: number } | null;
}) {
  const dlModeActive = useDlMode();
  const distanceMode = useDistancePreferences().mode;
  // The featured card carries a profile overlay, so it needs the room a
  // profile card has rather than a thumbnail's.
  const profileSizeClass = featured ? 'aspect-[4/5] w-[15rem] sm:w-[17rem]' : 'aspect-[4/5] w-[4.8rem] sm:w-[5.6rem]';
  const iconSizeClass = featured ? 'h-[7.5rem] w-[7.5rem]' : 'h-[5rem] w-[5rem]';
  const tileFrameClass = featured
    ? 'border-white/34 bg-white/[0.12] shadow-[0_0_34px_rgba(255,0,114,0.32)] rounded-[1.375rem]'
    : 'border-white/24 bg-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.3)] rounded-[1rem] sm:rounded-[1.25rem]';
  // A profile card is already much larger than its neighbours, and scaling it
  // up on top of that pushed its own overlay past the row, which clips: the
  // signal was cut in half and the vibe tags disappeared entirely.
  const featuredScaleClass = item.kind === 'profile' || item.kind === 'plus-ad' ? 'scale-100' : 'scale-110';
  const positionClass = featured
    ? `${featuredScaleClass} rotate-0 opacity-100 z-20`
    : 'scale-90 rotate-0 opacity-85 hover:opacity-100 z-10';
  const cycleClass = spinning ? 'cruise-carousel-profile-spinning' : '';

  if (item.kind === 'plus-ad') {
    return (
      <div
        ref={plusAdRef}
        data-testid="cruise-carousel-plus-ad-tile"
        className={`relative flex ${profileSizeClass} shrink-0 flex-col items-center justify-center gap-2 overflow-hidden border ${tileFrameClass} ${positionClass} ${cycleClass} px-3 text-center transition-all duration-300`}
        style={{
          background: 'var(--cruush-gradient)',
          transform: plusAdFit ? `translateY(${plusAdFit.offsetY}px) scale(${plusAdFit.scale})` : undefined,
        }}
      >
        <p className="absolute inset-x-3 top-3 text-center text-sm font-semibold text-white"><CruushPlusWord /> unlocks this</p>
        <CruushIcon name="cruush" className="h-8 w-8" variant="white" />
        <p className="text-[11px] leading-tight text-white/85">See who the carousel finds nearby.</p>
      </div>
    );
  }

  if (item.kind === 'profile') {
    const allPhotos = item.user.photos && item.user.photos.length > 0
      ? item.user.photos
      : item.user.photo
      ? [item.user.photo]
      : [];
    const photoUrl = featured ? (allPhotos[activePhotoIndex ?? 0] ?? item.user.photo) : item.user.photo;
    const photo = photoUrl && !shouldMaskPhoto(dlModeActive, item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: item.user.relationship?.mutualCruush === true, sharesCrowd: item.user.photoRelationship?.sharesCrowd ?? item.user.hasSharedCrowd === true })
      ? (featured ? resolveMediaUrl(photoUrl) : resolveMediaThumbnailUrl(photoUrl))
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
          <div className="flex h-full w-full items-center justify-center text-2xl sm:text-4xl font-bold text-white" style={{ background: getProfileGradientCss(item.user.id) }}>
            {photoUrl && shouldMaskPhoto(dlModeActive, item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: item.user.relationship?.mutualCruush === true, sharesCrowd: item.user.photoRelationship?.sharesCrowd ?? item.user.hasSharedCrowd === true }) ? <DlModePhotoPlaceholder className={featured ? 'w-28' : 'w-14'} restriction={getNsfwPhotoRestriction(item.user.photoExplicit, item.user.photoRelationship)} /> : initial}
          </div>
        )}

        {/* The featured card reads like the profile card: the same overlay,
            the same text treatment, the same vibe pills, over the photo. */}
        {featured ? (
          <div
            data-testid="cruise-carousel-profile-overlay"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pb-3 pt-8 text-left text-white"
          >
            <p className="flex min-w-0 items-center text-xl leading-tight" style={PROFILE_OVERLAY_TEXT_STYLE}>
              <span className="min-w-0 truncate">{item.user.name}</span>
              {item.user.age ? <span className="shrink-0 whitespace-nowrap">, {item.user.age}</span> : null}
            </p>
            {item.user.pronouns ? (
              <p className="truncate text-[13px] text-white" style={PROFILE_OVERLAY_TEXT_STYLE}>{item.user.pronouns}</p>
            ) : null}
            {item.user.distance ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[13px] text-white" style={PROFILE_OVERLAY_TEXT_STYLE}>
                <CruushIcon name="map" className="h-3.5 w-3.5 shrink-0" variant="white" />
                <span className="min-w-0 truncate">{formatDistanceWithAway(item.user.distance, distanceMode)}</span>
                {item.user.lastActive ? <span className="shrink-0">• {item.user.lastActive}</span> : null}
              </div>
            ) : null}
            {item.user.signal ? (
              <p className="mt-1 truncate text-[15px] leading-snug text-white" style={PROFILE_OVERLAY_TEXT_STYLE}>
                {item.user.signal}
              </p>
            ) : null}
            {(item.user.vibes?.length ?? 0) > 0 ? (
              <div className="mt-1.5 flex flex-nowrap gap-1 overflow-hidden">
                {item.user.vibes.slice(0, 3).map((vibe) => (
                  <span
                    className="min-w-0 shrink truncate rounded-full border px-2 py-0.5 text-[11px] uppercase leading-tight tracking-[0.08em]"
                    key={vibe}
                    style={vibeCapsuleStyle(resolveVibeTone({ mutual: item.user.relationship?.mutualCruush === true }))}
                  >
                    {formatVibeLabel(vibe)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

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
  useEffect(() => {
    if (mode === 'locked') {
      trackCruushPlusConversion('cruush_plus_paywall_viewed', {
        surface: 'cruise_carousel',
        benefit: 'cruise_carousel',
      });
    }
  }, [mode]);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [settled, setSettled] = useState(false);
  const [cycleStep, setCycleStep] = useState(0);
  const [nearMiss, setNearMiss] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lockedTileFit, setLockedTileFit] = useState<{ scale: number; offsetY: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reelViewportRef = useRef<HTMLDivElement>(null);
  const plusAdRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const profileCandidates = useMemo(
    () => uniqueProfileCandidates(candidateUsers, targetUser),
    [candidateUsers, targetUser],
  );
  const profileCandidateKey = profileCandidates.map((user) => user.id).join(':');

  useLayoutEffect(() => {
    if (mode !== 'locked' || !settled) {
      setLockedTileFit(null);
      return;
    }
    const windowElement = windowRef.current;
    const frameElement = frameRef.current;
    const reelElement = reelViewportRef.current;
    const tile = plusAdRef.current;
    if (!windowElement || !frameElement || !reelElement || !tile) return;

    const fit = () => {
      if (!tile.offsetWidth || !tile.offsetHeight) return;
      const windowBox = windowElement.getBoundingClientRect();
      const frameBox = frameElement.getBoundingClientRect();
      const reelBox = reelElement.getBoundingClientRect();
      const centerX = frameBox.left + frameBox.width / 2;
      const centerY = frameBox.top + frameBox.height / 2;
      // Retain the tile's existing inset from the pink frame. On short pages,
      // fit inside both clipping ancestors without moving the frame or reel.
      const insetX = Math.max(0, (frameBox.width - tile.offsetWidth) / 2);
      const insetY = Math.max(0, (frameBox.height - tile.offsetHeight) / 2);
      const left = Math.max(frameBox.left, reelBox.left, windowBox.left + windowElement.clientLeft) + insetX;
      const right = Math.min(frameBox.right, reelBox.right, windowBox.left + windowElement.clientLeft + windowElement.clientWidth) - insetX;
      const top = Math.max(frameBox.top, reelBox.top, windowBox.top + windowElement.clientTop) + insetY;
      const bottom = Math.min(frameBox.bottom, reelBox.bottom, windowBox.top + windowElement.clientTop + windowElement.clientHeight) - insetY;
      const scale = Math.max(0, Math.min(1,
        2 * Math.min(centerX - left, right - centerX) / tile.offsetWidth,
        2 * Math.min(centerY - top, bottom - centerY) / tile.offsetHeight,
      ));
      const offsetY = centerY - (reelBox.top + reelBox.height / 2);
      setLockedTileFit((previous) => previous?.scale === scale && previous.offsetY === offsetY
        ? previous : { scale, offsetY });
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    [windowElement, frameElement, reelElement, tile].forEach((element) => observer?.observe(element));
    window.addEventListener('resize', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [mode, settled, variant]);

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [targetUser?.id]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setSettled(false);
    setCycleStep(0);
    setNearMiss(false);

    const duration = prefersReducedMotion ? 140 : browseDurationMs;
    const hasCyclingItems = mode === 'profile' ? profileCandidates.length > 1 : true;
    const cycleStartedAt = window.performance.now();
    let cycleTimer: number | null = null;
    const advanceReel = () => {
      setCycleStep((currentStep) => currentStep + 1);
      setNearMiss(Math.random() < 0.32);
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
  const featuredFrameClass = browseItems[FEATURED_ITEM_INDEX]?.kind === 'icon'
    ? 'h-[7rem] w-[7rem] sm:h-[10rem] sm:w-[10rem]'
    : 'aspect-[4/5] w-[15.9rem] sm:w-[18rem]';

  const title = mode === 'profile'
    ? 'browsing nearby profiles'
    : mode === 'locked'
    ? 'Carousel is a cruush+ feature'
    : 'no profiles nearby';
  const description = mode === 'profile'
    ? targetUser
      ? `Found ${targetUser.name} nearby.`
      : 'Looking for someone nearby.'
    : mode === 'locked'
    ? <>Browse nearby profiles with <CruushPlusWord />.</>
    : 'No eligible nearby profiles are available right now.';

  const content = (
    <div className="cruush-carousel-content flex h-full min-h-0 flex-col">
      <div className="cruush-carousel-heading flex items-start justify-between gap-3 p-4">
        <div>
          <h2 className={`cruush-carousel-title ${variant === 'page' ? 'text-2xl sm:text-3xl' : 'text-2xl'} text-white`}>{title}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-sm transition hover:text-white"
            aria-label="Close Carousel"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className={`cruush-carousel-body ${variant === 'page' ? 'px-3 sm:px-6' : 'px-4'} flex min-h-0 flex-1 flex-col justify-center`}>
        <div ref={windowRef} className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/55 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.4)]">
          <div className="pointer-events-none absolute inset-y-4 left-0 z-10 w-14 bg-gradient-to-r from-black/75 to-transparent" />
          <div className="pointer-events-none absolute inset-y-4 right-0 z-10 w-14 bg-gradient-to-l from-black/75 to-transparent" />
          <div ref={frameRef} data-testid="cruise-carousel-featured-frame" className={`pointer-events-none absolute left-1/2 top-1/2 z-30 ${featuredFrameClass} -translate-x-1/2 -translate-y-1/2 rounded-[1.65rem] border border-white/18 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${settled ? '' : 'cruise-carousel-frame-spinning'}`}>
            {mode === 'locked' ? (
              <p className={settled ? 'sr-only' : 'absolute inset-x-3 top-3 text-center text-sm font-semibold text-white'}><CruushPlusWord /> unlocks this</p>
            ) : null}
          </div>
          <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-20 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-primary shadow-[0_0_14px_rgba(255,0,114,0.9)]" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-primary shadow-[0_0_14px_rgba(255,0,114,0.9)]" />
          <div ref={reelViewportRef} className="relative flex h-[19rem] sm:h-[22rem] items-center justify-center overflow-hidden" aria-hidden="true">
            <div
              key={settled ? 'settled' : `reel-${cycleStep}`}
              className={`flex items-center gap-3 sm:gap-5 ${settled ? 'cruise-carousel-reel-lock' : nearMiss ? 'cruise-carousel-reel-near-miss' : 'cruise-carousel-reel-step'}`}
            >
              {browseItems.map((item, itemIndex) => (
                <CarouselTile
                  key={`${item.kind}-${item.kind === 'icon' ? item.icon : item.kind === 'profile' ? item.user.id : 'plus-ad'}-${itemIndex}`}
                  item={item}
                  featured={settled && itemIndex === FEATURED_ITEM_INDEX}
                  itemIndex={itemIndex}
                  spinning={!settled && mode === 'profile'}
                  activePhotoIndex={activePhotoIndex}
                  onSelectPhoto={setActivePhotoIndex}
                  plusAdRef={plusAdRef}
                  plusAdFit={lockedTileFit}
                />
            ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center" aria-live="polite">
          <p className="text-sm text-white/78">{settled ? description : 'Browsing nearby profiles...'}</p>
          {/* The round button the profile surfaces use, centred, with its word
              under it rather than wrapped around it in a pill. */}
          {settled && mode === 'locked' ? (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Get cruush+"
                title="Get cruush+"
                className="cruush-action-sheen size-12 shrink-0 rounded-full border-0 text-white disabled:opacity-100"
                style={{ background: 'var(--cruush-gradient)' }}
                onClick={() => {
                  trackCruushPlusConversion('cruush_plus_upgrade_clicked', {
                    surface: 'cruise_carousel',
                    benefit: 'cruise_carousel',
                  });
                  onUpgrade?.();
                }}
              >
                <Lock className="h-5 w-5" />
              </Button>
              <span className="text-xs text-white/78">Get <CruushPlusWord /></span>
            </div>
          ) : null}
          {settled && (mode === 'empty' || mode === 'profile') && onRetry ? (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Browse again"
                title="Browse again"
                className="cruush-action-sheen size-12 shrink-0 rounded-full border-0 text-white disabled:opacity-100"
                style={{ background: 'var(--cruush-gradient-soft-28)' }}
                onClick={onRetry}
              >
                <RefreshCw className="h-5 w-5" />
              </Button>
              <span className="text-xs text-white/78">Browse again</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (variant === 'panel') {
    return (
      <aside
        aria-label="Carousel"
        className="fixed inset-0 z-[140] flex items-center justify-center bg-black/88 p-0 backdrop-blur-xl sm:p-6"
      >
        <div className="scrollbar-hide h-full max-h-[46rem] w-full max-w-3xl overflow-y-auto border-y border-white/10 bg-black/84 shadow-[0_24px_80px_rgba(0,0,0,0.48)] sm:rounded-[28px] sm:border">
          {content}
        </div>
      </aside>
    );
  }

  return (
    <section
      aria-label="Carousel"
      data-carousel-scroll-page={mode === 'locked' ? '' : undefined}
      className="mx-auto h-full w-full max-w-2xl overflow-hidden border-y border-white/10 bg-black/78 shadow-[0_24px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl sm:rounded-[28px] sm:border"
    >
      {content}
    </section>
  );
}
