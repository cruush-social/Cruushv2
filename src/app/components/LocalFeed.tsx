import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Clock, MapPin, Settings2, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import HeartPhoto from './HeartPhoto';
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
import { CRUUSH_PLUS_CHANGED_EVENT, getMyBillingStatus, type BillingStatus } from '../lib/billingApi';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import {
  createFeedPost,
  deleteFeedPost,
  getFeedPosts,
  getFeedSettings,
  updateFeedSettings,
  type FeedLocationPinVisibility,
  type FeedPost,
  type FeedPostExpiry,
  type FeedPostWindow,
  type FeedSettings,
} from '../lib/postApi';
import { getMyProfile, type ProfileRecord } from '../lib/profileApi';
import { getMyCruushActivity } from '../lib/cruushApi';
import { CROWDS, normalizeCrowdValues } from '../lib/profileOptions';
import { getCurrentUserId } from '../lib/sessionUser';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
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
  { value: 'mutuals', label: 'mutuals', description: 'Only mutual cruushes see your feed pin.' },
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
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: 'never', label: 'Never' },
];
const FEED_PAGE_SIZE = 30;
const DEFAULT_FEED_RADIUS_MILES = 15;
const LAUNCH_PARTY_EVENT_SLUG = 'the-chocolate-factory-launch';
const DEFAULT_FEED_SETTINGS: FeedSettings = {
  locationPinVisibility: 'mutuals',
  showDistanceLabels: true,
  postExpiryDefault: 'never',
  feedWindow: '7d',
};
const CRUUSH_PLUS_FEED_NOTICE_KEY = 'cruush:feed-cruush-plus-notice-dismissed';
const feedVibeTagBaseClassName = 'w-full min-w-0 max-w-full shrink truncate rounded-full border px-1 py-0.5 text-center text-[11px] uppercase leading-tight tracking-[0.06em]';
const mutualFeedVibeTagClassName = `${feedVibeTagBaseClassName} border-[#6F00FF]/55 bg-[#6F00FF]/12 text-[#DCC7FF]`;
const nearbyFeedVibeTagClassName = `${feedVibeTagBaseClassName} border-[#FF0072]/55 bg-[#FF0072]/12 text-[#FF8BBB]`;

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

export default function LocalFeed() {
  const navigate = useNavigate();
  const location = useLocation();
  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [expiresIn, setExpiresIn] = useState<FeedPostExpiry>('never');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mutualUserIds, setMutualUserIds] = useState<Set<string>>(() => new Set());
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [availableCrowdTargets, setAvailableCrowdTargets] = useState<string[]>([]);
  const [selectedCrowdTargets, setSelectedCrowdTargets] = useState<string[]>([]);
  const [feedSettings, setFeedSettings] = useState<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const [feedWindow, setFeedWindow] = useState<FeedPostWindow>('7d');
  const [feedDistanceMiles, setFeedDistanceMiles] = useState(DEFAULT_FEED_RADIUS_MILES);
  const [feedCoordinates, setFeedCoordinates] = useState<FeedCoordinates | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [feedSettingsLoaded, setFeedSettingsLoaded] = useState(false);
  const [showCruushPlusNotice, setShowCruushPlusNotice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const feedSettingsRef = useRef<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const feedSettingsSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestFeedExpiryChoiceRef = useRef(0);
  const canPost = billingStatus?.cruushPlus === true;

  useEffect(() => {
    if (currentUserId && hasPersistentNoticeFlag(`${CRUUSH_PLUS_FEED_NOTICE_KEY}:${currentUserId}`)) {
      setShowCruushPlusNotice(false);
    }
  }, [currentUserId]);

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
    if (new URLSearchParams(location.search).get('compose') !== '1' || !canPost) {
      return;
    }

    composerInputRef.current?.scrollIntoView?.({ block: 'center' });
    composerInputRef.current?.focus();
  }, [canPost, location.search]);

  const fetchPosts = useCallback(async (options: {
    append?: boolean;
    before?: string | null;
    coordinates?: FeedCoordinates | null;
    distanceMiles?: number;
    within?: FeedPostWindow;
  } = {}) => {
    const append = options.append === true;
    const nextCoordinates = options.coordinates === undefined ? feedCoordinates : options.coordinates;
    const nextDistanceMiles = options.distanceMiles ?? feedDistanceMiles;
    const nextWindow = options.within ?? feedWindow;

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
  }, [feedCoordinates, feedDistanceMiles, feedWindow]);

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  useEffect(() => {
    const loadBillingStatus = () => {
      void getMyBillingStatus()
        .then(setBillingStatus)
        .catch(() => setBillingStatus(null));
    };

    void getFeedSettings()
      .then((settings) => {
        const nextSettings = { ...DEFAULT_FEED_SETTINGS, ...settings };
        applyFeedSettings(nextSettings);
        setExpiresIn(nextSettings.postExpiryDefault);
        setFeedWindow(nextSettings.feedWindow);
        setFeedSettingsLoaded(true);
      })
      .catch(() => {
        applyFeedSettings(DEFAULT_FEED_SETTINGS);
        setExpiresIn(DEFAULT_FEED_SETTINGS.postExpiryDefault);
        setFeedWindow(DEFAULT_FEED_SETTINGS.feedWindow);
        setFeedSettingsLoaded(false);
      });
    void getCurrentUserId()
      .then(setCurrentUserId)
      .catch(() => setCurrentUserId(null));
    void getMyCruushActivity()
      .then((activity) => setMutualUserIds(new Set((activity.mutual ?? []).map((item) => item.user.id))))
      .catch(() => setMutualUserIds(new Set()));
    loadBillingStatus();
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

    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);

    return () => {
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);
    };
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
    if (!newPost.trim()) return;
    if (!billingStatus) return;
    if (!billingStatus.cruushPlus) {
      navigate('/rewards');
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const createdPost = await createFeedPost({
        content: newPost.trim(),
        expiresIn,
        crowdTargets: selectedCrowdTargets,
      });
      setNewPost('');
      setSelectedCrowdTargets([]);
      setPosts((prev) => [createdPost, ...prev]);
    } catch (error) {
      console.error('Error posting:', error);
      setError(error instanceof Error ? error.message : 'Failed to create post.');
    } finally {
      setPosting(false);
    }
  };

  const toggleCrowdTarget = (crowd: string) => {
    if (!canPost) {
      return;
    }

    setSelectedCrowdTargets((currentTargets) => currentTargets.includes(crowd)
      ? currentTargets.filter((target) => target !== crowd)
      : [...currentTargets, crowd]);
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

  const handleFeedExpiryChange = async (postExpiryDefault: FeedPostExpiry) => {
    const choiceSequence = latestFeedExpiryChoiceRef.current + 1;
    latestFeedExpiryChoiceRef.current = choiceSequence;
    setExpiresIn(postExpiryDefault);
    setError(null);

    try {
      const nextSettings = await enqueueFeedSettingsUpdate({
        postExpiryDefault,
      });
      if (choiceSequence === latestFeedExpiryChoiceRef.current) {
        setExpiresIn(nextSettings.postExpiryDefault);
      }
    } catch (error) {
      if (choiceSequence === latestFeedExpiryChoiceRef.current) {
        setExpiresIn(feedSettingsRef.current.postExpiryDefault);
        console.error('Error saving feed expiry:', error);
        setError(error instanceof Error ? error.message : 'Failed to save feed expiry.');
      }
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

  const handleBlockedUser = (blockedUserId: string) => {
    setPosts((currentPosts) => currentPosts.filter((post) => post.user.id !== blockedUserId));
  };

  return (
    <div
      className="fixed inset-0 flex h-[100dvh] w-full max-w-full flex-col overflow-x-clip overflow-y-hidden bg-[#050505] pt-[env(safe-area-inset-top)] text-foreground"
      data-testid="local-feed-screen"
    >
      <header
        className="sticky top-0 z-40 flex shrink-0 items-center gap-4 border-b border-white/10 bg-black/92 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-[0_18px_48px_rgba(0,0,0,0.36)] backdrop-blur-xl"
        data-testid="local-feed-header"
      >
        <div>
          <h2 className="text-xl">Local Feed</h2>
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto rounded-full text-white/88 hover:bg-white/10"
              aria-label="Feed settings"
              title="Feed settings"
            >
              <CruushIcon name="settings" className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-lg border-white/10 bg-background pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <DialogHeader>
              <DialogTitle>Feed settings</DialogTitle>
              <DialogDescription>
                Control which nearby posts load and how your feed location appears.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <section className="rounded-lg border border-white/10 bg-black/42 p-3">
                <p className="mb-2 text-sm font-semibold text-white">Posted within</p>
                <div className="grid grid-cols-5 gap-2">
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
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Distance</p>
                  <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-xs text-white/70">
                    {feedDistanceMiles} mi
                  </span>
                </div>
                <input
                  aria-label="Feed distance radius"
                  className="w-full accent-primary"
                  max={15}
                  min={1}
                  step={1}
                  type="range"
                  value={feedDistanceMiles}
                  onChange={(event) => handleFeedDistanceChange(Number(event.target.value))}
                />
              </section>

              <section className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/42 p-3">
                <div>
                  <p className="text-sm font-semibold text-white">Distance labels</p>
                  <p className="mt-1 text-xs text-white/58">Show broad ranges like 1-3 mi.</p>
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
                          ? 'border-primary/70 bg-primary/12 text-white'
                          : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                      ].join(' ')}
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
        </Dialog>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden px-3 pt-4" data-testid="local-feed-content">
        <div className="shrink-0 rounded-2xl border border-white/10 bg-black/82 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur" data-testid="local-feed-composer">
          {error ? (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <Textarea
            ref={composerInputRef}
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder={billingStatus === null
              ? 'Checking cruush+ access...'
              : canPost
                ? 'Share something with nearby people...'
                : 'Unlock feed posting with cruush+.'}
            className="bg-input-background mb-3 min-h-[100px]"
            disabled={!canPost}
          />
          {billingStatus !== null && !canPost && showCruushPlusNotice ? (
            <div
              className="mb-3 flex flex-col gap-3 rounded-2xl border border-primary/35 bg-[linear-gradient(135deg,rgba(255,0,128,0.18),rgba(49,46,129,0.24))] p-4 text-sm text-white/78 shadow-[0_12px_36px_rgba(0,0,0,0.24)] sm:flex-row sm:items-center sm:justify-between"
              data-testid="local-feed-cruush-plus-notice"
            >
              <div className="min-w-0">
                <p className="font-medium text-white">Make the feed yours with <CruushPlusWord />.</p>
                <p className="mt-1 text-xs text-white/68">Post updates, plans, and moments for nearby people. Unlock feed posting with <CruushPlusWord />.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  className="h-10 rounded-full px-5 font-semibold text-white shadow-[0_8px_24px_rgba(255,0,128,0.25)]"
                  style={{ background: 'var(--cruush-gradient)' }}
                  onClick={() => navigate('/rewards')}
                >
                  Unlock <CruushPlusWord />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Dismiss cruush+ notice"
                  onClick={() => {
                    setShowCruushPlusNotice(false);
                    if (currentUserId) {
                      setPersistentNoticeFlag(`${CRUUSH_PLUS_FEED_NOTICE_KEY}:${currentUserId}`);
                    }
                  }}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {FEED_EXPIRY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={expiresIn === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => void handleFeedExpiryChange(option.value)}
                  disabled={!feedSettingsLoaded}
                >
                  {option.label}
                </Button>
              ))}
              {availableCrowdTargets.length > 0 ? (
                <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-2">
                  {availableCrowdTargets.map((crowd) => {
                    const selected = selectedCrowdTargets.includes(crowd);
                    return (
                      <Button
                        key={crowd}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        size="sm"
                        className={selected ? 'border-[#03ecfc]/55 bg-[#03ecfc]/14 text-[#c9fbff] hover:bg-[#03ecfc]/20' : undefined}
                        onClick={() => toggleCrowdTarget(crowd)}
                        disabled={!canPost}
                      >
                        {crowd}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <Button
              onClick={handlePost}
              disabled={!canPost || !newPost.trim() || posting}
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

        <div
          className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(9rem+env(safe-area-inset-bottom))] pr-1"
          data-testid="local-feed-posts-scroll"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-black/72 p-12 text-center">
              <p className="text-white/58">Loading nearby posts...</p>
            </div>
          ) : null}

          {!loading ? (
            <div className="space-y-3">
              {posts.map((post) => {
                const mutualAuthor = mutualUserIds.has(post.user.id);
                return (
                <div key={post.id} className="rounded-2xl border border-white/10 bg-black/72 p-4 transition-colors hover:bg-black/86">
                  <div className="flex items-start gap-3">
                    <div
                      className="-mt-2 flex w-20 flex-shrink-0 flex-col items-center gap-1"
                      data-testid={`feed-post-profile-stack-${post.id}`}
                    >
                      <HeartPhoto
                        className="w-full"
                        label={`${post.user.name} preview`}
                        masked={shouldMaskPhoto(dlModeActive, post.user.photoExplicit)}
                        photo={post.user?.photo}
                        theme={currentUserId && post.user.id === currentUserId ? 'current' : mutualAuthor ? 'mutual' : 'nearby'}
                        userId={post.user.id}
                        onClick={() => navigate(`/profile/${post.user.id}`)}
                        fallback={<CruushIcon name="cruush" className="h-5 w-5 opacity-20" />}
                      />
                      {post.user.vibes?.length ? (
                        <div
                          className="flex w-full flex-col items-center gap-1"
                          data-testid={`feed-post-vibes-${post.id}`}
                        >
                          {post.user.vibes.slice(0, 3).map((vibe) => (
                            <span
                              key={vibe}
                              className={mutualAuthor ? mutualFeedVibeTagClassName : nearbyFeedVibeTagClassName}
                              title={vibe}
                            >
                              {vibe}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
                            <span className="min-w-0 flex-1 truncate" data-testid={`feed-post-author-${post.id}`} title={post.user.name}>
                              {post.user.name}
                            </span>
                          </span>
                          <CruushBadge badges={post.user.badges} compact />
                          {post.user.attendingLaunchParty ? (
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center border-0 bg-transparent p-0 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#03ecfc]/65"
                              aria-label="Center map on launch party"
                              title="Center map on launch party"
                              onClick={() => navigate('/map', {
                                state: {
                                  centerEventSlug: LAUNCH_PARTY_EVENT_SLUG,
                                },
                              })}
                            >
                              <img alt="" aria-hidden="true" className="h-5 w-5 drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]" src={partyHatIcon} />
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/52" data-testid={`feed-post-meta-${post.id}`}>
                          {feedSettings.showDistanceLabels !== false ? (
                            <span className="flex items-center gap-1">
                              <CruushIcon name="map" className="h-3 w-3 opacity-70" />
                              {post.distance}
                            </span>
                          ) : null}
                          <span>{formatRelativeTime(post.createdAt)}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatFeedExpiry(post.expiresIn)}
                          </span>
                          <div className="ml-auto flex items-center gap-2">
                            {post.locationPin ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0 rounded-full border-white/18 bg-black/60 text-white/88 hover:bg-white/10"
                                aria-label={`Center map on ${post.user.name}`}
                                title={`Center map on ${post.user.name}`}
                                onClick={() => navigate('/map', {
                                  state: {
                                    focusUserId: post.locationPin?.userId,
                                  },
                                })}
                              >
                                <MapPin className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {currentUserId && post.user.id === currentUserId ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                aria-label={`Delete feed post: ${post.content.slice(0, 48)}`}
                                title="Delete post"
                                disabled={deletingPostId === post.id}
                                onClick={() => void handleDeletePost(post.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {currentUserId && post.user.id !== currentUserId ? (
                              <>
                                <ReportAction
                                  targetType="post"
                                  targetId={post.id}
                                  targetLabel={`post by ${post.user.name}`}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                />
                                <BlockUserAction
                                  userId={post.user.id}
                                  displayName={post.user.name}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onBlocked={handleBlockedUser}
                                />
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <p className="text-sm">{post.content}</p>
                    </div>
                  </div>
                </div>
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
              <p className="text-white/68">No posts nearby yet.</p>
              <p className="text-sm text-white/50 mt-2">Be the first to share something!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
