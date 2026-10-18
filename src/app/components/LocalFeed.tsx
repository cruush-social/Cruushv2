import { useAccountPreference, readAccountPreference, usePreferenceDraftOwner } from '../lib/accountPreferences';
import { useContentVisibilityRefresh } from '../lib/contentVisibilityRevision';
import { showPurgatoryPresentation } from '../lib/purgatoryPresentation';
import { useTrustRestrictions } from '../lib/trustRestrictions';
import TrustRestrictionNotice from './TrustRestrictionNotice';
import PhotoUploadSpinner from './PhotoUploadSpinner';
import MultiSelect from './MultiSelect';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type UIEvent } from 'react';
import { PHOTO_UPLOAD_ACCEPT, PHOTO_UPLOAD_EXTENSION_TYPES } from '../lib/photoUploadFormats';
import { useLocation, useNavigate } from 'react-router';
import { formatDistanceLabel, useDistancePreferences } from '../lib/distancePreferences';
import { Clock, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import CruushPlusCardDialog from './CruushPlusCardDialog';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import UserActivityCapsule from './UserActivityCapsule';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import ProfileActionTrio from './ProfileActionTrio';
import FeedAttachmentPreview from './FeedAttachmentPreview';
import FeedPhotoViewer from './FeedPhotoViewer';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import { ProfilePhotoCropper, readProfilePhotoPreviewUrl } from './ProfileEdit';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import AppPageHeader from './AppPageHeader';
import TagInput from './TagInput';
import { useMapServiceArea } from './MapServiceAreaContext';
import { ghostSettingsBodyClassName, ghostSettingsCardClassName } from './ghostSettingsStyles';
import { useDlMode, shouldMaskPhoto, getDlModeShowOnlyException, getNsfwPhotoRestriction } from '../lib/dlMode';
import { buildCruushPlusStorePath } from '../lib/cruushPlusConversion';
import {
  createFeedPost,
  deleteStagedFeedPhoto,
  deleteFeedPost,
  getFeedPosts,
  getFeedSettings,
  updateFeedSettings,
  uploadFeedPhoto,
  type FeedPhoto,
  type FeedLocationPinVisibility,
  type FeedPostAudience,
  type FeedPost,
  type FeedPostExpiry,
  type FeedPostWindow,
  type FeedSettings,
} from '../lib/postApi';
import { CRUUSH_PLUS_CHANGED_EVENT, getMyBillingStatus } from '../lib/billingApi';
import { getMyProfile, getProfileById, ProfileApiError, type ProfileRecord } from '../lib/profileApi';
import { getMutualCruushMap, getMyCruushActivity, revokeMutualCruush, revokeSentCruush, sendCruush } from '../lib/cruushApi';
import {
  handleCruushSendSuccess,
  handleMutualCruushRevokeSuccess,
  handleSentCruushRevokeSuccess,
  notifyCruushSendError,
  notifyMutualCruushRevokeError,
  notifySentCruushRevokeError,
} from '../lib/cruushNotifications';
import { CROWDS, normalizeCrowdValues } from '../lib/profileOptions';
import { getCurrentUserId } from '../lib/sessionUser';
import { resolveUserBorderTone, USER_BORDER_COLORS } from '../lib/userBorderTone';
import partyHatIcon from '../assets/ui-icons/party-hat.svg';

function formatRelativeTime(isoTimestamp: string) {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatFeedExpiry(expiry: FeedPostExpiry) {
  return expiry === 'never' ? 'Never' : expiry;
}

const FEED_LOCATION_PIN_OPTIONS: Array<{ value: FeedLocationPinVisibility; label: string; description: string }> = [
  { value: 'mutuals', label: 'cruushes', description: 'Only cruushes see your Confessional pin.' },
  { value: 'same_crowd', label: 'same crowd', description: 'People sharing one of your crowds see your Confessional pin.' },
  { value: 'public', label: 'public', description: 'Anyone who can read your post can tap through to your map pin.' },
  { value: 'off', label: 'off', description: 'Do not show a Confessional pin on your posts.' },
];

const FEED_WINDOW_OPTIONS: Array<{ value: FeedPostWindow; label: string }> = [
  { value: '1h', label: '1h' },
  { value: '3h', label: '3h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  ...Array.from({ length: 24 }, (_, index) => {
    const label = `${index + 7}d`;
    return { value: label as FeedPostWindow, label };
  }),
  { value: 'never', label: 'Never' },
];
const FEED_EXPIRY_OPTIONS: Array<{ value: FeedPostExpiry; label: string }> = [
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '3h', label: '3h' },
  { value: '6h', label: '6h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '2d', label: '2d' },
  { value: '3d', label: '3d' },
  { value: '5d', label: '5d' },
  { value: '7d', label: '7d' },
  { value: '8d', label: '8d' },
  { value: '9d', label: '9d' },
  { value: '10d', label: '10d' },
  { value: '11d', label: '11d' },
  { value: '12d', label: '12d' },
  { value: '13d', label: '13d' },
  { value: '14d', label: '14d' },
  { value: '15d', label: '15d' },
  { value: '16d', label: '16d' },
  { value: '17d', label: '17d' },
  { value: '18d', label: '18d' },
  { value: '19d', label: '19d' },
  { value: '20d', label: '20d' },
  { value: '21d', label: '21d' },
  { value: '22d', label: '22d' },
  { value: '23d', label: '23d' },
  { value: '24d', label: '24d' },
  { value: '25d', label: '25d' },
  { value: '26d', label: '26d' },
  { value: '27d', label: '27d' },
  { value: '28d', label: '28d' },
  { value: '29d', label: '29d' },
  { value: '30d', label: '30d' },
  { value: 'never', label: 'Never' },
];
const FEED_PAGE_SIZE = 30;
// The final slider step is Global; finite distances retain the 1–100 mile range.
const GLOBAL_FEED_DISTANCE = 101;
const DEFAULT_FEED_SEEKING_FILTERS: FilterState = {
  ...DEFAULT_FILTER_STATE,
  distance: GLOBAL_FEED_DISTANCE,
};
const LAUNCH_PARTY_EVENT_SLUG = 'the-chocolate-factory-launch';
const DEFAULT_FEED_SETTINGS: FeedSettings = {
  locationPinVisibility: 'mutuals',
  hideFromPurgatory: false,
  showDistanceLabels: true,
  postExpiryDefault: 'never',
  feedWindow: '30d',
};
type FeedCoordinates = {
  lat: number;
  lng: number;
};

function profileFeedCoordinates(profile: ProfileRecord): FeedCoordinates | null {
  const location = profile.location;
  const lat = location?.fuzzy_lat ?? location?.lat ?? null;
  const lng = location?.fuzzy_lng ?? location?.lng ?? null;

  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

/** Matches the server ceiling in post-schema.ts. */
const MAX_FEED_POST_TAGS = 10;

export default function LocalFeed({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void; onOpenSettings?: () => void } = {}) {
  const { profilePinsAllowed } = useMapServiceArea();
  const trust = useTrustRestrictions();
  const distancePreferences = useDistancePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [newPost, setNewPost] = useState('');
  const [postTags, setPostTags] = useState<string[]>([]);
  // The composer stays a single row until it is opened. Expanded it takes a
  // third of a phone screen, which pushed the first post below the fold.
  const [composerOpen, setComposerOpen] = useState(false);
  const composerPanelId = useId();
  const composerOpenButtonRef = useRef<HTMLButtonElement | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const postsRef = useRef<FeedPost[]>([]);
  const [expiresIn, setExpiresIn] = useState<FeedPostExpiry>('never');
  const [postAudience, setPostAudience] = useState<FeedPostAudience>('public');
  const [showDistanceOnPost, setShowDistanceOnPost] = useState(true);
  const [hasCruushPlus, setHasCruushPlus] = useState<boolean | null>(null);
  const [billingStatusConfirmed, setBillingStatusConfirmed] = useState(false);
  const [plusCardOpen, setPlusCardOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [uploadingFeedPhoto, setUploadingFeedPhoto] = useState(false);
  const [pendingFeedPhotoUrl, setPendingFeedPhotoUrl] = useState<string | null>(null);
  const feedPhotoPreviewRequestRef = useRef(0);
  const [stagedPhotos, setStagedPhotos] = useState<FeedPhoto[]>([]);
  const [photoViewer, setPhotoViewer] = useState<{ post: FeedPost; index: number } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mutualUserIds, setMutualUserIds] = useState<Set<string>>(() => new Set());
  const [sentCruushUserIds, setSentCruushUserIds] = useState<Set<string>>(() => new Set());
  const [sendingCruushUserIds, setSendingCruushUserIds] = useState<Set<string>>(() => new Set());
  const [validPinUserIds, setValidPinUserIds] = useState<Set<string>>(() => new Set());
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [availableCrowdTargets, setAvailableCrowdTargets] = useState<string[]>([]);
  const [selectedCrowdTargets, setSelectedCrowdTargets] = useState<string[]>([]);
  const [feedSettings, setFeedSettings] = useState<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const [feedWindow, setFeedWindow] = useState<FeedPostWindow>(DEFAULT_FEED_SETTINGS.feedWindow);
  const [feedCoordinates, setFeedCoordinates] = useState<FeedCoordinates | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [seekingOpen, setSeekingOpen] = useState(false);
  const seekingDraftEdited = useRef(false);
  const [feedSeekingDraft, setFeedSeekingDraft] = useState<FilterState>(() => readAccountPreference('feed.seeking', DEFAULT_FEED_SEEKING_FILTERS));
  const [feedSeekingFilters, setFeedSeekingFilters] = useAccountPreference<FilterState>('feed.seeking', DEFAULT_FEED_SEEKING_FILTERS);
  const [excludeMileHighClubDraft, setExcludeMileHighClubDraft] = useState(() => readAccountPreference('feed.excludeMileHighClub', false));
  const [excludeMileHighClub, setExcludeMileHighClub] = useAccountPreference('feed.excludeMileHighClub', false);
  const [purgatoryFilterDraft, setPurgatoryFilterDraft] = useState<'all' | 'only' | 'exclude'>(() => readAccountPreference('feed.purgatory', 'all'));
  const [purgatoryFilter, setPurgatoryFilter] = useAccountPreference<'all' | 'only' | 'exclude'>('feed.purgatory', 'all');
  useEffect(() => {
    if (!seekingDraftEdited.current) {
      setFeedSeekingDraft(feedSeekingFilters);
      setExcludeMileHighClubDraft(excludeMileHighClub);
      setPurgatoryFilterDraft(purgatoryFilter);
    }
  }, [feedSeekingFilters, excludeMileHighClub, purgatoryFilter]);
  usePreferenceDraftOwner(() => {
    seekingDraftEdited.current = false;
    setFeedSeekingDraft(readAccountPreference('feed.seeking', DEFAULT_FEED_SEEKING_FILTERS));
    setExcludeMileHighClubDraft(readAccountPreference('feed.excludeMileHighClub', false));
    setPurgatoryFilterDraft(readAccountPreference('feed.purgatory', 'all'));
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [feedSettingsLoaded, setFeedSettingsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dlModeActive = useDlMode();
  const dlModeException = getDlModeShowOnlyException();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRequestRef = useRef(false);
  const feedRequestIdRef = useRef(0);
  const postsScrollRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const feedPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const hasCruushPlusRef = useRef<boolean | null>(null);
  const feedSettingsRef = useRef<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const initialFeedSettingsRef = useRef<Promise<void>>(Promise.resolve());
  const initialFeedRequestStartedRef = useRef(false);
  const feedSettingsSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const applyFeedSettings = (nextSettings: FeedSettings) => {
    feedSettingsRef.current = nextSettings;
    setFeedSettings(nextSettings);
  };

  const enqueueFeedSettingsUpdate = (patch: Partial<FeedSettings>) => {
    const queuedUpdate = feedSettingsSaveChainRef.current.then(async () => {
      const nextSettings = await updateFeedSettings({
        ...feedSettingsRef.current,
        ...patch,
      });
      applyFeedSettings(nextSettings);
      return nextSettings;
    });

    feedSettingsSaveChainRef.current = queuedUpdate.then(
      () => undefined,
      () => undefined,
    );
    return queuedUpdate;
  };

  useEffect(() => {
    if (new URLSearchParams(location.search).get('compose') !== '1') {
      return;
    }

    setComposerOpen(true);
    // The textarea only exists once the composer is open, so focus it after
    // this open has painted rather than in the same frame.
    requestAnimationFrame(() => {
      composerInputRef.current?.scrollIntoView?.({ block: 'center' });
      composerInputRef.current?.focus();
    });
  }, [location.search]);

  const fetchPosts = useCallback(async (options: {
    retryVisibilityFailure?: boolean;
    append?: boolean;
    before?: string | null;
    cursor?: string;
    coordinates?: FeedCoordinates | null;
    distanceMiles?: number;
    within?: FeedPostWindow;
    seekingFilters?: FilterState;
    excludeMileHighClub?: boolean;
    purgatoryFilter?: 'all' | 'only' | 'exclude';
  } = {}) => {
    const append = options.append === true;
    const requestId = ++feedRequestIdRef.current;
    // Keep the current list in place while a replacement request is pending.
    // Filter/window changes used to clear the list behind a loading skeleton,
    // which made the Feed visibly flash even when it already had posts.
    const loadedPostCount = postsRef.current.length;
    const hasRenderedPosts = loadedPostCount > 0;
    const requestLimit = FEED_PAGE_SIZE;
    const nextCoordinates = options.coordinates === undefined ? feedCoordinates : options.coordinates;
    const nextWindow = options.within ?? feedWindow;
    const nextSeekingFilters = options.seekingFilters ?? feedSeekingFilters;
    const nextExcludeMileHighClub = options.excludeMileHighClub ?? excludeMileHighClub;
    const nextPurgatoryFilter = options.purgatoryFilter ?? purgatoryFilter;
    const selectedDistance = options.distanceMiles ?? nextSeekingFilters.distance;
    const nextDistanceMiles = selectedDistance === GLOBAL_FEED_DISTANCE ? 'global' : selectedDistance;

    if (append) {
      loadingMoreRequestRef.current = true;
      setLoadingMore(true);
    } else {
      loadingMoreRequestRef.current = false;
      setLoadingMore(false);
      setLoading(!hasRenderedPosts);
    }

    setError(null);
    try {
      const requestFilters: Parameters<typeof getFeedPosts>[0] = {
        before: options.before ?? undefined,
        ...(options.cursor ? { cursor: options.cursor } : {}),
        coordinates: nextCoordinates,
        distanceMiles: nextDistanceMiles,
        limit: requestLimit,
        within: nextWindow,
        seeking: {
          ...nextSeekingFilters,
          ...(nextExcludeMileHighClub ? { excludeMileHighClub: true } : {}),
          ...(nextPurgatoryFilter === 'only' ? { purgatoryMembers: true } : {}),
          ...(nextPurgatoryFilter === 'exclude' ? { excludePurgatoryMembers: true } : {}),
        },
      };
      let page = await getFeedPosts(requestFilters);
      const nextPosts = [...page];
      const targetCount = options.retryVisibilityFailure ? Math.max(requestLimit, loadedPostCount) : requestLimit;
      const refreshedIds = new Set(nextPosts.map(post => post.id));
      while (nextPosts.length < targetCount && page.length === requestLimit) {
        if (requestId !== feedRequestIdRef.current) return;
        const lastPost = page[page.length - 1];
        page = await getFeedPosts({
          ...requestFilters,
          before: lastPost.createdAt,
          ...(lastPost.paginationCursor ? { cursor: lastPost.paginationCursor } : {}),
        });
        const unseen = page.filter(post => !refreshedIds.has(post.id));
        if (!unseen.length) break;
        unseen.forEach(post => refreshedIds.add(post.id));
        nextPosts.push(...unseen);
      }

      if (requestId !== feedRequestIdRef.current) {
        return;
      }

      const currentPosts = append ? postsRef.current : [];
      const knownPostIds = new Set(currentPosts.map((post) => post.id));
      const mergedPosts = [
        ...currentPosts,
        ...nextPosts.filter((post) => !knownPostIds.has(post.id)),
      ];
      postsRef.current = mergedPosts;
      setPosts(mergedPosts);
      setHasMorePosts(
        page.length >= requestLimit,
      );
    } catch (error) {
      if (requestId !== feedRequestIdRef.current) {
        return;
      }
      console.error('Error fetching posts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load the local Confessional.');
      if (!append && !hasRenderedPosts) {
        postsRef.current = [];
        setPosts([]);
        setHasMorePosts(false);
      }
      if (options.retryVisibilityFailure) throw error;
    } finally {
      if (requestId !== feedRequestIdRef.current) {
        return;
      }
      if (append) {
        loadingMoreRequestRef.current = false;
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [excludeMileHighClub, purgatoryFilter, feedCoordinates, feedSeekingFilters, feedWindow]);

  useEffect(() => {
    if (!photoViewer) {
      return;
    }
    const activePhoto = photoViewer.post.photos?.[photoViewer.index];
    if (shouldMaskPhoto(dlModeActive, activePhoto?.explicit, {
      ...photoViewer.post.user.photoRelationship,
      isMutualCruush: mutualUserIds.has(photoViewer.post.user.id),
      sharesCrowd: photoViewer.post.user.sharesCrowd,
    })) {
      setPhotoViewer(null);
    }
  }, [dlModeActive, dlModeException, mutualUserIds, photoViewer]);

  useEffect(() => () => {
    if (pendingFeedPhotoUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(pendingFeedPhotoUrl);
    }
  }, [pendingFeedPhotoUrl]);

  useEffect(() => {
    let active = true;

    const loadBillingStatus = () => {
      setBillingStatusConfirmed(false);
      void getMyBillingStatus()
        .then((status) => {
          if (active) {
            hasCruushPlusRef.current = status.cruushPlus === true;
            setHasCruushPlus(hasCruushPlusRef.current);
            setBillingStatusConfirmed(true);
          }
        })
        .catch(() => {
          if (active) {
            hasCruushPlusRef.current = false;
            setHasCruushPlus(false);
            setBillingStatusConfirmed(false);
          }
        });
    };

    loadBillingStatus();
    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);
    return () => {
      active = false;
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);
    };
  }, []);

  useEffect(() => {
    if (hasCruushPlus !== false) {
      return;
    }

    setExpiresIn('never');
    feedSettingsRef.current = { ...feedSettingsRef.current, postExpiryDefault: 'never' };
    setFeedSettings((currentSettings) => ({ ...currentSettings, postExpiryDefault: 'never' }));
    setPostAudience((currentAudience) => currentAudience === 'crowd' ? 'public' : currentAudience);
    setSelectedCrowdTargets([]);
    if (stagedPhotos.length > 0) {
      for (const photo of stagedPhotos) {
        void deleteStagedFeedPhoto(photo.id).catch(() => undefined);
      }
      setStagedPhotos([]);
    }
  }, [hasCruushPlus, stagedPhotos]);

  useEffect(() => {
    initialFeedSettingsRef.current = getFeedSettings()
      .then((settings) => {
        const nextSettings = { ...DEFAULT_FEED_SETTINGS, ...settings };
        if (hasCruushPlusRef.current === false) {
          nextSettings.postExpiryDefault = 'never';
        }
        applyFeedSettings(nextSettings);
        // Expiry is a per-post choice, so every composer starts at Never
        // rather than inheriting whatever the last post used.
        setFeedWindow(nextSettings.feedWindow);
        setFeedSettingsLoaded(true);
      })
      .catch(() => {
        applyFeedSettings(DEFAULT_FEED_SETTINGS);
        setFeedWindow(DEFAULT_FEED_SETTINGS.feedWindow);
        setFeedSettingsLoaded(false);
      });
    void getCurrentUserId()
      .then(setCurrentUserId)
      .catch(() => setCurrentUserId(null));
    void Promise.all([
      getMyCruushActivity(),
      getMutualCruushMap().catch(() => []),
    ])
      .then(([activity, mutualMapItems]) => {
        setMutualUserIds(new Set((activity.mutual ?? []).map((item) => item.user.id)));
        setValidPinUserIds(new Set(mutualMapItems
          .filter((item) => item.canRevealPreciseLocation === true
            && item.coordinates?.precision === 'precise'
            && (item.displayExpiresAtMs == null || item.displayExpiresAtMs > Date.now()))
          .map((item) => item.user.id)));
      })
      .catch(() => {
        setMutualUserIds(new Set());
        setValidPinUserIds(new Set());
      });
    void getMyProfile()
      .then(async (profile) => {
        const normalizedCrowds = normalizeCrowdValues(profile.crowds ?? []);
        const allowedCrowds = CROWDS.filter((crowd) => (
          normalizedCrowds.includes(crowd) && (crowd !== 'T4T' || profile.is_trans === true)
        ));
        const coordinates = profileFeedCoordinates(profile);
        setAvailableCrowdTargets(allowedCrowds);
        setSelectedCrowdTargets((currentTargets) => currentTargets.filter((crowd) => allowedCrowds.includes(crowd)));
        setFeedCoordinates(coordinates);
        await initialFeedSettingsRef.current;
        initialFeedRequestStartedRef.current = true;
        void fetchPosts({ coordinates, within: feedSettingsRef.current.feedWindow });
      })
      .catch(async () => {
        setAvailableCrowdTargets([]);
        setSelectedCrowdTargets([]);
        setFeedCoordinates(null);
        await initialFeedSettingsRef.current;
        initialFeedRequestStartedRef.current = true;
        void fetchPosts({ coordinates: null, within: feedSettingsRef.current.feedWindow });
      });

  }, []);

  useContentVisibilityRefresh(async (isCurrent) => {
    // Initial loading will query current permissions with the resolved location/settings.
    // Do not race it with a redundant request using temporary defaults.
    if (!initialFeedRequestStartedRef.current) return;
    // Replace the loaded window: appending cannot remove a now-banned author.
    const viewedAuthorId = photoViewer?.post.user.id;
    const refreshPhoto = viewedAuthorId ? getProfileById(viewedAuthorId).catch(error => {
      if (isCurrent() && error instanceof ProfileApiError && error.status === 404) {
        setPhotoViewer(current => current?.post.user.id === viewedAuthorId ? null : current);
      } else if (isCurrent()) throw error;
    }) : Promise.resolve();
    if (isCurrent()) await Promise.all([fetchPosts({ retryVisibilityFailure: true }), refreshPhoto]);
  });

  const loadMorePosts = useCallback(() => {
    if (loading || loadingMore || loadingMoreRequestRef.current || !hasMorePosts) {
      return;
    }

    const currentPosts = postsRef.current;
    const before = currentPosts[currentPosts.length - 1]?.createdAt ?? null;

    if (!before) {
      return;
    }

    void fetchPosts({ append: true, before, cursor: currentPosts[currentPosts.length - 1]?.paginationCursor });
  }, [fetchPosts, hasMorePosts, loading, loadingMore]);

  const handlePostsScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight <= 280) {
      loadMorePosts();
    }
  }, [loadMorePosts]);

  useEffect(() => {
    const node = loadMoreRef.current;

    if (!node || !hasMorePosts || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMorePosts();
      }
    }, { root: postsScrollRef.current, rootMargin: '280px' });

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMorePosts, loadMorePosts]);

  const handlePost = async () => {
    if (!newPost.trim() || posting || uploadingFeedPhoto || trust.restricted('feed_posting')) return;
    if (postAudience === 'crowd' && selectedCrowdTargets.length === 0) {
      setError('Pick at least one Crowd to post to, or choose a different audience.');
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const createdPost = await createFeedPost({
        content: newPost.trim(),
        expiresIn,
        audience: postAudience,
        showDistance: showDistanceOnPost,
        crowdTargets: postAudience === 'crowd' ? selectedCrowdTargets : [],
        photoMediaIds: stagedPhotos.map((photo) => photo.id),
        tags: postTags,
      });
      setNewPost('');
      setPostTags([]);
      setStagedPhotos([]);
      setPostAudience('public');
      setExpiresIn('never');
      setShowDistanceOnPost(true);
      setSelectedCrowdTargets([]);
      setPosts((prev) => {
        const nextPosts = [createdPost, ...prev];
        postsRef.current = nextPosts;
        return nextPosts;
      });
    } catch (error) {
      console.error('Error posting:', error);
      setError(error instanceof Error ? error.message : 'Failed to create post.');
    } finally {
      setPosting(false);
    }
  };

  const handleFeedPhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || trust.restricted('feed_posting') || trust.restricted('photo_uploads')) {
      return;
    }

    if (hasCruushPlus !== true) {
      setPlusCardOpen(true);
      return;
    }
    if (stagedPhotos.length >= 3) {
      setError('Confessional posts can include up to three photos.');
      return;
    }
    if (!file.type.startsWith('image/') && !PHOTO_UPLOAD_EXTENSION_TYPES.has(file.name.split('.').pop()?.toLowerCase() ?? '')) {
      setError(PHOTO_UPLOAD_FORMAT_MESSAGE);
      return;
    }

    const requestId = ++feedPhotoPreviewRequestRef.current;
    setError(null);
    setUploadingFeedPhoto(true);
    try {
      const preview = await readProfilePhotoPreviewUrl(file, { surface: 'feed' });
      if (feedPhotoPreviewRequestRef.current === requestId) {
        setPendingFeedPhotoUrl(preview.url);
      }
    } catch (previewError) {
      if (feedPhotoPreviewRequestRef.current === requestId) {
        setError(previewError instanceof Error ? previewError.message : 'Failed to upload Confessional photo.');
      }
    } finally {
      if (feedPhotoPreviewRequestRef.current === requestId) setUploadingFeedPhoto(false);
    }
  };

  const handleConfirmFeedPhotoCrop = async (file: File) => {
    if (uploadingFeedPhoto || posting) return;
    if (hasCruushPlusRef.current !== true) {
      setPendingFeedPhotoUrl(null);
      setPlusCardOpen(true);
      return;
    }
    if (stagedPhotos.length >= 3) {
      setError('Confessional posts can include up to three photos.');
      return;
    }
    setUploadingFeedPhoto(true);
    setError(null);
    try {
      const uploaded = await uploadFeedPhoto(file);
      if ('status' in uploaded) {
        setError('This photo is still being reviewed and cannot be attached yet.');
        setPendingFeedPhotoUrl(null);
        return;
      }

      setStagedPhotos((currentPhotos) => [...currentPhotos, uploaded].slice(0, 3));
      setPendingFeedPhotoUrl(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload Confessional photo.');
    } finally {
      setUploadingFeedPhoto(false);
    }
  };

  const handleRemoveStagedPhoto = async (photoId: string) => {
    setUploadingFeedPhoto(true);
    setError(null);
    try {
      await deleteStagedFeedPhoto(photoId);
      setStagedPhotos((currentPhotos) => currentPhotos.filter((photo) => photo.id !== photoId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove Confessional photo.');
    } finally {
      setUploadingFeedPhoto(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    setDeletingPostId(postId);
    setError(null);

    try {
      await deleteFeedPost(postId);
      setPosts((prev) => {
        const nextPosts = prev.filter((post) => post.id !== postId);
        postsRef.current = nextPosts;
        return nextPosts;
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete post.');
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleFeedPinVisibilityChange = async (locationPinVisibility: FeedLocationPinVisibility) => {
    setSettingsSaving(true);
    setError(null);

    try {
      await enqueueFeedSettingsUpdate({
        locationPinVisibility,
      });
      void fetchPosts();
    } catch (error) {
      console.error('Error saving feed settings:', error);
      setError(error instanceof Error ? error.message : 'Failed to save Confessional settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleFeedWindowChange = async (nextWindow: FeedPostWindow) => {
    setFeedWindow(nextWindow);
    try {
      await enqueueFeedSettingsUpdate({ feedWindow: nextWindow });
      await fetchPosts({ before: null, within: nextWindow });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save Confessional window.');
    }
  };

  const handleFeedPurgatoryVisibilityChange = async (hideFromPurgatory: boolean) => {
    setSettingsSaving(true);
    setError(null);
    try {
      await enqueueFeedSettingsUpdate({ hideFromPurgatory });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save feed settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const feedWindowIndex = Math.max(
    0,
    FEED_WINDOW_OPTIONS.findIndex((option) => option.value === feedWindow),
  );

  const handleFeedCruush = async (post: FeedPost) => {
    const userId = post.user.id;
    if (sendingCruushUserIds.has(userId)) return;

    setSendingCruushUserIds((current) => new Set(current).add(userId));
    try {
      if (mutualUserIds.has(userId)) {
        await revokeMutualCruush(userId);
        setMutualUserIds((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
        setSentCruushUserIds((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
        handleMutualCruushRevokeSuccess(userId, post.user.name);
        return;
      }

      if (sentCruushUserIds.has(userId)) {
        await revokeSentCruush(userId);
        setSentCruushUserIds((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
        handleSentCruushRevokeSuccess(userId, post.user.name);
        return;
      }

      const result = await sendCruush(userId, {
        name: post.user.name,
        pronouns: post.user.pronouns,
        photo: post.user.photo,
      });
      if (result.mutual === true) {
        setMutualUserIds((current) => new Set(current).add(userId));
      } else {
        setSentCruushUserIds((current) => new Set(current).add(userId));
      }
      handleCruushSendSuccess(userId, post.user.name, result);
    } catch (cruushError) {
      console.error('Error sending cruush from Feed:', cruushError);
      if (mutualUserIds.has(userId)) notifyMutualCruushRevokeError(cruushError);
      else if (sentCruushUserIds.has(userId)) notifySentCruushRevokeError(cruushError);
      else notifyCruushSendError(cruushError);
    } finally {
      setSendingCruushUserIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <>
    <div
      className={embedded
        ? 'relative flex h-full w-full max-w-full flex-col overflow-x-clip overflow-y-hidden bg-[#050505] text-foreground'
        : 'fixed inset-x-0 top-[var(--cruush-sale-banner-height,0px)] bottom-[var(--cruush-nav-clearance,6rem)] flex w-full max-w-full flex-col overflow-x-clip overflow-y-hidden bg-[#050505] pt-[env(safe-area-inset-top)] text-foreground'}
      data-testid="local-feed-screen"
    >
      <AppPageHeader
        className="z-40"
        testId="local-feed-header"
        title={settingsOpen ? 'Confessional settings' : 'Confessional'}
        onBack={() => {
            if (settingsOpen) {
              setSettingsOpen(false);
              return;
            }
            if (embedded && onClose) {
              onClose();
              return;
            }
            navigate(-1);
          }}
        onClose={embedded ? onClose : undefined}
        closeLabel="Close Confessional"
        bugButtonTestId="local-feed-bug-button-slot"
        actions={!settingsOpen ? <>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
          aria-label="Confessional seeking"
          title="Confessional seeking"
          aria-pressed={seekingOpen}
          onClick={() => setSeekingOpen((open) => !open)}
          style={seekingOpen || excludeMileHighClub || purgatoryFilter !== 'all' || JSON.stringify(feedSeekingFilters) !== JSON.stringify(DEFAULT_FEED_SEEKING_FILTERS)
            ? { background: 'var(--cruush-gradient-soft-28)' }
            : undefined}
        >
          <SlidersHorizontal className="h-5 w-5" />
        </Button>
        {embedded ? (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
            aria-label="Confessional settings"
            title="Confessional settings"
            onClick={() => setSettingsOpen(true)}
          >
            <CruushIcon name="settings" className="h-5 w-5" />
          </Button>
        ) : <Button
          variant="ghost"
          size="icon"
          className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
          aria-label="Confessional settings"
          title="Confessional settings"
          onClick={() => setSettingsOpen(true)}
        >
          <CruushIcon name="settings" className="h-5 w-5" />
        </Button>}
        </> : null}
      />

      {settingsOpen ? (
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]" data-testid="feed-settings-page">
          <div className={ghostSettingsBodyClassName}>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className={`${ghostSettingsCardClassName} !space-y-4`}>
            <section className="space-y-3 rounded-lg border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Posted within</p>
                <span className="rounded-full border border-white/10 bg-white/[0.025] px-2.5 py-1 text-xs text-white/70">
                  {FEED_WINDOW_OPTIONS[feedWindowIndex]?.label ?? '30d'}
                </span>
              </div>
              <Slider
                aria-label="Posted within"
                className="mt-3"
                max={FEED_WINDOW_OPTIONS.length - 1}
                min={0}
                step={1}
                value={[feedWindowIndex]}
                onValueChange={([index]) => {
                  const option = FEED_WINDOW_OPTIONS[index];
                  if (option) void handleFeedWindowChange(option.value);
                }}
              />
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>{FEED_WINDOW_OPTIONS[0].label}</span>
                <span>{FEED_WINDOW_OPTIONS[FEED_WINDOW_OPTIONS.length - 1].label}</span>
              </div>
            </section>

            <section className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.025] p-4">
              <label className="text-sm font-semibold text-white" htmlFor="feed-hide-from-purgatory">Hide my Confessional posts from Purgatory members</label>
              <Switch
                id="feed-hide-from-purgatory"
                checked={feedSettings.hideFromPurgatory === true}
                disabled={settingsSaving || !feedSettingsLoaded}
                onCheckedChange={(enabled) => void handleFeedPurgatoryVisibilityChange(enabled)}
              />
            </section>
            <section
              aria-disabled={!profilePinsAllowed}
              className={`space-y-2 rounded-lg border border-white/10 bg-white/[0.025] p-4 ${!profilePinsAllowed ? 'grayscale opacity-40' : ''}`}
            >
              <p className="text-sm font-semibold text-white">Who can open my map location from Confessional posts</p>
              {FEED_LOCATION_PIN_OPTIONS.map((option) => {
                const active = feedSettings.locationPinVisibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={[
                      'w-full rounded-lg border p-3 text-left transition',
                      active
                        ? 'border-primary/45 text-white'
                        : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                    ].join(' ')}
                    style={active ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                    aria-pressed={active}
                    disabled={!profilePinsAllowed || settingsSaving || !feedSettingsLoaded}
                    onClick={() => void handleFeedPinVisibilityChange(option.value)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{option.label}</span>
                      {active ? <span className="text-xs uppercase tracking-[0.16em] text-primary">active</span> : null}
                    </span>
                    {!embedded ? <span className="mt-1 block text-xs text-white/58">{option.description}</span> : null}
                  </button>
                );
              })}
            </section>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`${settingsOpen ? 'hidden ' : ''}mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden px-3 pt-4`} data-testid="local-feed-content">
        <div className="flex max-h-full min-h-0 shrink-0 flex-col rounded-2xl border border-white/10 bg-black/82 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur" data-testid="local-feed-composer">
          {error ? (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <TrustRestrictionNotice message={trust.message('feed_posting', 'Confessional posting')} />
          {!composerOpen ? (
            <button
              type="button"
              className="bg-input-background flex w-full items-center gap-3 rounded-md border border-white/10 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
              disabled={trust.restricted('feed_posting')}
              data-testid="local-feed-composer-open"
              ref={composerOpenButtonRef}
              onClick={() => {
                setComposerOpen(true);
                requestAnimationFrame(() => composerInputRef.current?.focus());
              }}
            >
              <CruushIcon name="send" className="h-4 w-4 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate">Share something with nearby people...</span>
            </button>
          ) : null}
          {/* The open composer scrolls inside the height it has above the
              bottom navigation bar, and the Post row sticks to its end. */}
          <div id={composerPanelId} className={composerOpen ? 'scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain' : 'hidden'}>
          <Accordion
            collapsible
            type="single"
            value={composerOpen ? 'composer' : ''}
            onValueChange={(value) => {
              const open = value === 'composer';
              setComposerOpen(open);
              if (!open) requestAnimationFrame(() => composerOpenButtonRef.current?.focus());
            }}
          >
            <AccordionItem className="border-0" value="composer">
              <AccordionTrigger aria-controls={composerPanelId} aria-label="Collapse Confessional input" className="mb-3 justify-end py-0" />
            </AccordionItem>
          </Accordion>
          <Textarea
            disabled={trust.restricted('feed_posting')}
            ref={composerInputRef}
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder="Share something with nearby people..."
            className="bg-input-background mb-2 min-h-16"
          />
          <div className="mb-2 space-y-2">
            <TagInput
              ariaLabel="Add Confessional tag"
              disabled={trust.restricted('feed_posting') || !hasCruushPlus}
              maxTags={MAX_FEED_POST_TAGS}
              onChange={setPostTags}
              onError={setError}
              placeholder={hasCruushPlus ? '#tag' : 'Tags are part of cruush+'}
              tags={postTags}
              testId="feed-post-tags-draft"
            />
            {hasCruushPlus ? (
              <p className="text-xs text-white/58">Up to {MAX_FEED_POST_TAGS} tags.</p>
            ) : null}
            <div>
              <input
                accept={PHOTO_UPLOAD_ACCEPT}
                disabled={trust.restricted('feed_posting') || trust.restricted('photo_uploads')}
                aria-label="Choose Confessional photo"
                className="sr-only"
                onChange={handleFeedPhotoSelection}
                ref={feedPhotoInputRef}
                type="file"
              />
              <TrustRestrictionNotice message={!trust.restricted('feed_posting') ? trust.message('photo_uploads', 'Photo uploading') : null} />
            </div>
            {/* Expiry belongs to the post being written, not to a setting
                applied to everything. Every composer starts at Never. */}
            <section className="rounded-lg border border-white/10 bg-black/42 p-2">
              <p className="mb-1 text-sm font-semibold text-white">This post expires</p>
              {/* A slider rather than a row of buttons: the options are an
                  ordered scale from 30 minutes to never, so sliding along it
                  reads better than picking one of six pills. */}
              <Slider
                disabled={trust.restricted('feed_posting')}
                aria-label="This post expires"
                className="mt-1"
                data-testid="feed-expiry-slider"
                max={FEED_EXPIRY_OPTIONS.length - 1}
                min={0}
                step={1}
                value={[Math.max(0, FEED_EXPIRY_OPTIONS.findIndex((option) => option.value === expiresIn))]}
                onValueChange={([index]) => {
                  if (billingStatusConfirmed && hasCruushPlus === false) {
                    navigate(buildCruushPlusStorePath('feed_plus', 'feed_plus'));
                    return;
                  }
                  if (!billingStatusConfirmed) return;
                  const option = FEED_EXPIRY_OPTIONS[index];
                  if (option) setExpiresIn(option.value);
                }}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-white/58">
                <span>{FEED_EXPIRY_OPTIONS[0].label}</span>
                <span className="font-semibold text-white" data-testid="feed-expiry-value">
                  {FEED_EXPIRY_OPTIONS.find((option) => option.value === expiresIn)?.label ?? 'Never'}
                </span>
                <span>{FEED_EXPIRY_OPTIONS[FEED_EXPIRY_OPTIONS.length - 1].label}</span>
              </div>
              <p className="mt-2 text-xs text-white/58">Never expire is free. Custom timers are part of cruush+.</p>
            </section>
            <Accordion type="single" collapsible>
              <AccordionItem value="post-audience" className="rounded-lg border border-white/10 bg-black/42 p-2 data-[state=open]:rounded-lg">
                <AccordionTrigger aria-label="Toggle post audience" className="w-full text-sm font-semibold text-white">
                  Who can see this post
                </AccordionTrigger>
                <AccordionContent>
                <p className="mb-2 mt-1 text-xs text-white/58">Public and Cruushes are free. Crowd mode is part of cruush+.</p>
                <MultiSelect
                  ariaLabel="Who can see this post"
                  menuPortal
                  options={hasCruushPlus === true ? ['Public', 'Cruushes', ...availableCrowdTargets] : ['Public', 'Cruushes', 'Crowd mode']}
                  value={postAudience === 'crowd'
                    ? selectedCrowdTargets
                    : [postAudience === 'mutuals' ? 'Cruushes' : 'Public']}
                  onChange={(values) => {
                    const selected = values[values.length - 1];
                    const crowdTargets = values.filter((value) => availableCrowdTargets.includes(value));

                    if (selected === 'Crowd mode') {
                      navigate(buildCruushPlusStorePath('feed_plus', 'feed_plus'));
                      return;
                    }

                    if (selected && crowdTargets.includes(selected)) {
                      if (hasCruushPlus !== true) {
                        navigate(buildCruushPlusStorePath('feed_plus', 'feed_plus'));
                        return;
                      }

                      setPostAudience('crowd');
                      setSelectedCrowdTargets(crowdTargets);
                      return;
                    }

                    if (selected === 'Cruushes') {
                      setPostAudience('mutuals');
                      setSelectedCrowdTargets([]);
                      return;
                    }

                    setPostAudience('public');
                    setSelectedCrowdTargets([]);
                  }}
                />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          {stagedPhotos.length > 0 ? (
            <div className="mb-2 space-y-2 rounded-xl border border-white/10 bg-black/45 p-2" data-testid="feed-photo-staging">
              <FeedAttachmentPreview
                borderColor={USER_BORDER_COLORS.current}
                dlModeActive={false}
                onOpen={() => undefined}
                photos={stagedPhotos}
              />
              <div className="flex flex-wrap gap-2">
                {stagedPhotos.map((photo, index) => (
                  <button
                    aria-label={`Remove Confessional photo ${index + 1}`}
                    className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-black/60 px-2.5 py-1 text-xs text-white/72 transition hover:bg-white/10 hover:text-white"
                    disabled={uploadingFeedPhoto}
                    key={photo.id}
                    onClick={() => void handleRemoveStagedPhoto(photo.id)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Photo {index + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-black/82 pt-2">
            <label className="flex min-w-0 items-center gap-2 text-xs text-white/72">
              <Switch
                aria-label="Show distance on Confessional post"
                checked={showDistanceOnPost}
                disabled={posting || trust.restricted('feed_posting')}
                onCheckedChange={setShowDistanceOnPost}
              />
              <span>Show distance on Confessional post</span>
            </label>
            <div className={`flex min-w-fit flex-1 items-center justify-end gap-2 ${hasCruushPlus !== true ? 'cruush-feed-composer-basic-actions' : ''}`}>
              <div className="cruush-feed-photo-control flex min-w-0 items-center gap-2">
                <Button
                  aria-label={hasCruushPlus === true ? 'Add Confessional photo' : 'Confessional photos require cruush+'}
                  className={[
                    'relative overflow-hidden transition before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(105deg,transparent_30%,rgba(255,255,255,0.28)_50%,transparent_70%)] before:opacity-0 hover:before:opacity-100',
                    hasCruushPlus === true
                      ? 'border-transparent text-white'
                      : 'border-white/12 text-white/60 hover:text-white/80',
                  ].join(' ')}
                  disabled={uploadingFeedPhoto || stagedPhotos.length >= 3 || trust.restricted('feed_posting') || trust.restricted('photo_uploads')}
                  onClick={() => {
                    if (hasCruushPlus !== true) {
                      navigate(buildCruushPlusStorePath('feed_plus', 'feed_plus'));
                      return;
                    }
                    feedPhotoInputRef.current?.click();
                  }}
                  style={{
                    background: hasCruushPlus !== true || stagedPhotos.length >= 3 || trust.restricted('feed_posting') || trust.restricted('photo_uploads') ? 'var(--cruush-gradient)' : 'var(--cruush-gradient-soft-28)',
                    opacity: hasCruushPlus !== true || stagedPhotos.length >= 3 || trust.restricted('feed_posting') || trust.restricted('photo_uploads') ? 0.5 : undefined,
                  }}
                  type="button"
                >
                  {uploadingFeedPhoto ? <PhotoUploadSpinner className="mr-2 h-4 w-4" /> : null}
                  {`Photo${hasCruushPlus === true ? ` ${stagedPhotos.length}/3` : ' +'}`}
                </Button>
                {hasCruushPlus !== true ? (
                  <p className="min-w-0 text-xs text-white/58">cruush+ includes up to 3 photos.</p>
                ) : null}
              </div>
              <Button
                className={[
                  'relative overflow-hidden text-white transition before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(105deg,transparent_30%,rgba(255,255,255,0.28)_50%,transparent_70%)] before:opacity-0 hover:before:opacity-100 disabled:text-white disabled:opacity-100',
                ].join(' ')}
                onClick={handlePost}
                disabled={!newPost.trim() || posting || uploadingFeedPhoto || trust.restricted('feed_posting')}
                style={{ background: 'var(--cruush-gradient)', opacity: !newPost.trim() || trust.restricted('feed_posting') ? 0.5 : undefined }}
              >
                <CruushIcon name="send" className="mr-2 h-4 w-4" />
                {posting ? 'Posting...' : 'Post'}
              </Button>
            </div>
          </div>
          </div>
        </div>

        <div
          ref={postsScrollRef}
          className="scrollbar-hide mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
          data-testid="local-feed-posts-scroll"
          onScroll={handlePostsScroll}
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {loading ? (
            <LoadingCardSkeletons label="Loading nearby posts" />
          ) : null}

          {!loading ? (
            <div className="space-y-2">
              {posts.map((post) => {
                const mutualAuthor = mutualUserIds.has(post.user.id);
                const pinActionable = validPinUserIds.has(post.user.id);
                const borderTone = resolveUserBorderTone({
                  current: currentUserId === post.user.id,
                  mileHigh: post.user.travelling,
                  mutual: mutualAuthor,
                });
                return (
                <UserActivityCapsule
                  key={post.id}
                  testId={`feed-post-${post.id}`}
                  className="bg-black/72 hover:bg-black/86"
                  outOfSight={showPurgatoryPresentation(post.user.outOfSight, post.user.travelling)}
                  heart={(
                    <div className={`${showPurgatoryPresentation(post.user.outOfSight, post.user.travelling) && post.user.vibes?.length ? "mt-1" : "-mt-1"} w-20`} data-testid={`feed-post-profile-stack-${post.id}`}>
                      <HeartPhoto
                        borderTone={borderTone}
                        className="w-full"
                        label={`${post.user.name} preview`}
                        masked={shouldMaskPhoto(dlModeActive, post.user.photoExplicit, { ...post.user.photoRelationship, isMutualCruush: mutualAuthor, sharesCrowd: post.user.sharesCrowd })}
                        restriction={getNsfwPhotoRestriction(post.user.photoExplicit, post.user.photoRelationship)}
                        photo={post.user?.photo}
                        outOfSight={showPurgatoryPresentation(post.user.outOfSight, post.user.travelling)}
                        staticMileHigh={post.user.id === currentUserId && post.user.travelling === true}
                        theme={currentUserId && post.user.id === currentUserId ? 'current' : mutualAuthor ? 'mutual' : 'nearby'}
                        userId={post.user.id}
                        onClick={() => navigate(`/profile/${post.user.id}`, { state: { distance: post.distance } })}
                      />
                    </div>
                  )}
                  name={(
                    <button
                      className="text-left"
                      data-testid={`feed-post-author-${post.id}`}
                      onClick={() => navigate(`/profile/${post.user.id}`, { state: { distance: post.distance } })}
                      title={post.user.name}
                      type="button"
                    >
                      {post.user.name}
                    </button>
                  )}
                  pronouns={post.user.pronouns || 'ask me'}
                  sideBadges={post.user.sideBadges}
                  sideBadgeTone={borderTone}
                  identityAdornment={(
                    <>
                      <CruushBadge badges={post.user.badges} compact />
                      {post.user.attendingLaunchParty ? (
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center border-0 bg-transparent p-0 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#03ecfc]/65"
                          aria-label="Center map on launch party"
                          title="Center map on launch party"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate('/map', { state: { centerEventSlug: LAUNCH_PARTY_EVENT_SLUG } });
                          }}
                        >
                          <img alt="" aria-hidden="true" className="h-5 w-5 drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]" src={partyHatIcon} />
                        </button>
                      ) : null}
                    </>
                  )}
                  metadata={(
                    <button type="button" className="flex h-11 min-w-0 flex-col justify-center gap-0.5 text-left text-xs leading-snug text-white/62 sm:text-sm" onClick={() => navigate(`/profile/${post.user.id}`, { state: { distance: post.distance } })} data-testid={`feed-post-meta-${post.id}`}>
                      <span className="truncate">{formatRelativeTime(post.createdAt)}</span>
                      <span className="truncate">{formatDistanceLabel(post.distance, distancePreferences.mode)}</span>
                    </button>
                  )}
                  actions={(
                    <div className="flex w-full items-center justify-end gap-2">
                      {currentUserId && post.user.id !== currentUserId ? (
                        <ProfileActionTrio
                          canCenterPin={pinActionable}
                          canMessage={post.user.canMessage === true}
                          cruushReceived={mutualAuthor}
                          cruushState={sendingCruushUserIds.has(post.user.id)
                            ? 'sending'
                            : mutualAuthor
                              ? 'mutual'
                              : sentCruushUserIds.has(post.user.id)
                                ? 'sent'
                                : 'available'}
                          onCenterPin={() => navigate(`/map?mode=mutuals&focusUserId=${encodeURIComponent(post.locationPin?.userId ?? post.user.id)}`)}
                          onCruush={() => void handleFeedCruush(post)}
                          onMessage={() => navigate('/map', {
                            state: {
                              openSidePanel: 'messages',
                              openConversationWithUserId: post.user.id,
                            },
                          })}
                          size="sm"
                          userName={post.user.name}
                        />
                      ) : null}
                    </div>
                  )}
                  mutual={mutualAuthor}
                  vibes={post.user.vibes}
                  vibeTone={post.user.id === currentUserId ? 'current' : mutualAuthor ? 'mutual' : 'nearby'}
                  wrapVibes
                  content={(
                    <div className="space-y-1.5">
                      <p className="text-[calc(var(--text-xs)+1px)] sm:text-[calc(var(--text-sm)+1px)]">{post.content}</p>

                      <FeedAttachmentPreview
                        borderColor={USER_BORDER_COLORS[borderTone]}
                        dlModeActive={dlModeActive}
                        relationship={{ ...post.user.photoRelationship, isMutualCruush: mutualAuthor, sharesCrowd: post.user.sharesCrowd }}
                        onOpen={(index) => setPhotoViewer({ post, index })}
                        photos={post.photos ?? []}
                      />
                    </div>
                  )}
                  cornerAction={(
                    <>
                      {(post.tags?.length ?? 0) > 0 ? (
                        <div className="mr-auto flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1 text-sm text-white/62">
                          {post.tags?.map((tag) => <span key={tag}>#{tag}</span>)}
                        </div>
                      ) : null}
                      <span className="flex items-center gap-1 text-[11px] text-white/52"><Clock className="h-3 w-3" />{formatFeedExpiry(post.expiresIn)}</span>
                      {currentUserId && post.user.id !== currentUserId ? (
                        <ReportAction
                          targetType="post"
                          targetId={post.id}
                          targetLabel={`post by ${post.user.name}`}
                          targetUserId={post.user.id}
                          // size-9 from the icon variant wins over a plain
                          // h-7/w-7, so the button kept a hit area wider than
                          // the flag and pushed into the metadata beside it.
                          className="!size-7 shrink-0 p-0 text-muted-foreground hover:text-white"
                        />
                      ) : null}
                      {currentUserId && post.user.id === currentUserId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-white"
                          aria-label={`Delete Confessional post: ${post.content.slice(0, 48)}`}
                          title="Delete post"
                          disabled={deletingPostId === post.id}
                          onClick={() => void handleDeletePost(post.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </>
                  )}
                />
                );
              })}
              {hasMorePosts || loadingMore ? (
                <div
                  ref={loadMoreRef}
                  className="min-h-12 rounded-2xl border border-white/0 p-3 text-center text-sm text-white/45"
                  aria-live="polite"
                >
                  {loadingMore ? 'Loading more posts...' : ''}
                </div>
              ) : null}
            </div>
          ) : null}

          {!loading && posts.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/72 p-12 text-center">
              <p className="text-white/68">{feedSeekingFilters.searchQuery.trim() ? 'No posts match that search.' : 'No posts nearby yet.'}</p>
              <p className="text-sm text-white/50 mt-2">{feedSeekingFilters.searchQuery.trim() ? 'Try another #tag or clear the search.' : 'Be the first to share something!'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    <MapFiltersSurface
      allowGlobalDistance
      description={null}
      excludeMileHighClub={excludeMileHighClubDraft}
      purgatoryFilter={purgatoryFilterDraft}
      onPurgatoryFilterChange={value => { seekingDraftEdited.current = true; setPurgatoryFilterDraft(value); }}
      hasCruushPlus={hasCruushPlus === true}
      onApply={() => {
        seekingDraftEdited.current = false;
        const nextFilters = { ...feedSeekingDraft };
        setFeedSeekingDraft(nextFilters);
        setFeedSeekingFilters(nextFilters);
        setExcludeMileHighClub(excludeMileHighClubDraft);
        setPurgatoryFilter(purgatoryFilterDraft);
        setSeekingOpen(false);
        void fetchPosts({
          before: null,
          distanceMiles: nextFilters.distance,
          seekingFilters: nextFilters,
          excludeMileHighClub: excludeMileHighClubDraft,
          purgatoryFilter: purgatoryFilterDraft,
        });
      }}
      onChange={value => { seekingDraftEdited.current = true; setFeedSeekingDraft(value); }}
      onClear={() => {
        seekingDraftEdited.current = true;
        setFeedSeekingDraft(DEFAULT_FEED_SEEKING_FILTERS);
        setExcludeMileHighClubDraft(false);
        setPurgatoryFilterDraft('all');
      }}
      onExcludeMileHighClubChange={value => { seekingDraftEdited.current = true; setExcludeMileHighClubDraft(value); }}
      onOpenChange={setSeekingOpen}
      onUpgrade={() => setPlusCardOpen(true)}
      conversionSurface="feed_plus"
      open={seekingOpen}
      searchPlaceholder="Search #tags"
      title="Confessional Filter"
      value={feedSeekingDraft}
    />
    {pendingFeedPhotoUrl ? (
      <ProfilePhotoCropper
        onCancel={() => setPendingFeedPhotoUrl(null)}
        onConfirm={handleConfirmFeedPhotoCrop}
        processing={uploadingFeedPhoto}
        sourceUrl={pendingFeedPhotoUrl}
        subjectLabel="Confessional photo"
      />
    ) : null}
    {photoViewer ? (
      <FeedPhotoViewer
        authorName={photoViewer.post.user.name}
        index={photoViewer.index}
        onClose={() => setPhotoViewer(null)}
        onIndexChange={(index) => setPhotoViewer((current) => current ? { ...current, index } : current)}
        photos={photoViewer.post.photos ?? []}
        postId={photoViewer.post.id}
      />
    ) : null}
    <CruushPlusCardDialog
      open={plusCardOpen}
      onOpenChange={setPlusCardOpen}
      onUpgrade={() => navigate(buildCruushPlusStorePath('feed_plus', 'feed_plus'))}
      surface="feed_plus"
      benefit="feed_plus"
      title="cruush+"
      description="Add up to three photos, post to a specific Crowd, and choose when your post expires."
    />
    </>
  );
}
