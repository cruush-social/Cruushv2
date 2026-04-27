import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Heart, MessageCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
// Use Vite environment variables for Supabase config
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

export default function CruushActivity() {
  const navigate = useNavigate();
  const [received, setReceived] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCruushActivity();
  }, []);

  const fetchCruushActivity = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cruush/${userData.id}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch cruush activity: ${response.statusText}`);
      }

      const data = await response.json();
      setReceived(data.received || []);
      setSent(data.sent || []);
    } catch (error) {
      console.error('Error fetching cruush activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCruushBack = async (userId: string) => {
    try {
      const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cruush`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fromUserId: userData.id,
            toUserId: userId,
          }),
        }
      );

      fetchCruushActivity();
    } catch (error) {
      console.error('Error sending cruush:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 z-10">
        <h2 className="text-xl">cruush Activity</h2>
      </header>

      <div className="max-w-2xl mx-auto">
        <Tabs defaultValue="received" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="received">Received</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="mt-0">
            <div className="divide-y divide-border">
              {received.map((item) => (
                <div key={item.id} className="p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-crimson-dark to-crimson-bright" style={{ aspectRatio: '9/16' }}>
                      {item.user?.photo ? (
                        <img src={item.user.photo} alt={item.user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Heart className="w-6 h-6 text-white/20" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <p>
                        {item.user.name}{' '}
                        <span className="text-sm text-muted-foreground">{item.user.pronouns}</span>
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{item.time} ago</span>
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
                          onClick={() => handleCruushBack(item.toUserId)}
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
              {sent.map((item) => (
                <div key={item.id} className="p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-crimson-dark to-crimson-bright" style={{ aspectRatio: '9/16' }}>
                      {item.user?.photo ? (
                        <img src={item.user.photo} alt={item.user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Heart className="w-6 h-6 text-white/20" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <p>
                        {item.user.name}{' '}
                        <span className="text-sm text-muted-foreground">{item.user.pronouns}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{item.time} ago</p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/profile/${item.id}`)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
