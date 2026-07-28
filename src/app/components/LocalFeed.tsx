import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Clock, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import HeartPhoto from './HeartPhoto';
import { Textarea } from './ui/textarea';
import { getMyBillingStatus, type BillingStatus } from '../lib/billingApi';
import { createFeedPost, deleteFeedPost, getFeedPosts, type FeedPost, type FeedPostExpiry } from '../lib/postApi';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPosts();
    void getCurrentUserId()
      .then(setCurrentUserId)
      .catch(() => setCurrentUserId(null));
    void getMyBillingStatus()
      .then(setBillingStatus)
      .catch(() => setBillingStatus(null));
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
      });
      setNewPost('');
      setPosts((prev) => [createdPost, ...prev]);
    } catch (error) {
      console.error('Error posting:', error);
      setError(error instanceof Error ? error.message : 'Failed to create post.');
    } finally {
      setPosting(false);
    }
  };

  const canPost = billingStatus?.cruushPlus !== false;

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
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
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
                  className="w-14 flex-shrink-0"
                  label={`${post.user.name} preview`}
                  photo={post.user?.photo}
                  fallback={<CruushIcon name="cruush" className="h-5 w-5 opacity-20" />}
                />

                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="flex flex-wrap items-center gap-2">
                        <span>{post.user.name}</span>
                        <CruushBadge badges={post.user.badges} compact />
                        <span className="text-sm text-white/58">{post.user.pronouns}</span>
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
