import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  createGroupConversation,
  deleteConversationForEveryone,
  getConversations,
  type ConversationThread,
  type ConversationTimer,
} from '../lib/messagesApi';
import { getMyCruushActivity, type MutualCruushActivityItem } from '../lib/cruushApi';

const timerOptions: Array<{ value: ConversationTimer; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

function formatRelativeTime(isoTimestamp: string) {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMinutes = Math.max(0, Math.floor((now - then) / 60000));

  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return `${Math.floor(diffHours / 24)}d`;
}

function getConversationInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function normalizeConversation(raw: any): ConversationThread {
  return {
    id: String(raw?.id ?? ''),
    kind: raw?.kind === 'group' ? 'group' : 'dm',
    user: {
      id: String(raw?.user?.id ?? raw?.id ?? ''),
      name: raw?.user?.name ?? 'cruush user',
      pronouns: raw?.user?.pronouns ?? '',
      photo: raw?.user?.photo ?? null,
    },
    distance: raw?.distance ?? 'Nearby',
    updatedAt: raw?.updatedAt ?? raw?.timestamp ?? new Date().toISOString(),
    lastMessage: raw?.lastMessage ?? '',
    unreadCount: typeof raw?.unreadCount === 'number' ? raw.unreadCount : raw?.unread ? 1 : 0,
    pinned: typeof raw?.pinned === 'boolean' ? raw.pinned : false,
    muted: typeof raw?.muted === 'boolean' ? raw.muted : false,
    mutual: typeof raw?.mutual === 'boolean' ? raw.mutual : false,
    membersLabel: raw?.membersLabel ?? undefined,
    currentUserRole: ['owner', 'admin', 'member'].includes(raw?.currentUserRole) ? raw.currentUserRole : undefined,
    disappearingTimer: ['off', '1h', '24h', '7d', '30d'].includes(raw?.disappearingTimer) ? raw.disappearingTimer : undefined,
    closed: typeof raw?.closed === 'boolean' ? raw.closed : undefined,
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
  };
}

function canDeleteConversation(conversation: ConversationThread) {
  return conversation.kind !== 'group' || ['owner', 'admin'].includes(conversation.currentUserRole ?? '');
}

export default function DirectMessages() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'groups'>('all');
  const [error, setError] = useState<string | null>(null);
  const [groupComposerOpen, setGroupComposerOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupTimer, setGroupTimer] = useState<ConversationTimer>('24h');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [mutualOptions, setMutualOptions] = useState<MutualCruushActivityItem[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupCreating, setGroupCreating] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    void fetchConversations();
  }, []);

  const fetchConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConversations();
      const normalized = Array.isArray(data)
        ? data.map(normalizeConversation).filter((conversation) => Boolean(conversation.id))
        : [];

      setConversations(normalized);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setConversations([]);
      setError(error instanceof Error ? error.message : 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  };

  const query = deferredSearchQuery.trim().toLowerCase();
  const filteredConversations = conversations.filter((conversation) => {
    if (activeTab === 'unread' && conversation.unreadCount === 0) {
      return false;
    }

    if (activeTab === 'groups' && conversation.kind !== 'group') {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      conversation.user.name.toLowerCase().includes(query) ||
      conversation.lastMessage.toLowerCase().includes(query) ||
      conversation.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const pinnedConversations = conversations.filter((conversation) => conversation.pinned).slice(0, 4);
  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const activeNowCount = conversations.filter((conversation) => formatRelativeTime(conversation.updatedAt).includes('m')).length;

  const openGroupComposer = async () => {
    setGroupComposerOpen(true);
    setGroupError(null);
    setGroupLoading(true);

    try {
      const activity = await getMyCruushActivity();
      setMutualOptions((activity.mutual ?? []).filter((item) => item.canMessage !== false));
    } catch (error) {
      console.error('Error loading mutual cruushes:', error);
      setMutualOptions([]);
      setGroupError(error instanceof Error ? error.message : 'Failed to load mutual cruushes.');
    } finally {
      setGroupLoading(false);
    }
  };

  const toggleSelectedMember = (userId: string) => {
    setSelectedMemberIds((prev) => (
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    ));
  };

  const resetGroupComposer = () => {
    setGroupComposerOpen(false);
    setGroupName('');
    setGroupTimer('24h');
    setSelectedMemberIds([]);
    setGroupError(null);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMemberIds.length === 0 || groupCreating) {
      return;
    }

    setGroupCreating(true);
    setGroupError(null);

    try {
      const created = await createGroupConversation({
        title: groupName.trim(),
        memberIds: selectedMemberIds,
        disappearingTimer: groupTimer,
      });
      resetGroupComposer();
      navigate(`/chat/${created.id}`);
    } catch (error) {
      console.error('Error creating group conversation:', error);
      setGroupError(error instanceof Error ? error.message : 'Failed to create group.');
    } finally {
      setGroupCreating(false);
    }
  };

  const handleDeleteConversation = async (conversation: ConversationThread) => {
    if (deletingConversationId || !canDeleteConversation(conversation)) {
      return;
    }

    const targetLabel = conversation.kind === 'group' ? conversation.user.name : `chat with ${conversation.user.name}`;
    const confirmed = window.confirm(`Delete ${targetLabel} for everyone? This removes the chat and its messages for all participants.`);

    if (!confirmed) {
      return;
    }

    setDeletingConversationId(conversation.id);
    setError(null);

    try {
      await deleteConversationForEveryone(conversation.id);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
    } catch (error) {
      console.error('Error deleting conversation:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete chat.');
    } finally {
      setDeletingConversationId(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-background/88 px-4 pb-4 pt-4 backdrop-blur-md">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Nearby chat</p>
              <h2 className="text-3xl leading-none">Messages</h2>
            </div>
            <Button
              type="button"
              size="icon"
              aria-label="Create group chat"
              title="Create group chat"
              onClick={() => void openGroupComposer()}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border bg-card/80 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Unread</p>
              <p className="mt-1 text-xl">{unreadCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card/80 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Active now</p>
              <p className="mt-1 text-xl">{activeNowCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card/80 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Open threads</p>
              <p className="mt-1 text-xl">{conversations.length}</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search people, threads, vibes"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 rounded-2xl border-border/80 bg-card/80 pl-10"
            />
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'unread' | 'groups')}>
            <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-card/80">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {groupComposerOpen ? (
        <div className="fixed inset-0 z-40 bg-background/95 px-4 py-6 backdrop-blur-md">
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Group chat</p>
                <h3 className="text-2xl">New group</h3>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close group composer" onClick={resetGroupComposer}>
                <X className="size-4" />
              </Button>
            </div>

            {groupError ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {groupError}
              </div>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">Group name</span>
              <Input
                aria-label="Group name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Beta crew"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">Disappearing timer</span>
              <select
                aria-label="Disappearing timer"
                value={groupTimer}
                onChange={(event) => setGroupTimer(event.target.value as ConversationTimer)}
                className="h-11 w-full rounded-md border border-border bg-input-background px-3 text-sm"
              >
                {timerOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Mutual cruushes</p>
              {groupLoading ? (
                <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Loading mutuals...
                </div>
              ) : null}
              {!groupLoading && mutualOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  No mutual cruushes available.
                </div>
              ) : null}
              <div className="space-y-2">
                {mutualOptions.map((item) => (
                  <label
                    key={item.user.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(item.user.id)}
                      onChange={() => toggleSelectedMember(item.user.id)}
                    />
                    <HeartPhoto
                      className="w-10 shrink-0"
                      label={`${item.user.name} avatar`}
                      photo={item.user.photo}
                      fallback={<div className="text-xs text-white/80">{getConversationInitials(item.user.name)}</div>}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{item.user.name}</span>
                      <span className="block text-xs text-muted-foreground">{item.distance}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={!groupName.trim() || selectedMemberIds.length === 0 || groupCreating}
              onClick={() => void handleCreateGroup()}
            >
              Create group
            </Button>
          </div>
        </div>
      ) : null}

      <div className="relative mx-auto max-w-2xl px-4 pb-8 pt-4">
        {pinnedConversations.length > 0 ? (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Pin className="size-4 text-primary" />
              <p className="text-sm text-muted-foreground">Pinned tonight</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {pinnedConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => navigate(`/chat/${conversation.id}`)}
                  className="min-w-[150px] rounded-2xl border border-border bg-card/80 p-3 text-left transition-colors hover:bg-accent/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <HeartPhoto
                      className="w-12"
                      label={`${conversation.user.name} avatar`}
                      photo={conversation.user.photo}
                      fallback={<div className="text-sm text-white/80">{getConversationInitials(conversation.user.name)}</div>}
                    />
                    {conversation.unreadCount > 0 ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 truncate">{conversation.user.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{conversation.distance}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-3xl border border-border bg-card/70 p-4">
                <div className="flex gap-4">
                  <div className="size-16 rounded-full bg-accent/60" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-32 rounded bg-accent/60" />
                    <div className="h-3 w-20 rounded bg-accent/40" />
                    <div className="h-3 w-full rounded bg-accent/40" />
                    <div className="h-3 w-2/3 rounded bg-accent/40" />
                  </div>
                </div>
              </div>
            ))
          ) : null}

          {!loading && filteredConversations.map((conversation) => {
            const deleteLabel = conversation.kind === 'group'
              ? `Delete ${conversation.user.name} group chat for everyone`
              : `Delete ${conversation.user.name} chat for everyone`;

            return (
              <article
                key={conversation.id}
                className="rounded-3xl border border-border bg-card/80 transition-colors hover:bg-accent/60"
              >
                <div className="flex items-start gap-2 p-4">
                  <button
                    type="button"
                    onClick={() => navigate(`/chat/${conversation.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex gap-4">
                      <HeartPhoto
                        className="w-16 shrink-0"
                        label={`${conversation.user.name} avatar`}
                        photo={conversation.user.photo}
                        fallback={
                          conversation.kind === 'group'
                            ? <CruushIcon name="profile" className="size-6 opacity-80" />
                            : <div className="text-lg text-white/80">{getConversationInitials(conversation.user.name)}</div>
                        }
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`truncate ${conversation.unreadCount > 0 ? 'font-medium' : ''}`}>
                                {conversation.user.name}
                              </p>
                              {conversation.mutual ? (
                                <Badge variant="outline" className="border-primary/20 bg-primary/10 text-[10px] uppercase tracking-[0.18em] text-primary">
                                  Mutual
                                </Badge>
                              ) : null}
                              {conversation.kind === 'group' ? (
                                <Badge variant="outline" className="border-border/80 bg-background/60 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                  Group
                                </Badge>
                              ) : null}
                              {conversation.currentUserRole && conversation.currentUserRole !== 'member' ? (
                                <Badge variant="outline" className="border-primary/20 bg-primary/10 text-[10px] uppercase tracking-[0.18em] text-primary">
                                  {conversation.currentUserRole}
                                </Badge>
                              ) : null}
                              {conversation.muted ? (
                                <Badge variant="outline" className="border-border/80 bg-background/60 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                  Quiet
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
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{formatRelativeTime(conversation.updatedAt)}</span>
                            {conversation.unreadCount > 0 ? (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">
                                {conversation.unreadCount}
                              </span>
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        <p className={`mt-3 line-clamp-2 text-sm ${conversation.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {conversation.lastMessage}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {conversation.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="border-primary/20 bg-primary/10 text-[11px] text-primary">
                              {tag}
                            </Badge>
                          ))}
                          {conversation.disappearingTimer && conversation.disappearingTimer !== 'off' ? (
                            <Badge variant="outline" className="border-border/80 bg-background/60 text-[11px] text-muted-foreground">
                              {conversation.disappearingTimer}
                            </Badge>
                          ) : null}
                          {conversation.closed ? (
                            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-[11px] text-destructive">
                              Closed
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>

                  {canDeleteConversation(conversation) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={deleteLabel}
                      title={deleteLabel}
                      disabled={deletingConversationId === conversation.id}
                      onClick={() => void handleDeleteConversation(conversation)}
                      className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}

          {!loading && error ? (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center">
              <CruushIcon name="messages" className="mx-auto mb-4 size-14 opacity-55" />
              <p className="text-destructive">{error}</p>
              <Button className="mt-4" variant="outline" onClick={() => void fetchConversations()}>
                Try again
              </Button>
            </div>
          ) : null}

          {!loading && !error && filteredConversations.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/60 p-12 text-center">
              <CruushIcon name="messages" className="mx-auto mb-4 size-14 opacity-55" />
              {conversations.length === 0 ? (
                <>
                  <p className="text-muted-foreground">No messages yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">Mutual cruush conversations will appear here.</p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">No threads match that search.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Try a name, a vibe, or jump back into All.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
