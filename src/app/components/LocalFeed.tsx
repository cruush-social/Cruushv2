import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Send, MapPin, Clock, Heart } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

export default function LocalFeed() {
  const navigate = useNavigate();
  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [expiresIn, setExpiresIn] = useState('6h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/posts`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.statusText}`);
      }

      const data = await response.json();
      setPosts(data.posts || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!newPost.trim()) return;

    try {
      const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/posts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userData.id,
            content: newPost,
            expiresIn,
          }),
        }
      );

      if (response.ok) {
        setNewPost('');
        fetchPosts();
      }
    } catch (error) {
      console.error('Error posting:', error);
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
              disabled={!newPost.trim()}
              style={{
                background: newPost.trim()
                  ? 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)'
                  : undefined,
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              Post
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {posts.map((post) => (
            <div key={post.id} className="p-4 hover:bg-accent/50 transition-colors">
              <div className="flex gap-3">
                <div className="w-12 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-crimson-dark to-crimson-bright" style={{ aspectRatio: '9/16' }}>
                  {post.user?.photo ? (
                    <img src={post.user.photo} alt={post.user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Heart className="w-5 h-5 text-white/20" />
                    </div>
                  )}
                </div>

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
                        <span>{post.timestamp}</span>
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

        {posts.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No posts nearby yet.</p>
            <p className="text-sm text-muted-foreground mt-2">Be the first to share something!</p>
          </div>
        )}
      </div>
    </div>
  );
}
