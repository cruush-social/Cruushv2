import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Clock, MapPin, Settings2, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
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
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: 'never', label: 'Never' },
];
const FEED_PAGE_SIZE = 30;
// The open beta covers fifty miles around NYC, so the feed reaches that far.
const DEFAULT_FEED_RADIUS_MILES = 50;
const LAUNCH_PARTY_EVENT_SLUG = 'the-chocolate-factory-launch';
const DEFAULT_FEED_SETTINGS: FeedSettings = {
  locationPinVisibility: 'mutuals',
  showDistanceLabels: true,
  postExpiryDefault: 'never',
  feedWindow: '7d',
};
// The vibe tags sit in a horizontal wrap under the post, not in a fixed-width
// rail beside it, so they size to their own text instead of truncating.
const feedVibeTagBaseClassName = 'min-w-0 max-w-full rounded-full border px-2 py-0.5 text-[11px] uppercase leading-tight tracking-[0.06em]';
const mutualFeedVibeTagClassName = `${feedVibeTagBaseClassName} border-[#6F00FF]/55 bg-[#6F00FF]/12 text-[#DCC7FF]`;
const ownFeedVibeTagClassName = `${feedVibeTagBaseClassName} border-[#3826FF]/62 bg-[#3826FF]/20 text-[#C3D0FF]`;
const nearbyFeedVibeTagClassName = `${feedVibeTagBaseClassName} border-[#FF0072]/55 bg-[#FF0072]/16 text-[#FFB3D2]`;

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

export default function LocalFeed({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [newPost, setNewPost] = useState('');
  // The composer stays a single row until it is opened. Expanded it takes a
  // third of a phone screen, which pushed the first post below the fold.
  const [composerOpen, setComposerOpen] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [expiresIn, setExpiresIn] = useState<FeedPostExpiry>('never');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mutualUserIds, setMutualUserIds] = useState<Set<string>>(() => new Set());
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
  const [error, setError] = useState<string | null>(null);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const feedSettingsRef = useRef<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const feedSettingsSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestFeedExpiryChoiceRef = useRef(0);
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
    if (!newPost.trim()) return;

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
      className={embedded
        ? 'flex h-full w-full max-w-full flex-col overflow-x-clip overflow-y-hidden bg-[#050505] text-foreground'
        : 'fixed inset-0 flex h-[100dvh] w-full max-w-full flex-col overflow-x-clip overflow-y-hidden bg-[#050505] pt-[env(safe-area-inset-top)] text-foreground'}
      data-testid="local-feed-screen"
    >
      <header
        className="sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/88 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-[0_20px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl"
        data-testid="local-feed-header"
      >
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
          aria-label="Back"
          title="Back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-2xl text-white sm:text-3xl">Feed</h2>
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
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
                <p className="mb-2 text-sm font-semibold text-white">Your posts expire</p>
                <div className="grid grid-cols-5 gap-2">
                  {FEED_EXPIRY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={[
                        'h-10 rounded-full border text-sm font-semibold transition',
                        expiresIn === option.value
                          ? 'border-white/15 text-white'
                          : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                      ].join(' ')}
                      style={expiresIn === option.value ? { background: 'var(--cruush-gradient)' } : undefined}
                      aria-pressed={expiresIn === option.value}
                      disabled={!feedSettingsLoaded}
                      onClick={() => void handleFeedExpiryChange(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              {availableCrowdTargets.length > 0 ? (
                <section className="rounded-lg border border-white/10 bg-black/42 p-3">
                  <p className="text-sm font-semibold text-white">Post to crowds</p>
                  <p className="mt-1 mb-2 text-xs text-white/58">Leave all off to post to everyone nearby.</p>
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
                              ? 'border-[#03ecfc]/55 bg-[#03ecfc]/14 text-[#c9fbff] hover:bg-[#03ecfc]/20'
                              : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/8',
                          ].join(' ')}
                          aria-pressed={selected}
                          onClick={() => toggleCrowdTarget(crowd)}
                        >
                          {crowd}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

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
          {!composerOpen ? (
            <button
              type="button"
              className="bg-input-background flex w-full items-center gap-3 rounded-md border border-white/10 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/5"
              data-testid="local-feed-composer-open"
              onClick={() => {
                setComposerOpen(true);
                requestAnimationFrame(() => composerInputRef.current?.focus());
              }}
            >
              <CruushIcon name="send" className="h-4 w-4 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate">Share something with nearby people...</span>
            </button>
          ) : null}
          <div className={composerOpen ? undefined : 'hidden'}>
          <Textarea
            ref={composerInputRef}
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder="Share something with nearby people..."
            className="bg-input-background mb-3 min-h-[100px]"
          />
          {/* Expiry and crowd targeting live in the feed settings menu now, so
              the composer is the textarea and the Post button. */}
          <div className="flex items-center justify-end gap-3">
            <Button
              onClick={handlePost}
              disabled={!newPost.trim() || posting}
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
                      className="-mt-2 flex w-14 flex-shrink-0 flex-col items-center"
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
                          {/* Distance, age and expiry ride the name line rather
                              than claiming a second row of their own. */}
                          <div className="flex shrink-0 flex-wrap items-center gap-x-2 text-xs text-white/52" data-testid={`feed-post-meta-${post.id}`}>
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
                          </div>
                        </div>
                        <div className="flex items-center justify-end">
                          <div className="flex items-center gap-2">
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
                                className="h-8 w-8 text-muted-foreground hover:text-white"
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
                                  className="h-8 w-8 text-muted-foreground hover:text-white"
                                />
                                <BlockUserAction
                                  userId={post.user.id}
                                  displayName={post.user.name}
                                  className="h-8 w-8 text-muted-foreground hover:text-white"
                                  onBlocked={handleBlockedUser}
                                />
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <p className="text-sm">{post.content}</p>

                      {post.user.vibes?.length ? (
                        <div
                          className="flex flex-wrap items-center gap-1"
                          data-testid={`feed-post-vibes-${post.id}`}
                        >
                          {post.user.vibes.slice(0, 3).map((vibe) => (
                            <span
                              key={vibe}
                              className={currentUserId && post.user.id === currentUserId ? ownFeedVibeTagClassName : mutualAuthor ? mutualFeedVibeTagClassName : nearbyFeedVibeTagClassName}
                              title={vibe}
                            >
                              {vibe}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
