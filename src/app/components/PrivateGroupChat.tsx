import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, CornerDownLeft, Image as ImageIcon, MoreHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { Textarea } from './ui/textarea';
import { fallbackConversations, fallbackMessagesByConversationId, type ChatMessageRecord, type ConversationThread } from '../lib/messageFixtures';
import { getCurrentUserId } from '../lib/sessionUser';
import { createMessage, getConversationMessages } from '../lib/messagesApi';

function formatMessageTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getConversationInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function normalizeRemoteMessages(remoteMessages: any[], activeUserId: string | null) {
  return remoteMessages.map((message) => ({
    id: String(message.id),
    author: message.userId === activeUserId ? 'self' : 'other',
    content: String(message.content ?? ''),
    timestamp: String(message.timestamp ?? new Date().toISOString()),
  })) as ChatMessageRecord[];
}

export default function PrivateGroupChat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [liveConversation, setLiveConversation] = useState<ConversationThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [usingSampleData, setUsingSampleData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackConversation: ConversationThread =
    fallbackConversations.find((item) => item.id === chatId) ?? fallbackConversations[0];
  const conversation: ConversationThread = liveConversation ?? fallbackConversation;
  const quickPrompts = conversation.kind === 'group'
    ? ['still in', 'hosting pregame', 'share cross streets later', 'what time are we landing?']
    : ['you around now?', 'hosting or traveling?', 'what vibe are you after?', 'send cross streets later'];

  useEffect(() => {
    const loadChatState = async () => {
      try {
        const resolvedUserId = await getCurrentUserId();
        setCurrentUserId(resolvedUserId);
        setError(null);

        if (!chatId) {
          setMessages(fallbackMessagesByConversationId[fallbackConversation.id] ?? []);
          setUsingSampleData(true);
          return;
        }

        const data = await getConversationMessages(chatId);
        const normalized = Array.isArray(data.messages)
          ? normalizeRemoteMessages(data.messages, resolvedUserId)
          : [];

        if (data.conversation) {
          setLiveConversation(data.conversation);
        }

        if (normalized.length > 0 || data.conversation) {
          setMessages(normalized);
          setUsingSampleData(false);
        } else {
          setMessages(fallbackMessagesByConversationId[chatId] ?? fallbackMessagesByConversationId[fallbackConversation.id] ?? []);
          setUsingSampleData(true);
        }
      } catch (error) {
        console.error('Error loading chat:', error);
        setLiveConversation(null);
        setMessages(fallbackMessagesByConversationId[chatId ?? fallbackConversation.id] ?? fallbackMessagesByConversationId[fallbackConversation.id] ?? []);
        setUsingSampleData(true);
        setError(error instanceof Error ? error.message : 'Failed to load live chat.');
      } finally {
        setLoading(false);
      }
    };

    void loadChatState();
  }, [chatId, fallbackConversation.id]);

  const handleSend = async () => {
    if (!message.trim()) return;

    const trimmedMessage = message.trim();
    const optimisticMessage: ChatMessageRecord = {
      id: `local-${Date.now()}`,
      author: 'self',
      content: trimmedMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setMessage('');

    try {
      await (currentUserId ?? getCurrentUserId());

      if (!chatId || usingSampleData) {
        setUsingSampleData(true);
        setError(null);
        return;
      }

      await createMessage(chatId, trimmedMessage);
      setError(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message.');
    }
  };

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-background/88 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back to messages">
              <ArrowLeft className="w-5 h-5" />
            </Button>

            <HeartPhoto
              className="w-12 shrink-0"
              label={`${conversation.user.name} preview`}
              photo={conversation.user.photo}
              fallback={
                conversation.kind === 'group'
                  ? <CruushIcon name="profile" className="size-5 opacity-80" />
                  : <div className="text-sm text-white/80">{getConversationInitials(conversation.user.name)}</div>
              }
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg">{conversation.user.name}</h2>
                {conversation.kind === 'group' ? (
                  <Badge variant="outline" className="border-border/80 bg-card/60 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Group
                  </Badge>
                ) : null}
                {conversation.mutual ? (
                  <Badge variant="outline" className="border-primary/20 bg-primary/10 text-[10px] uppercase tracking-[0.18em] text-primary">
                    Mutual cruush
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {conversation.user.pronouns ? <span>{conversation.user.pronouns}</span> : null}
                {conversation.membersLabel ? <span>{conversation.membersLabel}</span> : null}
                <span className="inline-flex items-center gap-1">
                  <CruushIcon name="map" className="size-3 opacity-70" />
                  {conversation.distance}
                </span>
                {usingSampleData ? <span>Preview thread</span> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" title="Media states" aria-label="Open media options">
              <ImageIcon className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" title="Safety tools" aria-label="Open safety options">
              <CruushIcon name="safety" className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="More conversation options">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4">
        {error ? (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {conversation.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="border-primary/20 bg-primary/10 text-primary">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="rounded-3xl border border-border bg-card/70 p-3 text-sm text-muted-foreground">
          Keep specifics here until you both want to move.
        </div>

        <div className="mt-4 flex-1 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={`flex ${index % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                  <div className="max-w-[72%] animate-pulse rounded-3xl bg-card px-4 py-5 text-transparent">loading</div>
                </div>
              ))}
            </div>
          ) : null}

          {!loading && messages.length === 0 ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center">
                <CruushIcon name="cruush" className="mx-auto mb-4 size-12 opacity-55" />
                <p className="text-muted-foreground">No messages yet.</p>
                <p className="mt-2 text-sm text-muted-foreground">Break the ice when the vibe is right.</p>
              </div>
            </div>
          ) : null}

          {!loading && messages.map((msg) => {
            const isOwn = msg.author === 'self';
            const isSystem = msg.author === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="max-w-[80%] rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-center text-xs text-primary">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex items-end gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                {!isOwn ? (
                  <HeartPhoto
                    className="w-9 shrink-0"
                    label={`${conversation.user.name} preview`}
                    photo={conversation.user.photo}
                    fallback={<div className="text-[10px] text-white/75">{getConversationInitials(conversation.user.name)}</div>}
                  />
                ) : null}

                <div className={`max-w-[78%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div
                    className={`rounded-[22px] px-4 py-3 text-sm leading-relaxed ${
                      isOwn
                        ? 'text-white'
                        : 'border border-border bg-card text-foreground'
                    }`}
                    style={isOwn ? { background: 'var(--cruush-gradient)' } : undefined}
                  >
                    {msg.content}
                  </div>
                  <span className="px-1 text-[11px] text-muted-foreground">{formatMessageTime(msg.timestamp)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="fixed bottom-20 left-0 right-0 border-t border-border bg-background/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setMessage(prompt)}
                  className="rounded-full border border-border bg-card/80 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="rounded-[28px] border border-border bg-card/85 p-3 shadow-lg shadow-black/20">
              <div className="flex items-end gap-3">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={conversation.kind === 'group' ? 'Drop the plan...' : 'Say what you want...'}
                  className="min-h-[60px] border-0 bg-transparent px-0 py-1 focus-visible:ring-0"
                />
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" title="Quick reply" aria-label="Insert quick reply">
                    <CornerDownLeft className="size-4" />
                  </Button>
                  <Button
                    onClick={() => void handleSend()}
                    disabled={!message.trim()}
                    className="rounded-full"
                    aria-label="Send message"
                    style={{
                      background: message.trim()
                        ? 'var(--cruush-gradient)'
                        : undefined,
                    }}
                  >
                    <CruushIcon name="send" className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
