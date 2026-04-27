import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Send, MoreVertical, Heart } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

export default function PrivateGroupChat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (chatId) {
      fetchMessages();
    }
  }, [chatId]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/messages/${chatId}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    try {
      const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId: chatId,
            userId: userData.id,
            content: message,
          }),
        }
      );

      if (response.ok) {
        setMessage('');
        fetchMessages();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="bg-card border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg">Chat</h2>
            <p className="text-xs text-muted-foreground">{messages.length} messages</p>
          </div>
        </div>
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-5 h-5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');
            const isOwn = msg.userId === userData.id;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                {!isOwn && (
                  <div className="w-8 h-14 flex-shrink-0 rounded overflow-hidden bg-gradient-to-br from-crimson-dark to-crimson-bright" style={{ aspectRatio: '9/16' }}>
                    <div className="w-full h-full flex items-center justify-center">
                      <Heart className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                )}
                <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div
                    className={`px-4 py-2 rounded-2xl ${
                      isOwn
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="fixed bottom-20 left-0 right-0 bg-card border-t border-border p-4">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="bg-input-background"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim()}
            style={{
              background: message.trim()
                ? 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)'
                : undefined,
            }}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
