import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Search, MessageCircle, Heart } from 'lucide-react';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

export default function DirectMessages() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-546a0ad0/conversations`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.statusText}`);
      }

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 z-10">
        <h2 className="text-xl mb-4">Messages</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            className="pl-10 bg-input-background"
          />
        </div>
      </header>

      <div className="divide-y divide-border">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => navigate(`/chat/${conv.id}`)}
            className="w-full p-4 hover:bg-accent transition-colors text-left"
          >
            <div className="flex gap-3">
              <div className="w-14 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-crimson-dark to-crimson-bright" style={{ aspectRatio: '9/16' }}>
                {conv.user.photo ? (
                  <img src={conv.user.photo} alt={conv.user.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Heart className="w-6 h-6 text-white/20" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className={conv.unread ? 'font-medium' : ''}>
                    {conv.user.name}{' '}
                    <span className="text-sm text-muted-foreground">{conv.user.pronouns}</span>
                  </p>
                  <span className="text-xs text-muted-foreground">{conv.time}</span>
                </div>
                <p className={`text-sm truncate ${conv.unread ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {conv.lastMessage}
                </p>
              </div>

              {conv.unread && (
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
              )}
            </div>
          </button>
        ))}

        {conversations.length === 0 && (
          <div className="p-12 text-center">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Start cruushing to connect with people nearby
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
