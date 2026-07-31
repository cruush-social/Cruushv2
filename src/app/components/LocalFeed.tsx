import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Clock, MapPin, Settings2, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import HeartPhoto from './HeartPhoto';
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
import {
  createFeedPost,
  deleteFeedPost,
  getFeedPosts,
  getFeedSettings,
  updateFeedSettings,
  type FeedLocationPinVisibility,
  type FeedPost,
  type FeedPostExpiry,
  type FeedSettings,
} from '../lib/postApi';
import { getMyProfile } from '../lib/profileApi';
import { CROWDS, normalizeCrowdValues } from '../lib/profileOptions';
import { getCurrentUserId } from '../lib/sessionUser';

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

const FEED_LOCATION_PIN_OPTIONS: Array<{ value: FeedLocationPinVisibility; label: string; description: string }> = [
  { value: 'mutuals', label: 'mutuals', description: 'Only mutual cruushes see your feed pin.' },
  { value: 'same_crowd', label: 'same crowd', description: 'People sharing one of your crowds see your feed pin.' },
  { value: 'public', label: 'public', description: 'Anyone who can read your post can tap through to your map pin.' },
  { value: 'off', label: 'off', description: 'Do not show a feed pin on your posts.' },
];

const DEFAULT_FEED_SETTINGS: FeedSettings = {
  locationPinVisibility: 'mutuals',
};

export default function LocalFeed() {
  const navigate = useNavigate();
  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [expiresIn, setExpiresIn] = useState<FeedPostExpiry>('6h');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [availableCrowdTargets, setAvailableCrowdTargets] = useState<string[]>([]);
  const [selectedCrowdTargets, setSelectedCrowdTargets] = useState<string[]>([]);
  const [feedSettings, setFeedSettings] = useState<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBillingStatus = () => {
      void getMyBillingStatus()
        .then(setBillingStatus)
        .catch(() => setBillingStatus(null));
    };

    void fetchPosts();
    void getFeedSettings()
      .then(setFeedSettings)
      .catch(() => setFeedSettings(DEFAULT_FEED_SETTINGS));
    void getCurrentUserId()
      .then(setCurrentUserId)
      .catch(() => setCurrentUserId(null));
    loadBillingStatus();
    void getMyProfile()
      .then((profile) => {
        const normalizedCrowds = normalizeCrowdValues(profile.crowds ?? []);
        const allowedCrowds = CROWDS.filter((crowd) => (
          normalizedCrowds.includes(crowd) && (crowd !== 'T4T' || profile.is_trans === true)
        ));
        setAvailableCrowdTargets(allowedCrowds);
        setSelectedCrowdTargets((currentTargets) => currentTargets.filter((crowd) => allowedCrowds.includes(crowd)));
      })
      .catch(() => {
        setAvailableCrowdTargets([]);
        setSelectedCrowdTargets([]);
      });

    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);

    return () => {
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);
    };
  }, []);

  const fetchPosts = async () => {
    setError(null);
    try {
      setPosts(await getFeedPosts());
    } catch (error) {
      console.error('Error fetching posts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load the local feed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!newPost.trim()) return;
    if (billingStatus && !billingStatus.cruushPlus) {
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

  const canPost = billingStatus?.cruushPlus !== false;

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
      const nextSettings = await updateFeedSettings({ locationPinVisibility });
      setFeedSettings(nextSettings);
      void fetchPosts();
    } catch (error) {
      console.error('Error saving feed settings:', error);
      setError(error instanceof Error ? error.message : 'Failed to save feed settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleBlockedUser = (blockedUserId: string) => {
    setPosts((currentPosts) => currentPosts.filter((post) => post.user.id !== blockedUserId));
  };

  return (
    <div className="min-h-screen bg-[#050505] pb-20 text-foreground">
      <header className="sticky top-0 bg-black/88 backdrop-blur-sm border-b border-white/10 p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-xl">Local Feed</h2>
          <p className="text-xs text-white/58">Nearby posts expire after 24h</p>
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
              <Settings2 className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-lg border-white/10 bg-background">
            <DialogHeader>
              <DialogTitle>Feed settings</DialogTitle>
              <DialogDescription>
                Choose who can tap your feed posts to center your map pin.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
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
                    disabled={settingsSaving}
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
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="max-w-2xl mx-auto px-3 pt-4">
        <div className="rounded-2xl border border-white/10 bg-black/82 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur">
          {error ? (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <Textarea
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder={canPost ? 'Share something with nearby people...' : 'Upgrade to post on the local feed.'}
            className="bg-input-background mb-3 min-h-[100px]"
            disabled={!canPost}
          />
          {!canPost ? (
            <div
              className="mb-3 flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-white/78 sm:flex-row sm:items-center sm:justify-between"
              data-testid="local-feed-cruush-plus-notice"
            >
              <div>
                <p className="text-white">Post on the local feed with <CruushPlusWord />.</p>
                <p className="mt-1 text-xs text-white/58">Free users can still read nearby posts.</p>
              </div>
              <Button
                type="button"
                className="h-10 shrink-0 rounded-lg text-white"
                style={{ background: 'var(--cruush-gradient)' }}
                onClick={() => navigate('/rewards')}
              >
                Get <CruushPlusWord />
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={expiresIn === '1h' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExpiresIn('1h')}
                disabled={!canPost}
              >
                1h
              </Button>
              <Button
                variant={expiresIn === '6h' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExpiresIn('6h')}
                disabled={!canPost}
              >
                6h
              </Button>
              <Button
                variant={expiresIn === '24h' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExpiresIn('24h')}
                disabled={!canPost}
              >
                24h
              </Button>
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
                        className={selected ? 'border-emerald-400/55 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/25' : undefined}
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

        {loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/72 p-12 text-center">
            <p className="text-white/58">Loading nearby posts...</p>
          </div>
        ) : null}

        {!loading ? (
          <div className="mt-4 space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-white/10 bg-black/72 p-4 transition-colors hover:bg-black/86">
              <div className="flex gap-3">
                <HeartPhoto
                  className="w-[4.5rem] flex-shrink-0"
                  label={`${post.user.name} preview`}
                  photo={post.user?.photo}
                  userId={post.user.id}
                  fallback={<CruushIcon name="cruush" className="h-5 w-5 opacity-20" />}
                />

                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="flex flex-wrap items-center gap-2">
                        <span>{post.user.name}</span>
                        <CruushBadge badges={post.user.badges} compact />
                        <span className="text-sm text-white/58">{post.user.pronouns}</span>
                        {post.partyStatus ? (
                          <button
                            type="button"
                            className="rounded-full border border-emerald-400/28 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300 transition hover:bg-emerald-400/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/65"
                            aria-label="Center map on The Chocolate Factory"
                            onClick={() => navigate('/map', {
                              state: {
                                centerEventSlug: post.partyStatus?.eventSlug,
                              },
                            })}
                          >
                            {post.partyStatus.label}
                          </button>
                        ) : null}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-white/52">
                        <span className="flex items-center gap-1">
                          <CruushIcon name="map" className="h-3 w-3 opacity-70" />
                          {post.distance}
                        </span>
                        <span>{formatRelativeTime(post.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-white/52">
                        <Clock className="w-3 h-3" />
                        <span>{post.expiresIn}</span>
                      </div>
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

                  <p className="text-sm">{post.content}</p>
                </div>
                {post.locationPin ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 self-center rounded-full border-white/18 bg-black/60 text-white/88 hover:bg-white/10"
                    aria-label={`Center map on ${post.user.name}`}
                    title={`Center map on ${post.user.name}`}
                    onClick={() => navigate('/map', {
                      state: {
                        focusUserId: post.locationPin?.userId,
                      },
                    })}
                  >
                    <MapPin className="h-5 w-5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          </div>
        ) : null}

        {!loading && posts.length === 0 && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/72 p-12 text-center">
            <p className="text-white/68">No posts nearby yet.</p>
            <p className="text-sm text-white/50 mt-2">Be the first to share something!</p>
          </div>
        )}
      </div>
    </div>
  );
}
