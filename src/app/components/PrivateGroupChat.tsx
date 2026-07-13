import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Clock3, Eye, Image as ImageIcon, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { Textarea } from './ui/textarea';
import { getCurrentUserId } from '../lib/sessionUser';
import {
  addGroupMember,
  clearConversationForEveryone,
  closeGroupConversation,
  createMessage,
  createMessagePhoto,
  demoteGroupAdmin,
  getConversationMessages,
  getGroupMembers,
  promoteGroupAdmin,
  removeGroupMember,
  setConversationDisappearingTimer,
  type ChatMessageRecord,
  type ConversationTimer,
  type ConversationThread,
  type GroupMemberRecord,
  type MessageAttachment,
  type RemoteChatMessage,
  updateGroupConversation,
  viewMessageAttachment,
} from '../lib/messagesApi';
import { getMyCruushActivity, type MutualCruushActivityItem } from '../lib/cruushApi';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';

const timerOptions: Array<{ value: ConversationTimer; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

function formatMessageTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatExpirationTime(isoTimestamp: string) {
  const expiresAt = new Date(isoTimestamp);

  return `expires ${expiresAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function getConversationInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function normalizeRemoteMessage(message: RemoteChatMessage, activeUserId: string | null): ChatMessageRecord {
  return {
    id: String(message.id),
    author: message.userId === activeUserId ? 'self' : 'other',
    content: String(message.content ?? ''),
    timestamp: String(message.timestamp ?? new Date().toISOString()),
    expiresAt: message.expiresAt ? String(message.expiresAt) : undefined,
    attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
  };
}

function normalizeRemoteMessages(remoteMessages: RemoteChatMessage[], activeUserId: string | null) {
  return remoteMessages.map((message) => normalizeRemoteMessage(message, activeUserId));
}

export default function PrivateGroupChat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [conversation, setConversation] = useState<ConversationThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoViewOnce, setPhotoViewOnce] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMemberRecord[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupTitleDraft, setGroupTitleDraft] = useState('');
  const [mutualOptions, setMutualOptions] = useState<MutualCruushActivityItem[]>([]);
  const [addMemberId, setAddMemberId] = useState('');
  const [viewedAttachmentUrls, setViewedAttachmentUrls] = useState<Record<string, string>>({});
  const [viewingAttachmentIds, setViewingAttachmentIds] = useState<Record<string, boolean>>({});
  const [mutualRequiredConversationId, setMutualRequiredConversationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadChatState = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedUserId = await getCurrentUserId();

        if (!active) {
          return;
        }

        setCurrentUserId(resolvedUserId);

        if (!chatId) {
          setConversation(null);
          setMessages([]);
          setError('Conversation not found.');
          return;
        }

        const data = await getConversationMessages(chatId);

        if (!active) {
          return;
        }

        setConversation(data.conversation);
        setMessages(Array.isArray(data.messages) ? normalizeRemoteMessages(data.messages, resolvedUserId) : []);
        setMutualRequiredConversationId(data.conversation.kind === 'dm' && data.conversation.canMessage === false ? data.conversation.id : null);
        setError(null);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error('Error loading chat:', error);
        setConversation(null);
        setMessages([]);
        setError(error instanceof Error ? error.message : 'Failed to load live chat.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadChatState();

    return () => {
      active = false;
    };
  }, [chatId]);

  useEffect(() => {
    if (conversation?.kind === 'group') {
      setGroupTitleDraft(conversation.user.name);
    }
  }, [conversation?.kind, conversation?.user.name]);

  const canManageConversation = conversation?.kind !== 'group' || ['owner', 'admin'].includes(conversation.currentUserRole ?? '');
  const dmMessagingBlocked = conversation?.kind === 'dm' && (
    conversation.canMessage === false ||
    mutualRequiredConversationId === conversation.id
  );
  const composerDisabled = Boolean(conversation?.closed) || dmMessagingBlocked;

  const loadGroupSettingsData = async (conversationId: string) => {
    setGroupMembersLoading(true);

    try {
      const [members, activity] = await Promise.all([
        getGroupMembers(conversationId),
        getMyCruushActivity().catch(() => ({ mutual: [] })),
      ]);
      setGroupMembers(members);
      setMutualOptions((activity.mutual ?? []).filter((item) => item.canMessage !== false));
      setAddMemberId('');
    } catch (error) {
      console.error('Error loading group settings:', error);
      setError(error instanceof Error ? error.message : 'Failed to load group settings.');
    } finally {
      setGroupMembersLoading(false);
    }
  };

  const openSettings = () => {
    setSettingsOpen((current) => !current);

    if (!settingsOpen && conversation?.kind === 'group') {
      void loadGroupSettingsData(conversation.id);
    }
  };

  const handleTimerChange = async (value: ConversationTimer) => {
    if (!conversation || !canManageConversation) {
      return;
    }

    setSettingsSaving(true);

    try {
      const updated = await setConversationDisappearingTimer(conversation.id, value);
      setConversation(updated);
      setError(null);
    } catch (error) {
      console.error('Error updating timer:', error);
      setError(error instanceof Error ? error.message : 'Failed to update timer.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleClearForEveryone = async () => {
    if (!conversation || !canManageConversation) {
      return;
    }

    setSettingsSaving(true);

    try {
      const updated = await clearConversationForEveryone(conversation.id);
      setConversation(updated);
      setMessages([]);
      setViewedAttachmentUrls({});
      setError(null);
    } catch (error) {
      console.error('Error clearing chat:', error);
      setError(error instanceof Error ? error.message : 'Failed to clear chat.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleRenameGroup = async () => {
    if (!conversation || conversation.kind !== 'group' || !groupTitleDraft.trim() || !canManageConversation) {
      return;
    }

    setSettingsSaving(true);

    try {
      const updated = await updateGroupConversation(conversation.id, { title: groupTitleDraft.trim() });
      setConversation(updated);
      setError(null);
    } catch (error) {
      console.error('Error renaming group:', error);
      setError(error instanceof Error ? error.message : 'Failed to rename group.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleAddGroupMember = async () => {
    if (!conversation || conversation.kind !== 'group' || !addMemberId || !canManageConversation) {
      return;
    }

    setSettingsSaving(true);

    try {
      await addGroupMember(conversation.id, addMemberId);
      await loadGroupSettingsData(conversation.id);
      setError(null);
    } catch (error) {
      console.error('Error adding group member:', error);
      setError(error instanceof Error ? error.message : 'Failed to add member.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleGroupMemberAction = async (member: GroupMemberRecord, action: 'promote' | 'demote' | 'remove') => {
    if (!conversation || conversation.kind !== 'group' || !canManageConversation) {
      return;
    }

    setSettingsSaving(true);

    try {
      if (action === 'promote') {
        await promoteGroupAdmin(conversation.id, member.id);
      } else if (action === 'demote') {
        await demoteGroupAdmin(conversation.id, member.id);
      } else {
        await removeGroupMember(conversation.id, member.id);
      }

      await loadGroupSettingsData(conversation.id);
      setError(null);
    } catch (error) {
      console.error('Error updating group member:', error);
      setError(error instanceof Error ? error.message : 'Failed to update member.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCloseGroup = async () => {
    if (!conversation || conversation.kind !== 'group' || !canManageConversation) {
      return;
    }

    setSettingsSaving(true);

    try {
      await closeGroupConversation(conversation.id);
      setConversation({ ...conversation, closed: true });
      setError(null);
    } catch (error) {
      console.error('Error closing group:', error);
      setError(error instanceof Error ? error.message : 'Failed to close group.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleViewOnceAttachment = async (messageId: string, attachment: MessageAttachment) => {
    const attachmentKey = `${messageId}:${attachment.id}`;

    if (viewingAttachmentIds[attachmentKey]) {
      return;
    }

    setViewingAttachmentIds((prev) => ({ ...prev, [attachmentKey]: true }));

    try {
      const objectUrl = await viewMessageAttachment(messageId, attachment.id);
      setViewedAttachmentUrls((prev) => ({ ...prev, [attachmentKey]: objectUrl }));
      setMessages((prev) => prev.map((item) => (
        item.id !== messageId
          ? item
          : {
              ...item,
              attachments: item.attachments?.map((existing) => (
                existing.id === attachment.id
                  ? { ...existing, viewedAt: existing.viewedAt ?? new Date().toISOString() }
                  : existing
              )),
            }
      )));
      setError(null);
    } catch (error) {
      console.error('Error opening view-once photo:', error);
      setError(error instanceof Error ? error.message : 'Failed to open photo.');
    } finally {
      setViewingAttachmentIds((prev) => ({ ...prev, [attachmentKey]: false }));
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !chatId || !conversation || composerDisabled) return;

    const trimmedMessage = message.trim();
    const optimisticId = `local-${Date.now()}`;
    const optimisticMessage: ChatMessageRecord = {
      id: optimisticId,
      author: 'self',
      content: trimmedMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setMessage('');

    try {
      const createdMessage = await createMessage(chatId, trimmedMessage);
      setMessages((prev) => prev.map((item) => (
        item.id === optimisticId
          ? normalizeRemoteMessage(createdMessage, currentUserId ?? createdMessage.userId)
          : item
      )));
      setError(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      if (error instanceof ApiClientError && error.code === 'MUTUAL_CRUUSH_REQUIRED') {
        setMutualRequiredConversationId(chatId);
        setError('You need a mutual cruush before messaging. Open their profile to send a cruush first.');
      } else {
        setError(error instanceof Error ? error.message : 'Failed to send message.');
      }
    }
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file || !chatId || !conversation || photoUploading || composerDisabled) {
      return;
    }

    const caption = message.trim();
    setPhotoUploading(true);

    try {
      const createdMessage = await createMessagePhoto(chatId, file, caption, { viewOnce: photoViewOnce });
      setMessages((prev) => [...prev, normalizeRemoteMessage(createdMessage, currentUserId ?? createdMessage.userId)]);
      setMessage('');
      setPhotoViewOnce(false);
      setError(null);
    } catch (error) {
      console.error('Error sending message photo:', error);
      if (error instanceof ApiClientError && error.code === 'MUTUAL_CRUUSH_REQUIRED') {
        setMutualRequiredConversationId(chatId);
        setError('You need a mutual cruush before messaging. Open their profile to send a cruush first.');
      } else {
        setError(error instanceof Error ? error.message : 'Failed to send photo.');
      }
    } finally {
      setPhotoUploading(false);
    }
  };

  const openDmProfile = () => {
    if (!conversation || conversation.kind !== 'dm') {
      return;
    }

    navigate(`/profile/${conversation.user.id}`, {
      state: {
        distance: conversation.distance,
      },
    });
  };
  const groupMemberIds = new Set(groupMembers.map((member) => member.id));
  const availableAddOptions = mutualOptions.filter((item) => !groupMemberIds.has(item.user.id));

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-background/88 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back to messages">
              <ArrowLeft className="w-5 h-5" />
            </Button>

            {conversation ? (
              <HeartPhoto
                className="w-12 shrink-0"
                label={`${conversation.user.name} avatar`}
                photo={conversation.user.photo}
                fallback={
                  conversation.kind === 'group'
                    ? <CruushIcon name="profile" className="size-5 opacity-80" />
                    : <div className="text-sm text-white/80">{getConversationInitials(conversation.user.name)}</div>
                }
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-full bg-card" />
            )}

            <div className="min-w-0">
              {conversation ? (
                <>
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
                  </div>
                </>
              ) : (
                <>
                  <h2 className="truncate text-lg">{loading ? 'Loading chat...' : 'Conversation unavailable'}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Messages</p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" title="Photo states" aria-label="Open photo options" disabled={!conversation}>
              <ImageIcon className="w-5 h-5" />
            </Button>
            {conversation?.kind === 'dm' ? (
              <Button
                variant="ghost"
                size="icon"
                title="Open profile"
                aria-label={`Open ${conversation.user.name} profile`}
                onClick={openDmProfile}
              >
                <CruushIcon name="profile" className="h-5 w-5" />
              </Button>
            ) : null}
            {conversation ? (
              <ReportAction
                targetType="conversation"
                targetId={conversation.id}
                targetLabel={conversation.kind === 'dm' ? `conversation with ${conversation.user.name}` : conversation.user.name}
                label="Report conversation"
              />
            ) : null}
            <Button variant="ghost" size="icon" aria-label="More conversation options" disabled={!conversation} onClick={openSettings}>
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4">
        {error ? (
          <div className="mb-4 space-y-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p>{error}</p>
            {dmMessagingBlocked ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={openDmProfile}
              >
                Open profile
              </Button>
            ) : null}
          </div>
        ) : null}

        {settingsOpen && conversation ? (
          <section className="mb-4 space-y-4 rounded-3xl border border-border bg-card/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Settings</p>
                <h3 className="text-lg">Conversation</h3>
              </div>
              {conversation.disappearingTimer && conversation.disappearingTimer !== 'off' ? (
                <Badge variant="outline" className="border-border/80 bg-background/60 text-[11px] text-muted-foreground">
                  {conversation.disappearingTimer}
                </Badge>
              ) : null}
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">Disappearing timer</span>
              <select
                aria-label="Disappearing timer"
                value={conversation.disappearingTimer ?? 'off'}
                disabled={!canManageConversation || settingsSaving}
                onChange={(event) => void handleTimerChange(event.target.value as ConversationTimer)}
                className="h-11 w-full rounded-md border border-border bg-input-background px-3 text-sm disabled:opacity-60"
              >
                {timerOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-center border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={!canManageConversation || settingsSaving}
              onClick={() => void handleClearForEveryone()}
            >
              <Trash2 className="size-4" />
              Clear chat for everyone
            </Button>

            {conversation.kind === 'dm' ? (
              <BlockUserAction
                userId={conversation.user.id}
                displayName={conversation.user.name}
                iconOnly={false}
                size="default"
                variant="outline"
                className="w-full justify-center border-destructive/30 text-destructive hover:bg-destructive/10"
                onBlocked={() => navigate('/messages')}
              />
            ) : null}

            {conversation.kind === 'group' ? (
              <div className="space-y-4 border-t border-border pt-4">
                {canManageConversation ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input
                        aria-label="Group title"
                        value={groupTitleDraft}
                        onChange={(event) => setGroupTitleDraft(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!groupTitleDraft.trim() || settingsSaving}
                        onClick={() => void handleRenameGroup()}
                      >
                        Rename
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <select
                        aria-label="Add mutual cruush"
                        value={addMemberId}
                        onChange={(event) => setAddMemberId(event.target.value)}
                        className="h-11 w-full rounded-md border border-border bg-input-background px-3 text-sm"
                      >
                        <option value="">Add a mutual cruush</option>
                        {availableAddOptions.map((item) => (
                          <option key={item.user.id} value={item.user.id}>
                            {item.user.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!addMemberId || settingsSaving}
                        onClick={() => void handleAddGroupMember()}
                      >
                        Add
                      </Button>
                    </div>
                  </>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Members</p>
                  {groupMembersLoading ? (
                    <div className="rounded-2xl border border-border bg-background/60 p-3 text-sm text-muted-foreground">
                      Loading members...
                    </div>
                  ) : null}
                  {groupMembers.map((member) => (
                    <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3">
                      <div className="min-w-0">
                        <p className="truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                      {canManageConversation && member.role !== 'owner' ? (
                        <div className="flex flex-wrap gap-2">
                          {member.role === 'admin' ? (
                            <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleGroupMemberAction(member, 'demote')}>
                              Demote
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleGroupMemberAction(member, 'promote')}>
                              Promote
                            </Button>
                          )}
                          <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleGroupMemberAction(member, 'remove')}>
                            Remove
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {canManageConversation && !conversation.closed ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center border-destructive/30 text-destructive hover:bg-destructive/10"
                    disabled={settingsSaving}
                    onClick={() => void handleCloseGroup()}
                  >
                    Close group
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {conversation ? (
          <>
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
          </>
        ) : null}

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

          {!loading && conversation && messages.length === 0 ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center">
                <CruushIcon name="cruush" className="mx-auto mb-4 size-12 opacity-55" />
                <p className="text-muted-foreground">No messages yet.</p>
                <p className="mt-2 text-sm text-muted-foreground">Break the ice when the vibe is right.</p>
              </div>
            </div>
          ) : null}

          {!loading && !conversation && !error ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center">
                <CruushIcon name="messages" className="mx-auto mb-4 size-12 opacity-55" />
                <p className="text-muted-foreground">Conversation unavailable.</p>
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
                {!isOwn && conversation ? (
                  <HeartPhoto
                    className="w-9 shrink-0"
                    label={`${conversation.user.name} avatar`}
                    photo={conversation.user.photo}
                    fallback={<div className="text-[10px] text-white/75">{getConversationInitials(conversation.user.name)}</div>}
                  />
                ) : null}

                <div className={`max-w-[78%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  {msg.attachments?.map((attachment) => {
                    const attachmentKey = `${msg.id}:${attachment.id}`;
                    const openedViewOnceUrl = viewedAttachmentUrls[attachmentKey];
                    if (attachment.viewOnce) {
                      if (openedViewOnceUrl) {
                        return (
                          <div
                            key={attachment.id}
                            className={`overflow-hidden rounded-[22px] border ${
                              isOwn ? 'border-primary/30 bg-primary/10' : 'border-border bg-card'
                            }`}
                          >
                            <img
                              alt="View-once photo"
                              src={openedViewOnceUrl}
                              className="block max-h-80 w-full max-w-xs object-cover"
                            />
                          </div>
                        );
                      }

                      if (attachment.viewedAt) {
                        return (
                          <div
                            key={attachment.id}
                            className="rounded-[22px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
                          >
                            View-once photo viewed
                          </div>
                        );
                      }

                      return (
                        <Button
                          key={attachment.id}
                          type="button"
                          variant="outline"
                          className="rounded-[22px] px-4 py-3"
                          aria-label="Open view-once photo"
                          disabled={viewingAttachmentIds[attachmentKey]}
                          onClick={() => void handleViewOnceAttachment(msg.id, attachment)}
                        >
                          <Eye className="size-4" />
                          Open view-once photo
                        </Button>
                      );
                    }

                    return (
                      <div
                        key={attachment.id}
                        className={`overflow-hidden rounded-[22px] border ${
                          isOwn ? 'border-primary/30 bg-primary/10' : 'border-border bg-card'
                        }`}
                      >
                        <img
                          alt="Message photo"
                          src={resolveMediaUrl(attachment.url)}
                          className="block max-h-80 w-full max-w-xs object-cover"
                        />
                      </div>
                    );
                  })}
                  {msg.content ? (
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
                  ) : null}
                  <span className="px-1 text-[11px] text-muted-foreground">
                    {formatMessageTime(msg.timestamp)}
                    {msg.expiresAt ? ` · ${formatExpirationTime(msg.expiresAt)}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {conversation ? (
          <div className="fixed bottom-20 left-0 right-0 border-t border-border bg-background/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
            <div className="mx-auto max-w-2xl space-y-3">
              {composerDisabled ? (
                <div className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-muted-foreground">
                  {dmMessagingBlocked ? 'Send a cruush first. Messages open after it is mutual.' : 'This group is closed.'}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-muted-foreground" />
                <select
                  aria-label="Message disappearing timer"
                  value={conversation.disappearingTimer ?? 'off'}
                  disabled={!canManageConversation || settingsSaving || composerDisabled}
                  onChange={(event) => void handleTimerChange(event.target.value as ConversationTimer)}
                  className="h-9 rounded-md border border-border bg-card/85 px-2 text-sm text-muted-foreground disabled:opacity-60"
                >
                  {timerOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-[28px] border border-border bg-card/85 p-3 shadow-lg shadow-black/20">
                <div className="flex items-end gap-3">
                  <Textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !composerDisabled) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    disabled={composerDisabled}
                    placeholder={composerDisabled ? 'Group closed' : conversation.kind === 'group' ? 'Drop the plan...' : 'Say what you want...'}
                    className="min-h-[60px] border-0 bg-transparent px-0 py-1 focus-visible:ring-0"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Choose message photo"
                      className="sr-only"
                      onChange={(event) => void handlePhotoSelected(event)}
                    />
                    <label className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        aria-label="Send photo view once"
                        checked={photoViewOnce}
                        disabled={composerDisabled || photoUploading}
                        onChange={(event) => setPhotoViewOnce(event.target.checked)}
                      />
                      once
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Attach photo"
                      aria-label="Attach photo"
                      disabled={photoUploading || composerDisabled}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="size-4" />
                    </Button>
                    <Button
                      onClick={() => void handleSend()}
                      disabled={!message.trim() || composerDisabled}
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
        ) : null}
      </div>
    </div>
  );
}
