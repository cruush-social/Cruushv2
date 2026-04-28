import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Send, MapPin, Clock, Heart } from 'lucide-react';
import { Button } from './ui/button';
import HeartPhoto from './HeartPhoto';
import { Textarea } from './ui/textarea';
import { createFeedPost, getFeedPosts, type FeedPost, type FeedPostExpiry } from '../lib/postApi';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPosts();
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-xl">Local Feed</h2>
          <p className="text-xs text-muted-foreground">Nearby posts expire after 24h</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto">
        <div className="p-4 bg-card border-b border-border">
          {error ? (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <Textarea
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder="Share something with nearby people..."
            className="bg-input-background mb-3 min-h-[100px]"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant={expiresIn === '1h' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExpiresIn('1h')}
              >
                1h
              </Button>
              <Button
                variant={expiresIn === '6h' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExpiresIn('6h')}
              >
                6h
              </Button>
              <Button
                variant={expiresIn === '24h' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExpiresIn('24h')}
              >
                24h
              </Button>
            </div>
            <Button
              onClick={handlePost}
              disabled={!newPost.trim() || posting}
              style={{
                background: newPost.trim()
                  ? 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)'
                  : undefined,
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              {posting ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">Loading nearby posts...</p>
          </div>
        ) : null}

        {!loading ? (
          <div className="divide-y divide-border">
          {posts.map((post) => (
            <div key={post.id} className="p-4 hover:bg-accent/50 transition-colors">
              <div className="flex gap-3">
                <HeartPhoto
                  className="w-14 flex-shrink-0"
                  label={`${post.user.name} preview`}
                  photo={post.user?.photo}
                  fallback={<Heart className="w-5 h-5 text-white/20" />}
                />

                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p>
                        {post.user.name}{' '}
                        <span className="text-sm text-muted-foreground">{post.user.pronouns}</span>
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {post.distance}
                        </span>
                        <span>{formatRelativeTime(post.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{post.expiresIn}</span>
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
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No posts nearby yet.</p>
            <p className="text-sm text-muted-foreground mt-2">Be the first to share something!</p>
          </div>
        )}
      </div>
    </div>
  );
}
