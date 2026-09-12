import PhotoUploadSpinner from './PhotoUploadSpinner';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { PHOTO_UPLOAD_ACCEPT, PHOTO_UPLOAD_FORMAT_MESSAGE, PHOTO_UPLOAD_EXTENSION_TYPES } from '../lib/photoUploadFormats';
import { useLocation, useNavigate } from 'react-router';
import { formatDistanceLabel, useDistancePreferences } from '../lib/distancePreferences';
import { ArrowLeft, Clock, Hash, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Accordion, AccordionItem, AccordionTrigger } from './ui/accordion';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Textarea } from './ui/textarea';
import BugButtonSlot from './BugButtonSlot';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
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
import { getMyProfile, type ProfileRecord } from '../lib/profileApi';
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
import { resolveUserBorderTone } from '../lib/userBorderTone';
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
  { value: 'mutuals', label: 'mutuals', description: 'Only mutuals see your feed pin.' },
  { value: 'same_crowd', label: 'same crowd', description: 'People sharing one of your crowds see your feed pin.' },
  { value: 'public', label: 'public', description: 'Anyone who can read your post can tap through to your map pin.' },
  { value: 'off', label: 'off', description: 'Do not show a feed pin on your posts.' },
];

const FEED_WINDOW_OPTIONS: Array<{ value: FeedPostWindow; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '24h', label: '24h' },
  { value: '6h', label: '6h' },
  { value: '3h', label: '3h' },
  { value: '1h', label: '1h' },
];
const FEED_EXPIRY_OPTIONS: Array<{ value: FeedPostExpiry; label: string }> = [
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '3h', label: '3h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: 'never', label: 'Never' },
];
const FEED_PAGE_SIZE = 30;
// The open beta covers fifty miles around NYC, so the feed reaches that far.
const DEFAULT_FEED_RADIUS_MILES = 50;
const DEFAULT_FEED_SEEKING_FILTERS: FilterState = {
  ...DEFAULT_FILTER_STATE,
  distance: DEFAULT_FEED_RADIUS_MILES,
};
const LAUNCH_PARTY_EVENT_SLUG = 'the-chocolate-factory-launch';
const DEFAULT_FEED_SETTINGS: FeedSettings = {
  locationPinVisibility: 'mutuals',
  showDistanceLabels: true,
  postExpiryDefault: 'never',
  feedWindow: '7d',
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

function normalizeFeedTag(value: string) {
  return value
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

/** Matches the server ceiling in post-schema.ts. */
const MAX_FEED_POST_TAGS = 10;

export default function LocalFeed({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void; onOpenSettings?: () => void } = {}) {
  const distancePreferences = useDistancePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [newPost, setNewPost] = useState('');
  const [newTag, setNewTag] = useState('');
  const [postTags, setPostTags] = useState<string[]>([]);
  // The composer stays a single row until it is opened. Expanded it takes a
  // third of a phone screen, which pushed the first post below the fold.
  const [composerOpen, setComposerOpen] = useState(false);
  const composerPanelId = useId();
  const composerOpenButtonRef = useRef<HTMLButtonElement | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [expiresIn, setExpiresIn] = useState<FeedPostExpiry>('never');
  const [postAudience, setPostAudience] = useState<FeedPostAudience>('public');
  const [hasCruushPlus, setHasCruushPlus] = useState<boolean | null>(null);
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
  const [feedWindow, setFeedWindow] = useState<FeedPostWindow>('7d');
  const [feedDistanceMiles, setFeedDistanceMiles] = useState(DEFAULT_FEED_RADIUS_MILES);
  const [feedCoordinates, setFeedCoordinates] = useState<FeedCoordinates | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [seekingOpen, setSeekingOpen] = useState(false);
  const [feedSeekingDraft, setFeedSeekingDraft] = useState<FilterState>(DEFAULT_FEED_SEEKING_FILTERS);
  const [feedSeekingFilters, setFeedSeekingFilters] = useState<FilterState>(DEFAULT_FEED_SEEKING_FILTERS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [feedSettingsLoaded, setFeedSettingsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const feedPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const hasCruushPlusRef = useRef<boolean | null>(null);
  const feedSettingsRef = useRef<FeedSettings>(DEFAULT_FEED_SETTINGS);
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
    append?: boolean;
    before?: string | null;
    coordinates?: FeedCoordinates | null;
    distanceMiles?: number;
    within?: FeedPostWindow;
    seekingFilters?: FilterState;
  } = {}) => {
    const append = options.append === true;
    const nextCoordinates = options.coordinates === undefined ? feedCoordinates : options.coordinates;
    const nextWindow = options.within ?? feedWindow;
    const nextSeekingFilters = options.seekingFilters ?? feedSeekingFilters;
    const nextDistanceMiles = Math.min(
      options.distanceMiles ?? feedDistanceMiles,
      nextSeekingFilters.distance,
      DEFAULT_FEED_RADIUS_MILES,
    );

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const nextPosts = await getFeedPosts({
        before: options.before ?? undefined,
        coordinates: nextCoordinates,
        distanceMiles: nextDistanceMiles,
        limit: FEED_PAGE_SIZE,
        within: nextWindow,
        seeking: nextSeekingFilters,
      });

      setPosts((currentPosts) => {
        if (!append) {
          return nextPosts;
        }

        const knownPostIds = new Set(currentPosts.map((post) => post.id));
        return [
          ...currentPosts,
          ...nextPosts.filter((post) => !knownPostIds.has(post.id)),
        ];
      });
      setHasMorePosts(nextPosts.length >= FEED_PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching posts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load the local feed.');
      if (!append) {
        setPosts([]);
        setHasMorePosts(false);
      }
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [feedCoordinates, feedDistanceMiles, feedSeekingFilters, feedWindow]);

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  useEffect(() => {
    if (!photoViewer) {
      return;
    }
    const activePhoto = photoViewer.post.photos?.[photoViewer.index];
    if (shouldMaskPhoto(dlModeActive, activePhoto?.explicit)) {
      setPhotoViewer(null);
    }
  }, [dlModeActive, photoViewer]);

  useEffect(() => () => {
    if (pendingFeedPhotoUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(pendingFeedPhotoUrl);
    }
  }, [pendingFeedPhotoUrl]);

  useEffect(() => {
    let active = true;

    const loadBillingStatus = () => {
      void getMyBillingStatus()
        .then((status) => {
          if (active) {
            hasCruushPlusRef.current = status.cruushPlus === true;
            setHasCruushPlus(hasCruushPlusRef.current);
          }
        })
        .catch(() => {
          if (active) {
            hasCruushPlusRef.current = false;
            setHasCruushPlus(false);
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
    void getFeedSettings()
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
      .then((profile) => {
        const normalizedCrowds = normalizeCrowdValues(profile.crowds ?? []);
        const allowedCrowds = CROWDS.filter((crowd) => (
          normalizedCrowds.includes(crowd) && (crowd !== 'T4T' || profile.is_trans === true)
        ));
        const coordinates = profileFeedCoordinates(profile);
        setAvailableCrowdTargets(allowedCrowds);
        setSelectedCrowdTargets((currentTargets) => currentTargets.filter((crowd) => allowedCrowds.includes(crowd)));
        setFeedCoordinates(coordinates);
        void fetchPosts({ coordinates });
      })
      .catch(() => {
        setAvailableCrowdTargets([]);
        setSelectedCrowdTargets([]);
        setFeedCoordinates(null);
        void fetchPosts({ coordinates: null });
      });

  }, []);

  const loadMorePosts = useCallback(() => {
    if (loading || loadingMore || !hasMorePosts) {
      return;
    }

    const before = posts[posts.length - 1]?.createdAt ?? null;

    if (!before) {
      return;
    }

    void fetchPosts({ append: true, before });
  }, [fetchPosts, hasMorePosts, loading, loadingMore, posts]);

  useEffect(() => {
    const node = loadMoreRef.current;

    if (!node || !hasMorePosts || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMorePosts();
      }
    }, { rootMargin: '280px' });

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMorePosts, loadMorePosts]);

  const handlePost = async () => {
    if (!newPost.trim() || posting || uploadingFeedPhoto) return;

    setPosting(true);
    setError(null);
    try {
      const createdPost = await createFeedPost({
        content: newPost.trim(),
        expiresIn,
        audience: postAudience,
        crowdTargets: postAudience === 'crowd' ? selectedCrowdTargets : [],
        photoMediaIds: stagedPhotos.map((photo) => photo.id),
        tags: postTags,
      });
      setNewPost('');
      setNewTag('');
      setPostTags([]);
      setStagedPhotos([]);
      setPostAudience('public');
      setExpiresIn('never');
      setSelectedCrowdTargets([]);
      setPosts((prev) => [createdPost, ...prev]);
    } catch (error) {
      console.error('Error posting:', error);
      setError(error instanceof Error ? error.message : 'Failed to create post.');
    } finally {
      setPosting(false);
    }
  };

  const addPostTag = () => {
    const tag = normalizeFeedTag(newTag);
    if (!tag || postTags.includes(tag)) {
      setNewTag('');
      return;
    }
    if (!hasCruushPlus) {
      setError('Tagging a Feed post is part of cruush+.');
      return;
    }
    if (postTags.length >= MAX_FEED_POST_TAGS) {
      setError('Feed posts can include up to ten tags.');
      return;
    }
    setPostTags((currentTags) => [...currentTags, tag]);
    setNewTag('');
    setError(null);
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',') {
      return;
    }
    event.preventDefault();
    addPostTag();
  };

  const handleFeedPhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (hasCruushPlus !== true) {
      setPlusCardOpen(true);
      return;
    }
    if (stagedPhotos.length >= 3) {
      setError('Feed posts can include up to three photos.');
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
        setError(previewError instanceof Error ? previewError.message : 'Failed to upload Feed photo.');
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
      setError('Feed posts can include up to three photos.');
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
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload Feed photo.');
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
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove Feed photo.');
    } finally {
      setUploadingFeedPhoto(false);
    }
  };

  const toggleCrowdTarget = (crowd: string) => {
    setSelectedCrowdTargets((currentTargets) => currentTargets[0] === crowd ? [] : [crowd]);
  };

  const handleDeletePost = async (postId: string) => {
    setDeletingPostId(postId);
    setError(null);

    try {
      await deleteFeedPost(postId);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
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
      setError(error instanceof Error ? error.message : 'Failed to save feed settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDistanceLabelVisibilityChange = async (showDistanceLabels: boolean) => {
    setSettingsSaving(true);
    setError(null);

    try {
      await enqueueFeedSettingsUpdate({
        showDistanceLabels,
      });
    } catch (error) {
      console.error('Error saving feed settings:', error);
      setError(error instanceof Error ? error.message : 'Failed to save feed settings.');
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
      setError(error instanceof Error ? error.message : 'Failed to save feed window.');
    }
  };

  const handleFeedDistanceChange = (nextDistanceMiles: number) => {
    setFeedDistanceMiles(nextDistanceMiles);
    void fetchPosts({ before: null, distanceMiles: nextDistanceMiles });
  };

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
        : 'fixed inset-0 flex h-[100dvh] w-full max-w-full flex-col overflow-x-clip overflow-y-hidden bg-[#050505] pt-[env(safe-area-inset-top)] text-foreground'}
      data-testid="local-feed-screen"
    >
      <header
        className="sticky top-0 z-40 flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/88 pb-3 pl-4 pr-4 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-[0_20px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl"
        data-testid="local-feed-header"
      >
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
          aria-label="Back"
          title="Back"
          onClick={() => {
            if (embedded && settingsOpen) {
              setSettingsOpen(false);
              return;
            }
            if (embedded && onClose) {
              onClose();
              return;
            }
            navigate(-1);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl text-white sm:text-3xl">{embedded && settingsOpen ? 'Feed settings' : 'Feed'}</h2>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
        {!(embedded && settingsOpen) ? <>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
          aria-label="Feed seeking"
          title="Feed seeking"
          aria-pressed={seekingOpen}
          onClick={() => setSeekingOpen((open) => !open)}
          style={seekingOpen || JSON.stringify(feedSeekingFilters) !== JSON.stringify(DEFAULT_FEED_SEEKING_FILTERS)
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
            aria-label="Feed settings"
            title="Feed settings"
            onClick={() => setSettingsOpen(true)}
          >
            <CruushIcon name="settings" className="h-5 w-5" />
          </Button>
        ) : <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
              aria-label="Feed settings"
              title="Feed settings"
            >
              <CruushIcon name="settings" className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="scrollbar-hide top-[calc(0.75rem+env(safe-area-inset-top))] max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top))] max-w-md translate-y-0 overflow-y-auto overscroll-contain rounded-lg border-white/10 bg-background pb-[calc(1.5rem+env(safe-area-inset-bottom))] [&_[data-slot=dialog-close-x]]:right-14 [&_[data-slot=dialog-close-x]]:top-2.5">
            <DialogHeader>
              <DialogTitle>Feed settings</DialogTitle>
              <DialogDescription>
                Control which nearby posts load and how your feed location appears.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <section className="rounded-lg border border-white/10 bg-black/42 p-3">
                <p className="mb-2 text-sm font-semibold text-white">Posted within</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {FEED_WINDOW_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={[
                        'h-10 rounded-full border text-sm font-semibold transition',
                        feedWindow === option.value
                          ? 'border-white/15 text-white'
                          : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                      ].join(' ')}
                      style={feedWindow === option.value ? { background: 'var(--cruush-gradient)' } : undefined}
                      aria-pressed={feedWindow === option.value}
                      onClick={() => void handleFeedWindowChange(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Expiry is chosen per post in the composer now, so it is not a
                  single setting applied to everything you write. */}
              <section className="rounded-lg border border-white/10 bg-black/42 p-3">
                <p className="text-sm font-semibold text-white">Who can see this post</p>
                <p className="mb-2 mt-1 text-xs text-white/58">Public and Mutuals are free. A specific Crowd is part of Feed+.</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'public', label: 'Public' },
                    { value: 'mutuals', label: 'Mutuals' },
                    { value: 'crowd', label: 'Specific Crowd +' },
                  ] as const).map((option) => {
                    const selected = postAudience === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={[
                          'min-h-10 rounded-full border px-2 text-sm font-semibold transition',
                          selected
                            ? 'border-primary/45 text-white'
                            : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                        ].join(' ')}
                        style={selected ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                        aria-pressed={selected}
                        onClick={() => {
                          if (option.value === 'crowd' && hasCruushPlus !== true) {
                            setPlusCardOpen(true);
                            return;
                          }

                          setPostAudience(option.value);
                          if (option.value !== 'crowd') {
                            setSelectedCrowdTargets([]);
                          }
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {postAudience === 'crowd' && availableCrowdTargets.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availableCrowdTargets.map((crowd) => {
                      const selected = selectedCrowdTargets.includes(crowd);
                      return (
                        <button
                          key={crowd}
                          type="button"
                          className={[
                            'h-10 rounded-full border px-4 text-sm font-semibold transition',
                            selected
                              ? 'border-primary/45 text-white'
                              : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                          ].join(' ')}
                          style={selected ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                          aria-pressed={selected}
                          onClick={() => toggleCrowdTarget(crowd)}
                        >
                          {crowd}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-white/10 bg-black/42 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Distance</p>
                  <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-xs text-white/70">
                    {feedDistanceMiles} mi
                  </span>
                </div>
                <input
                  aria-label="Feed distance radius"
                  className="cruush-range"
                  max={50}
                  min={1}
                  step={1}
                  type="range"
                  value={feedDistanceMiles}
                  onChange={(event) => handleFeedDistanceChange(Number(event.target.value))}
                />
              </section>

              <section className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/42 p-3">
                <div>
                  <p className="text-sm font-semibold text-white">Distances on posts</p>
                  <p className="mt-1 text-xs text-white/58">Show how far away each post is when you read your feed. Ghost Mode posts always read Nearby.</p>
                </div>
                <Switch
                  checked={feedSettings.showDistanceLabels !== false}
                  disabled={settingsSaving || !feedSettingsLoaded}
                  onCheckedChange={(checked) => void handleDistanceLabelVisibilityChange(checked)}
                />
              </section>

              <section className="space-y-2 rounded-lg border border-white/10 bg-black/42 p-3">
                <p className="text-sm font-semibold text-white">Feed map pin</p>
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
                      disabled={settingsSaving || !feedSettingsLoaded}
                      onClick={() => void handleFeedPinVisibilityChange(option.value)}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{option.label}</span>
                        {active ? <span className="text-xs uppercase tracking-[0.16em] text-primary">active</span> : null}
                      </span>
                      <span className="mt-1 block text-xs text-white/58">{option.description}</span>
                    </button>
                  );
                })}
              </section>
            </div>
          </DialogContent>
        </Dialog>}
        </> : null}
        <BugButtonSlot testId="local-feed-bug-button-slot" />
        {embedded && onClose ? (
          <Button type="button" variant="secondary" size="icon" className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10" aria-label="Close Feed" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
        </div>
      </header>

      {embedded && settingsOpen ? (
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4" data-testid="embedded-feed-settings">
          <div className="mx-auto w-full max-w-2xl space-y-4">
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <section className="rounded-lg border border-white/10 bg-black/42 p-3">
              <p className="mb-2 text-sm font-semibold text-white">Posted within</p>
              <div className="grid grid-cols-6 gap-1.5">
                {FEED_WINDOW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={[
                      'h-10 rounded-full border text-sm font-semibold transition',
                      feedWindow === option.value
                        ? 'border-white/15 text-white'
                        : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                    ].join(' ')}
                    style={feedWindow === option.value ? { background: 'var(--cruush-gradient)' } : undefined}
                    aria-pressed={feedWindow === option.value}
                    onClick={() => void handleFeedWindowChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-black/42 p-3">
              <p className="mb-2 text-sm font-semibold text-white">Who can see this post</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'public', label: 'Public' },
                  { value: 'mutuals', label: 'Mutuals' },
                  { value: 'crowd', label: 'Specific Crowd +' },
                ] as const).map((option) => {
                  const selected = postAudience === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={[
                        'min-h-10 rounded-full border px-2 text-sm font-semibold transition',
                        selected
                          ? 'border-primary/45 text-white'
                          : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                      ].join(' ')}
                      style={selected ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                      aria-pressed={selected}
                      onClick={() => {
                        if (option.value === 'crowd' && hasCruushPlus !== true) {
                          setPlusCardOpen(true);
                          return;
                        }
                        setPostAudience(option.value);
                        if (option.value !== 'crowd') setSelectedCrowdTargets([]);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {postAudience === 'crowd' && availableCrowdTargets.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableCrowdTargets.map((crowd) => {
                    const selected = selectedCrowdTargets.includes(crowd);
                    return (
                      <button
                        key={crowd}
                        type="button"
                        className={[
                          'h-10 rounded-full border px-4 text-sm font-semibold transition',
                          selected
                            ? 'border-primary/45 text-white'
                            : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                        ].join(' ')}
                        style={selected ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                        aria-pressed={selected}
                        onClick={() => toggleCrowdTarget(crowd)}
                      >
                        {crowd}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-white/10 bg-black/42 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Distance</p>
                <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-xs text-white/70">{feedDistanceMiles} mi</span>
              </div>
              <input
                aria-label="Feed distance radius"
                className="cruush-range"
                max={50}
                min={1}
                step={1}
                type="range"
                value={feedDistanceMiles}
                onChange={(event) => handleFeedDistanceChange(Number(event.target.value))}
              />
            </section>

            <section className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/42 p-3">
              <p className="text-sm font-semibold text-white">Distances on posts</p>
              <Switch
                checked={feedSettings.showDistanceLabels !== false}
                disabled={settingsSaving || !feedSettingsLoaded}
                onCheckedChange={(checked) => void handleDistanceLabelVisibilityChange(checked)}
              />
            </section>

            <section className="space-y-2 rounded-lg border border-white/10 bg-black/42 p-3">
              <p className="text-sm font-semibold text-white">Feed map pin</p>
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
                    disabled={settingsSaving || !feedSettingsLoaded}
                    onClick={() => void handleFeedPinVisibilityChange(option.value)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{option.label}</span>
                      {active ? <span className="text-xs uppercase tracking-[0.16em] text-primary">active</span> : null}
                    </span>
                  </button>
                );
              })}
            </section>
          </div>
        </div>
      ) : null}

      <div className={`${embedded && settingsOpen ? 'hidden ' : ''}mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden px-3 pt-4`} data-testid="local-feed-content">
        <div className="shrink-0 rounded-2xl border border-white/10 bg-black/82 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur" data-testid="local-feed-composer">
          {error ? (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {!composerOpen ? (
            <button
              type="button"
              className="bg-input-background flex w-full items-center gap-3 rounded-md border border-white/10 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/5"
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
          <div id={composerPanelId} className={composerOpen ? undefined : 'hidden'}>
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
              <AccordionTrigger aria-controls={composerPanelId} aria-label="Collapse Feed input" className="mb-3 justify-end py-0" />
            </AccordionItem>
          </Accordion>
          <Textarea
            ref={composerInputRef}
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder="Share something with nearby people..."
            className="bg-input-background mb-3 min-h-[100px]"
          />
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-input-background px-3">
              <Hash aria-hidden="true" className="h-4 w-4 shrink-0 text-white/55" />
              <input
                aria-label="Add Feed tag"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
                disabled={!hasCruushPlus || postTags.length >= MAX_FEED_POST_TAGS}
                maxLength={25}
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={hasCruushPlus ? '#tag' : 'Tags are part of cruush+'}
                value={newTag}
              />
              <button
                className="text-sm font-semibold text-white/72 disabled:opacity-35"
                disabled={!hasCruushPlus || !normalizeFeedTag(newTag) || postTags.length >= MAX_FEED_POST_TAGS}
                onClick={addPostTag}
                type="button"
              >
                Add
              </button>
            </div>
            {/* Expiry belongs to the post being written, not to a setting
                applied to everything. Every composer starts at Never. */}
            <section className="rounded-lg border border-white/10 bg-black/42 p-3">
              <p className="mb-2 text-sm font-semibold text-white">This post expires</p>
              {/* A slider rather than a row of buttons: the options are an
                  ordered scale from 30 minutes to never, so sliding along it
                  reads better than picking one of six pills. */}
              <Slider
                aria-label="This post expires"
                className="mt-1"
                data-testid="feed-expiry-slider"
                max={FEED_EXPIRY_OPTIONS.length - 1}
                min={0}
                step={1}
                value={[Math.max(0, FEED_EXPIRY_OPTIONS.findIndex((option) => option.value === expiresIn))]}
                onValueChange={([index]) => {
                  const option = FEED_EXPIRY_OPTIONS[index] ?? FEED_EXPIRY_OPTIONS[FEED_EXPIRY_OPTIONS.length - 1];
                  if (option.value !== 'never' && hasCruushPlus !== true) {
                    setPlusCardOpen(true);
                    return;
                  }
                  setExpiresIn(option.value);
                }}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-white/58">
                <span>{FEED_EXPIRY_OPTIONS[0].label}</span>
                <span className="font-semibold text-white" data-testid="feed-expiry-value">
                  {FEED_EXPIRY_OPTIONS.find((option) => option.value === expiresIn)?.label ?? 'Never'}
                </span>
                <span>{FEED_EXPIRY_OPTIONS[FEED_EXPIRY_OPTIONS.length - 1].label}</span>
              </div>
              <p className="mt-2 text-xs text-white/58">Never expire is free. Custom timers are part of Feed+.</p>
            </section>
            {hasCruushPlus ? (
              <p className="text-xs text-white/58">Up to {MAX_FEED_POST_TAGS} tags.</p>
            ) : null}
            {postTags.length > 0 ? (
              <div className="flex flex-wrap gap-2" data-testid="feed-post-tags-draft">
                {postTags.map((tag) => (
                  <button
                    aria-label={`Remove #${tag}`}
                    className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-black/55 px-2.5 py-1 text-xs text-white/72"
                    key={tag}
                    onClick={() => setPostTags((currentTags) => currentTags.filter((currentTag) => currentTag !== tag))}
                    type="button"
                  >
                    #{tag}
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {stagedPhotos.length > 0 ? (
            <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-black/45 p-3" data-testid="feed-photo-staging">
              <FeedAttachmentPreview
                dlModeActive={false}
                onOpen={() => undefined}
                photos={stagedPhotos}
              />
              <div className="flex flex-wrap gap-2">
                {stagedPhotos.map((photo, index) => (
                  <button
                    aria-label={`Remove Feed photo ${index + 1}`}
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
          {/* Expiry and crowd targeting live in the feed settings menu now, so
              the composer is the textarea and the Post button. */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <input
                accept={PHOTO_UPLOAD_ACCEPT}
                aria-label="Choose Feed photo"
                className="sr-only"
                onChange={handleFeedPhotoSelection}
                ref={feedPhotoInputRef}
                type="file"
              />
              <Button
                aria-label={hasCruushPlus === true ? 'Add Feed photo' : 'Feed photos require cruush+'}
                disabled={uploadingFeedPhoto || stagedPhotos.length >= 3}
                onClick={() => {
                  if (hasCruushPlus !== true) {
                    setPlusCardOpen(true);
                    return;
                  }
                  feedPhotoInputRef.current?.click();
                }}
                type="button"
                variant="outline"
              >
                {uploadingFeedPhoto ? <PhotoUploadSpinner className="mr-2 h-4 w-4" /> : <CruushIcon name="camera" className="mr-2 h-4 w-4" />}
                {`Photo${hasCruushPlus === true ? ` ${stagedPhotos.length}/3` : ' +'}`}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">{PHOTO_UPLOAD_FORMAT_MESSAGE}</p>
            </div>
            <Button
              onClick={handlePost}
              disabled={!newPost.trim() || posting || uploadingFeedPhoto}
              style={{
                background: newPost.trim()
                  ? 'var(--cruush-gradient)'
                  : undefined,
              }}
            >
              <CruushIcon name="send" className="mr-2 h-4 w-4" />
              {posting ? 'Posting...' : 'Post'}
            </Button>
          </div>
          </div>
        </div>

        <div
          className="scrollbar-hide mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(9rem+env(safe-area-inset-bottom))]"
          data-testid="local-feed-posts-scroll"
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
                  heart={(
                    <div className="-mt-1 w-20" data-testid={`feed-post-profile-stack-${post.id}`}>
                      <HeartPhoto
                        borderTone={borderTone}
                        className="w-full"
                        label={`${post.user.name} preview`}
                        masked={shouldMaskPhoto(dlModeActive, post.user.photoExplicit)}
                        photo={post.user?.photo}
                        staticMileHigh={post.user.id === currentUserId && post.user.travelling === true}
                        theme={currentUserId && post.user.id === currentUserId ? 'current' : mutualAuthor ? 'mutual' : 'nearby'}
                        userId={post.user.id}
                        onClick={() => navigate(`/profile/${post.user.id}`, { state: { distance: post.distance } })}
                        fallback={<CruushIcon name="cruush" className="h-5 w-5 opacity-20" />}
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
                  pronouns={post.user.pronouns || 'Ask me'}
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
                      {feedSettings.showDistanceLabels !== false ? <span className="truncate">{formatDistanceLabel(post.distance, distancePreferences.mode)}</span> : null}
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
                  content={(
                    <div className="space-y-1.5">
                      <p className="text-base">{post.content}</p>
                      {(post.tags?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-white/62">
                          {post.tags?.map((tag) => <span key={tag}>#{tag}</span>)}
                        </div>
                      ) : null}
                      <FeedAttachmentPreview
                        dlModeActive={dlModeActive}
                        onOpen={(index) => setPhotoViewer({ post, index })}
                        photos={post.photos ?? []}
                      />
                    </div>
                  )}
                  cornerAction={(
                    <>
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
                          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-white"
                        />
                      ) : null}
                      {currentUserId && post.user.id === currentUserId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-white"
                          aria-label={`Delete feed post: ${post.content.slice(0, 48)}`}
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
      description={null}
      hasCruushPlus={hasCruushPlus === true}
      onApply={() => {
        const nextFilters = {
          ...feedSeekingDraft,
          distance: Math.min(feedSeekingDraft.distance, DEFAULT_FEED_RADIUS_MILES),
        };
        setFeedSeekingDraft(nextFilters);
        setFeedSeekingFilters(nextFilters);
        setSeekingOpen(false);
        void fetchPosts({
          before: null,
          distanceMiles: nextFilters.distance,
          seekingFilters: nextFilters,
        });
      }}
      onChange={setFeedSeekingDraft}
      onClear={() => setFeedSeekingDraft(DEFAULT_FEED_SEEKING_FILTERS)}
      onOpenChange={setSeekingOpen}
      onUpgrade={() => setPlusCardOpen(true)}
      open={seekingOpen}
      searchPlaceholder="Search #tags"
      title="Feed Filter"
      value={feedSeekingDraft}
    />
    {pendingFeedPhotoUrl ? (
      <ProfilePhotoCropper
        onCancel={() => setPendingFeedPhotoUrl(null)}
        onConfirm={handleConfirmFeedPhotoCrop}
        processing={uploadingFeedPhoto}
        sourceUrl={pendingFeedPhotoUrl}
        subjectLabel="Feed photo"
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
      onUpgrade={() => navigate('/rewards')}
      title="Feed+"
      description="Add up to three photos, post to a specific Crowd, and choose when your post expires."
    />
    </>
  );
}
