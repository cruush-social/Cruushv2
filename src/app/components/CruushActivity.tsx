import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Heart, MessageCircle } from 'lucide-react';
import HeartPhoto from './HeartPhoto';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { getMyCruushActivity, sendCruush, type CruushActivityItem } from '../lib/cruushApi';

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

export default function CruushActivity() {
  const navigate = useNavigate();
  const [received, setReceived] = useState<CruushActivityItem[]>([]);
  const [sent, setSent] = useState<CruushActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCruushActivity();
  }, []);

  const fetchCruushActivity = async () => {
    setError(null);
    try {
      const data = await getMyCruushActivity();
      setReceived(data.received || []);
      setSent(data.sent || []);
    } catch (error) {
      console.error('Error fetching cruush activity:', error);
      setError(error instanceof Error ? error.message : 'Failed to load cruush activity.');
    } finally {
      setLoading(false);
    }
  };

  const handleCruushBack = async (item: CruushActivityItem) => {
    try {
      await sendCruush(item.user.id, {
        name: item.user.name,
        pronouns: item.user.pronouns,
        photo: item.user.photo,
      });

      await fetchCruushActivity();
    } catch (error) {
      console.error('Error sending cruush:', error);
      setError(error instanceof Error ? error.message : 'Failed to send cruush.');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 z-10">
        <h2 className="text-xl">cruush Activity</h2>
      </header>

      <div className="max-w-2xl mx-auto">
        {error ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Tabs defaultValue="received" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="received">Received</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="mt-0">
            <div className="divide-y divide-border">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading cruush activity...</div>
              ) : null}
              {received.map((item) => (
                <div key={item.id} className="p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <HeartPhoto
                      className="w-16 flex-shrink-0"
                      label={`${item.user.name} preview`}
                      photo={item.user?.photo}
                      fallback={<Heart className="w-6 h-6 text-white/20" />}
                    />

                    <div className="flex-1">
                      <p>
                        {item.user.name}{' '}
                        <span className="text-sm text-muted-foreground">{item.user.pronouns}</span>
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatRelativeTime(item.createdAt)}</span>
                        {item.mutual && (
                          <span className="text-primary flex items-center gap-1">
                            <Heart className="w-3 h-3 fill-current" />
                            Mutual
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {!item.mutual && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCruushBack(item)}
                          style={{
                            borderColor: 'var(--cruush-pink)',
                            color: 'var(--cruush-pink)',
                          }}
                        >
                          <Heart className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/messages')}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="sent" className="mt-0">
            <div className="divide-y divide-border">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading cruush activity...</div>
              ) : null}
              {sent.map((item) => (
                <div key={item.id} className="p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <HeartPhoto
                      className="w-16 flex-shrink-0"
                      label={`${item.user.name} preview`}
                      photo={item.user?.photo}
                      fallback={<Heart className="w-6 h-6 text-white/20" />}
                    />

                    <div className="flex-1">
                      <p>
                        {item.user.name}{' '}
                        <span className="text-sm text-muted-foreground">{item.user.pronouns}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/profile/${item.user.id}`)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {!loading && received.length === 0 && sent.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No cruush activity yet.</p>
            <p className="text-sm text-muted-foreground mt-2">Send a cruush to start the loop.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
