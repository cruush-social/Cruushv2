import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, RefObject } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Eye, Image as ImageIcon, ImagePlus, MoreHorizontal, Timer, Star, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import { Textarea } from './ui/textarea';
import { getCurrentUserId } from '../lib/sessionUser';
import {
  addGroupMember,
  clearConversationForEveryone,
  closeGroupConversation,
  createMessage,
  createMessagePhoto,
  deleteConversationForEveryone,
  deleteMessage,
  demoteGroupAdmin,
  getFavoriteMessageImages,
  getConversationMessages,
  getGroupMembers,
  removeFavoriteMessageImage,
  promoteGroupAdmin,
  removeGroupMember,
  sendFavoriteMessageImage,
  setConversationDisappearingTimer,
  type ChatMessageRecord,
  type ConversationTimer,
  type ConversationThread,
  type FavoriteMessageImage,
  type GroupMemberRecord,
  type MessageAttachment,
  type MessageSender,
  type PendingPhotoReview,
  type RemoteChatMessage,
  updateGroupConversation,
  uploadFavoriteMessageImage,
  viewMessageAttachment,
} from '../lib/messagesApi';
import { getMyCruushActivity, type MutualCruushActivityItem } from '../lib/cruushApi';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import { MESSAGE_PHOTO_UPLOAD_ACCEPT, prepareMessagePhotoForUpload } from '../lib/messagePhotoProcessing';
import { getProfileGradientCss } from '../lib/profileGradient';
import dlModeWhite from '../assets/ui-icons/dl-mode-white.png';

const timerOptions: Array<{ value: ConversationTimer; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const KEYBOARD_INSET_THRESHOLD_PX = 120;
const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function normalizeMessageForSend(value: string) {
  return value.replace(UNSAFE_CONTROL_CHARACTERS, '').trim();
}

function describeTextMessageError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'CONTENT_REJECTED') {
      return {
        message: 'This text message was rejected by text safety checks.',
        code: 'TEXT_CONTENT_REJECTED',
      };
    }

    if (error.code === 'MODERATION_UNAVAILABLE') {
      return {
        message: 'Text safety checks are temporarily unavailable. Try again later.',
        code: 'TEXT_MODERATION_UNAVAILABLE',
      };
    }

    if (error.code === 'FEATURE_RESTRICTED') {
      return {
        message: error.message || 'Text messaging is restricted for this account.',
        code: 'TEXT_MESSAGING_RESTRICTED',
      };
    }
  }

  return {
    message: 'We could not send this text message. Try again.',
    code: 'TEXT_MESSAGE_SEND_FAILED',
  };
}

function formatMessageTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatExpirationTime(isoTimestamp: string) {
  const expiresAt = new Date(isoTimestamp);

  return `expires ${expiresAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function formatRemainingExpirationTime(isoTimestamp: string, nowMs: number) {
  const expiresAtMs = new Date(isoTimestamp).getTime();

  if (!Number.isFinite(expiresAtMs)) {
    return null;
  }

  const remainingSeconds = Math.ceil((expiresAtMs - nowMs) / 1000);

  if (remainingSeconds <= 0) {
    return null;
  }

  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;

  if (days > 0) {
    return `Expires in ${days}d${hours > 0 ? ` ${hours}h` : ''}`;
  }

  if (hours > 0) {
    return `Expires in ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  }

  if (minutes > 0) {
    return `Expires in ${minutes}m${seconds > 0 ? ` ${seconds}s` : ''}`;
  }

  return `Expires in ${seconds}s`;
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
    userId: String(message.userId),
    author: message.userId === activeUserId ? 'self' : 'other',
    content: String(message.content ?? ''),
    timestamp: String(message.timestamp ?? new Date().toISOString()),
    expiresAt: message.expiresAt ? String(message.expiresAt) : undefined,
    attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
    user: message.user
      ? {
          id: String(message.user.id),
          name: String(message.user.name ?? 'cruush user'),
          pronouns: String(message.user.pronouns ?? ''),
          photo: message.user.photo ?? null,
          photoExplicit: message.user.photoExplicit,
        }
      : undefined,
  };
}

function normalizeRemoteMessages(remoteMessages: RemoteChatMessage[], activeUserId: string | null) {
  return remoteMessages.map((message) => normalizeRemoteMessage(message, activeUserId));
}

function isPendingPhotoReview(value: unknown): value is PendingPhotoReview {
  return typeof value === 'object'
    && value !== null
    && 'status' in value
    && value.status === 'pending_review'
    && 'assetId' in value
    && typeof value.assetId === 'string';
}

function ExplicitMessagePhotoShield({ attachmentKey }: { attachmentKey: string }) {
  return (
    <div
      aria-label="Explicit message photo hidden by DL Mode"
      className="flex aspect-[4/5] max-h-80 w-full max-w-xs min-w-[12rem] flex-col items-center justify-center gap-2 rounded-[22px] border border-white/10 p-4 text-center text-white shadow-[0_18px_45px_rgba(0,0,0,0.28)]"
      data-testid={`explicit-message-gradient-${attachmentKey}`}
      role="img"
      style={{ background: getProfileGradientCss(attachmentKey) }}
    >
      <CruushIconImage src={dlModeWhite} className="h-7 w-7 opacity-90" />
      <span className="text-[11px] uppercase tracking-[0.18em] text-white/88">DL Mode</span>
    </div>
  );
}

function openFileInput(
  inputRef: RefObject<HTMLInputElement | null>,
  disabled: boolean,
) {
  if (disabled) {
    return;
  }

  inputRef.current?.click();
}

function getMessageSender(
  message: ChatMessageRecord,
  conversation: ConversationThread,
  groupMembers: GroupMemberRecord[],
): MessageSender | null {
  if (conversation.kind === 'dm') {
    return conversation.user;
  }

  if (message.user) {
    return message.user;
  }

  const groupMember = groupMembers.find((member) => member.id === message.userId);

  if (groupMember) {
    return {
      id: groupMember.id,
      name: groupMember.name,
      pronouns: groupMember.pronouns,
      photo: groupMember.photo,
      photoExplicit: groupMember.photoExplicit,
    };
  }

  return message.userId
    ? { id: message.userId, name: 'cruush user', pronouns: '', photo: null, photoExplicit: true }
    : null;
}

export default function PrivateGroupChat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const messagePhotoInputId = useId();
  const favoriteImageInputId = useId();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [expiryNowMs, setExpiryNowMs] = useState(() => Date.now());
  const [conversation, setConversation] = useState<ConversationThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerErrorCode, setComposerErrorCode] = useState<string | null>(null);
  const [photoUploadNotice, setPhotoUploadNotice] = useState<string | null>(null);
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
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const [favoriteGalleryOpen, setFavoriteGalleryOpen] = useState(false);
  const [favoriteImages, setFavoriteImages] = useState<FavoriteMessageImage[]>([]);
  const [favoriteImagesLoading, setFavoriteImagesLoading] = useState(false);
  const [favoriteUploading, setFavoriteUploading] = useState(false);
  const [favoriteSendingId, setFavoriteSendingId] = useState<string | null>(null);
  const [favoriteRemovingId, setFavoriteRemovingId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const favoriteFileInputRef = useRef<HTMLInputElement | null>(null);
  const settingsPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  useEffect(() => {
    const reevaluateExpiredMessages = () => {
      const now = Date.now();
      setExpiryNowMs(now);
      setMessages((currentMessages) => {
        const activeMessages = currentMessages.filter((item) => {
          if (!item.expiresAt) {
            return true;
          }

          const expiresAt = new Date(item.expiresAt).getTime();
          return !Number.isFinite(expiresAt) || expiresAt > now;
        });

        return activeMessages.length === currentMessages.length ? currentMessages : activeMessages;
      });
    };

    reevaluateExpiredMessages();
    const timer = window.setInterval(reevaluateExpiredMessages, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const activeAttachmentKeys = new Set(
      messages.flatMap((item) => (item.attachments ?? []).map((attachment) => `${item.id}:${attachment.id}`)),
    );

    setViewedAttachmentUrls((currentUrls) => {
      let changed = false;
      const nextUrls: Record<string, string> = {};

      for (const [key, url] of Object.entries(currentUrls)) {
        if (activeAttachmentKeys.has(key)) {
          nextUrls[key] = url;
        } else {
          changed = true;
          URL.revokeObjectURL(url);
        }
      }

      return changed ? nextUrls : currentUrls;
    });
  }, [messages]);

  useEffect(() => {
    const visualViewport = window.visualViewport;

    if (!visualViewport) {
      return;
    }

    const updateKeyboardInset = () => {
      const nextInset = Math.max(
        0,
        Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop),
      );

      setKeyboardInset(nextInset >= KEYBOARD_INSET_THRESHOLD_PX ? nextInset : 0);
    };

    updateKeyboardInset();
    visualViewport.addEventListener('resize', updateKeyboardInset);
    visualViewport.addEventListener('scroll', updateKeyboardInset);

    return () => {
      visualViewport.removeEventListener('resize', updateKeyboardInset);
      visualViewport.removeEventListener('scroll', updateKeyboardInset);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadChatState = async () => {
      setLoading(true);
      setError(null);
      setComposerError(null);

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
        setComposerError(null);
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
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }

    setSettingsOpen(true);

    if (conversation?.kind === 'group') {
      void loadGroupSettingsData(conversation.id);
    }
  };

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      settingsPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [settingsOpen]);

  const loadFavoriteImages = async () => {
    setFavoriteImagesLoading(true);

    try {
      const data = await getFavoriteMessageImages();
      setFavoriteImages(Array.isArray(data.images) ? data.images : []);
      setError(null);
    } catch (error) {
      console.error('Error loading favorite images:', error);
      setError(error instanceof Error ? error.message : 'Failed to load favorite images.');
    } finally {
      setFavoriteImagesLoading(false);
    }
  };

  const toggleFavoriteGallery = () => {
    setFavoriteGalleryOpen((current) => {
      const next = !current;

      if (next) {
        void loadFavoriteImages();
      }

      return next;
    });
  };

  const handleFavoriteImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file || favoriteUploading || composerDisabled) {
      return;
    }

    setError(null);
    setComposerError(null);
    setPhotoUploadNotice(null);
    setFavoriteUploading(true);

    try {
      const label = file.name.replace(/\.[^.]+$/, '').slice(0, 80);
      const uploadFile = await prepareMessagePhotoForUpload(file);
      const favorite = await uploadFavoriteMessageImage(uploadFile, label);

      if (isPendingPhotoReview(favorite)) {
        setFavoriteGalleryOpen(true);
        setPhotoUploadNotice('Photo submitted for review. It will appear in your quick access gallery automatically.');
        return;
      }

      setFavoriteImages((prev) => [favorite, ...prev.filter((item) => item.id !== favorite.id)]);
      setFavoriteGalleryOpen(true);
      setError(null);
      setComposerError(null);
    } catch (error) {
      console.error('Error uploading favorite image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload favorite image.';
      setError(errorMessage);
      setComposerError(errorMessage);
      setPhotoUploadNotice(null);
    } finally {
      setFavoriteUploading(false);
    }
  };

  const handleSendFavoriteImage = async (favorite: FavoriteMessageImage) => {
    if (!chatId || !conversation || composerDisabled || favoriteSendingId) {
      return;
    }

    const caption = message.trim();
    setFavoriteSendingId(favorite.id);

    try {
      const createdMessage = await sendFavoriteMessageImage(favorite.id, {
        conversationId: chatId,
        content: caption,
        viewOnce: photoViewOnce,
      });
      setMessages((prev) => [...prev, normalizeRemoteMessage(createdMessage, currentUserId ?? createdMessage.userId)]);
      setMessage('');
      setError(null);
    } catch (error) {
      console.error('Error sending favorite image:', error);
      if (error instanceof ApiClientError && error.code === 'FORBIDDEN') {
        setError(error.message || 'You cannot message this user.');
      } else {
        setError(error instanceof Error ? error.message : 'Failed to send favorite image.');
      }
    } finally {
      setFavoriteSendingId(null);
    }
  };

  const handleRemoveFavoriteImage = async (favorite: FavoriteMessageImage) => {
    setFavoriteRemovingId(favorite.id);

    try {
      await removeFavoriteMessageImage(favorite.id);
      setFavoriteImages((prev) => prev.filter((item) => item.id !== favorite.id));
      setError(null);
    } catch (error) {
      console.error('Error removing favorite image:', error);
      setError(error instanceof Error ? error.message : 'Failed to remove favorite image.');
    } finally {
      setFavoriteRemovingId(null);
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
    if (!conversation) {
      return;
    }

    const confirmed = window.confirm('Clear all messages in this chat for everyone?');

    if (!confirmed) {
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

  const handleDeleteMessage = async (messageId: string) => {
    setDeletingMessageId(messageId);
    setError(null);

    try {
      await deleteMessage(messageId);
      setMessages((prev) => prev.filter((item) => item.id !== messageId));
      setViewedAttachmentUrls((prev) => Object.fromEntries(
        Object.entries(prev).filter(([key]) => !key.startsWith(`${messageId}:`)),
      ));
    } catch (error) {
      console.error('Error deleting message:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete message.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleDeleteForEveryone = async () => {
    if (!conversation || !canManageConversation) {
      return;
    }

    const confirmed = window.confirm('Delete this chat for everyone? This removes the chat and its messages for all participants.');

    if (!confirmed) {
      return;
    }

    setSettingsSaving(true);

    try {
      await deleteConversationForEveryone(conversation.id);
      setError(null);
      navigate('/messages');
    } catch (error) {
      console.error('Error deleting chat:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete chat.');
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

    if (shouldMaskPhoto(dlModeActive, attachment.explicit)) {
      setError('Turn off DL Mode to open this explicit view-once photo. It has not been consumed.');
      return;
    }

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
    if (!normalizedComposerMessage || !chatId || !conversation || composerDisabled) return;

    const optimisticId = `local-${Date.now()}`;
    const optimisticMessage: ChatMessageRecord = {
      id: optimisticId,
      userId: currentUserId ?? undefined,
      author: 'self',
      content: normalizedComposerMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setComposerError(null);
    setComposerErrorCode(null);
    setError(null);

    try {
      const createdMessage = await createMessage(chatId, normalizedComposerMessage);
      setMessages((prev) => prev.map((item) => (
        item.id === optimisticId
          ? normalizeRemoteMessage(createdMessage, currentUserId ?? createdMessage.userId)
          : item
      )));
      setMessage((currentMessage) => currentMessage === normalizedComposerMessage ? '' : currentMessage);
      setError(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      if (error instanceof ApiClientError && error.code === 'FORBIDDEN') {
        setError(error.message || 'You cannot message this user.');
      } else {
        const textError = describeTextMessageError(error);
        setError(null);
        setComposerError(textError.message);
        setComposerErrorCode(textError.code);
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
    setError(null);
    setComposerError(null);
    setPhotoUploadNotice(null);
    setPhotoUploading(true);

    try {
      const uploadFile = await prepareMessagePhotoForUpload(file);
      const createdMessage = await createMessagePhoto(chatId, uploadFile, caption, { viewOnce: photoViewOnce });

      if (isPendingPhotoReview(createdMessage)) {
        setMessage('');
        setPhotoViewOnce(false);
        setPhotoUploadNotice('Photo submitted for review. It will send automatically after safety checks complete.');
        return;
      }

      setMessages((prev) => [...prev, normalizeRemoteMessage(createdMessage, currentUserId ?? createdMessage.userId)]);
      setMessage('');
      setPhotoViewOnce(false);
      setError(null);
      setComposerError(null);
    } catch (error) {
      console.error('Error sending message photo:', error);
      if (error instanceof ApiClientError && error.code === 'FORBIDDEN') {
        setError(error.message || 'You cannot message this user.');
        setComposerError(null);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send photo.';
        setError(errorMessage);
        setComposerError(errorMessage);
      }
      setPhotoUploadNotice(null);
    } finally {
      setPhotoUploading(false);
    }
  };

  const openUserProfile = (userId?: string) => {
    if (!conversation || !userId) {
      return;
    }

    navigate(`/profile/${userId}`, {
      state: {
        distance: conversation.distance,
      },
    });
  };

  const openDmProfile = () => {
    if (!conversation || conversation.kind !== 'dm') {
      return;
    }

    openUserProfile(conversation.user.id);
  };
  const groupMemberIds = new Set(groupMembers.map((member) => member.id));
  const availableAddOptions = mutualOptions.filter((item) => !groupMemberIds.has(item.user.id));
  const messagePhotoControlDisabled = photoUploading || composerDisabled;
  const normalizedComposerMessage = normalizeMessageForSend(message);
  const canSendMessage = normalizedComposerMessage.length > 0;
  const favoriteUploadControlDisabled = favoriteUploading || composerDisabled;
  const composerBarStyle = {
    '--chat-composer-bottom': keyboardInset > 0
      ? `calc(0.75rem + env(safe-area-inset-bottom) + ${keyboardInset}px)`
      : 'calc(6.25rem + env(safe-area-inset-bottom))',
  } as CSSProperties;

  return (
    <div data-testid="private-group-chat-screen" className="relative min-h-screen max-w-full overflow-x-clip bg-background pb-20">
      <header data-testid="chat-thread-header" className="sticky top-0 z-40 border-b border-border bg-background/88 px-3 py-4 backdrop-blur-md sm:px-4">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back to messages">
              <ArrowLeft className="w-5 h-5" />
            </Button>

            {conversation ? (
              <HeartPhoto
                className="w-12 shrink-0"
                label={`${conversation.user.name} avatar`}
                masked={shouldMaskPhoto(dlModeActive, conversation.user.photoExplicit)}
                photo={conversation.user.photo}
                theme={conversation.kind === 'group' || conversation.mutual ? 'mutual' : 'nearby'}
                userId={conversation.user.id}
                onClick={conversation.kind === 'dm' ? openDmProfile : undefined}
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
                      <Badge variant="outline" className="border-[#8B5CF6]/45 bg-[#8B5CF6]/15 text-[10px] uppercase tracking-[0.18em] text-[#DCC7FF]">
                        Mutual
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

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {conversation ? (
              <ReportAction
                targetType="conversation"
                targetId={conversation.id}
                targetLabel={conversation.kind === 'dm' ? `conversation with ${conversation.user.name}` : conversation.user.name}
                label="Report conversation"
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="More conversation options"
              aria-expanded={settingsOpen}
              aria-controls="conversation-settings"
              disabled={!conversation}
              onClick={openSettings}
            >
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-[calc(17rem+env(safe-area-inset-bottom))] pt-4">
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
          <section
            ref={settingsPanelRef}
            id="conversation-settings"
            className="mb-4 space-y-4 rounded-3xl border border-border bg-card/80 p-4"
          >
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

            <div className="space-y-2">
              <span className="block text-sm text-muted-foreground">Disappearing timer</span>
              <Select
                value={conversation.disappearingTimer ?? 'off'}
                disabled={!canManageConversation || settingsSaving}
                onValueChange={(value) => void handleTimerChange(value as ConversationTimer)}
              >
                <SelectTrigger
                  aria-label="Disappearing timer"
                  className="h-11 w-full rounded-2xl border-white/12 bg-card/82 px-4 text-sm text-foreground shadow-[0_10px_24px_rgba(0,0,0,0.24)] hover:border-primary/30 hover:bg-card disabled:opacity-60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className="rounded-2xl border-white/12 bg-card/95 p-1 text-foreground shadow-[0_18px_52px_rgba(0,0,0,0.46)] backdrop-blur-xl"
                >
                  {timerOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-primary/14 focus:text-foreground data-[state=checked]:bg-primary/16"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              aria-label="Clear chat for everyone"
              className="w-full justify-center border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={settingsSaving}
              onClick={() => void handleClearForEveryone()}
            >
              <Trash2 className="size-4" />
              Clear all messages
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-center border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={!canManageConversation || settingsSaving}
              onClick={() => void handleDeleteForEveryone()}
            >
              <Trash2 className="size-4" />
              Delete chat for everyone
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
                        aria-label="Add mutual"
                        value={addMemberId}
                        onChange={(event) => setAddMemberId(event.target.value)}
                        className="h-11 w-full rounded-md border border-border bg-input-background px-3 text-sm"
                      >
                        <option value="">Add a mutual</option>
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
            const remainingExpiration = isOwn && msg.expiresAt
              ? formatRemainingExpirationTime(msg.expiresAt, expiryNowMs)
              : null;
            const messageSender = !isOwn && conversation
              ? getMessageSender(msg, conversation, groupMembers)
              : null;

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
                {messageSender ? (
                  <button
                    type="button"
                    className="w-9 shrink-0 rounded-full p-0 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label={`Open ${messageSender.name} profile`}
                    onClick={() => openUserProfile(messageSender.id)}
                  >
                    <HeartPhoto
                      className="w-9"
                      label={`${messageSender.name} avatar`}
                      masked={shouldMaskPhoto(dlModeActive, messageSender.photoExplicit)}
                      photo={messageSender.photo}
                      theme={conversation?.kind === 'dm' && conversation.mutual ? 'mutual' : 'nearby'}
                      userId={messageSender.id}
                      fallback={<div className="text-[10px] text-white/75">{getConversationInitials(messageSender.name)}</div>}
                    />
                  </button>
                ) : null}

                <div className={`max-w-[78%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  {msg.attachments?.map((attachment) => {
                    const attachmentKey = `${msg.id}:${attachment.id}`;
                    const openedViewOnceUrl = viewedAttachmentUrls[attachmentKey];
                    if (attachment.viewOnce) {
                      if (isOwn && !openedViewOnceUrl) {
                        return shouldMaskPhoto(dlModeActive, attachment.explicit) ? (
                          <ExplicitMessagePhotoShield key={attachment.id} attachmentKey={attachmentKey} />
                        ) : (
                          <div
                            key={attachment.id}
                            className="relative aspect-[3/4] w-[min(72vw,19rem)] overflow-hidden rounded-[1.7rem] border border-primary/45 bg-black shadow-[0_18px_46px_rgba(0,0,0,0.38)]"
                          >
                            <img
                              alt="Your view-once photo"
                              src={resolveMediaUrl(attachment.url)}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 via-black/40 to-transparent px-4 pb-4 pt-16">
                              <div className="flex items-center gap-2 text-xs font-medium text-white/88">
                                <span className="flex size-7 items-center justify-center rounded-full border border-white/24 bg-white/12">
                                  <Eye className="size-3.5" />
                                </span>
                                <span>View-once photo sent</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (openedViewOnceUrl) {
                        if (shouldMaskPhoto(dlModeActive, attachment.explicit)) {
                          return <ExplicitMessagePhotoShield key={attachment.id} attachmentKey={attachmentKey} />;
                        }

                        return (
                          <div
                            key={attachment.id}
                            className={`relative aspect-[3/4] w-[min(72vw,19rem)] overflow-hidden rounded-[1.7rem] border shadow-[0_18px_46px_rgba(0,0,0,0.38)] ${
                              isOwn ? 'border-primary/45 bg-black' : 'border-white/14 bg-black'
                            }`}
                          >
                            <img
                              alt="View-once photo"
                              src={openedViewOnceUrl}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        );
                      }

                      if (attachment.viewedAt) {
                        return (
                          <div
                            key={attachment.id}
                            className="flex min-h-24 w-[min(72vw,19rem)] items-center gap-3 rounded-[1.7rem] border border-white/12 bg-card/82 px-4 py-4 text-sm text-muted-foreground"
                          >
                            <span className="flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/72">
                              <Eye className="size-4" />
                            </span>
                            <span>View-once photo viewed</span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={attachment.id}
                          type="button"
                          className="group flex min-h-28 w-[min(72vw,19rem)] items-center gap-3 overflow-hidden rounded-[1.7rem] border border-white/14 bg-card/82 px-4 py-4 text-left shadow-[0_18px_46px_rgba(0,0,0,0.28)] transition-colors hover:border-primary/45 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="Open view-once photo"
                          disabled={viewingAttachmentIds[attachmentKey]}
                          onClick={() => void handleViewOnceAttachment(msg.id, attachment)}
                        >
                          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/12 text-primary transition-colors group-hover:bg-primary/18">
                            <Eye className="size-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">
                              {viewingAttachmentIds[attachmentKey] ? 'Opening photo...' : 'Open view-once photo'}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">Tap to reveal once.</span>
                          </span>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={attachment.id}
                        className={`overflow-hidden rounded-[22px] border ${
                          isOwn ? 'border-primary/30 bg-primary/10' : 'border-border bg-card'
                        }`}
                      >
                        {shouldMaskPhoto(dlModeActive, attachment.explicit) ? (
                          <ExplicitMessagePhotoShield attachmentKey={attachmentKey} />
                        ) : (
                          <img
                            alt="Message photo"
                            src={resolveMediaUrl(attachment.url)}
                            className="block max-h-80 w-full max-w-xs object-cover"
                          />
                        )}
                      </div>
                    );
                  })}
                  {msg.content ? (
                    <div
                      className="rounded-[22px] px-4 py-3 text-sm leading-relaxed text-white"
                      style={{
                        // Bubbles carry the relationship colours the pins use:
                        // indigo for you, purple for a mutual, pink otherwise.
                        background: isOwn
                          ? '#3826FF'
                          : conversation?.kind === 'group' || conversation?.mutual
                            ? '#6F00FF'
                            : '#FF0072',
                      }}
                    >
                      {msg.content}
                    </div>
                  ) : null}
                  {remainingExpiration ? (
                    <div
                      role="timer"
                      aria-label={remainingExpiration}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/12 px-2.5 py-1 text-[11px] font-medium text-primary shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
                    >
                      <span className="flex size-6 items-center justify-center rounded-full border border-primary/30 bg-primary/12">
                        <Timer className="size-3" />
                      </span>
                      <span>{remainingExpiration}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-[11px] text-muted-foreground">
                      {formatMessageTime(msg.timestamp)}
                      {!isOwn && msg.expiresAt ? ` · ${formatExpirationTime(msg.expiresAt)}` : ''}
                    </span>
                    {(isOwn || (conversation?.kind === 'group' && canManageConversation)) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label="Delete message"
                        disabled={deletingMessageId === msg.id}
                        onClick={() => void handleDeleteMessage(msg.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                    {!isOwn ? (
                      <ReportAction
                        targetType="message"
                        targetId={msg.id}
                        targetLabel="message"
                        label="Report message"
                        className="size-7"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {conversation ? (
          <div
            data-testid="chat-composer-bar"
            className="fixed bottom-[var(--chat-composer-bottom)] left-0 right-0 max-w-[100vw] overflow-x-hidden border-t border-border bg-background/90 px-3 pb-3 pt-3 backdrop-blur-md sm:px-4"
            data-keyboard-open={keyboardInset > 0 ? 'true' : undefined}
            style={composerBarStyle}
          >
            <div className="mx-auto w-full max-w-2xl space-y-3">
              {composerError ? (
                <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <p>{composerError}</p>
                  {composerErrorCode ? (
                    <p className="mt-1 text-xs text-destructive/80">Error code: {composerErrorCode}</p>
                  ) : null}
                </div>
              ) : null}

              {photoUploadNotice ? (
                <div role="status" className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
                  {photoUploadNotice}
                </div>
              ) : null}

              {composerDisabled ? (
                <div className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-muted-foreground">
                  {dmMessagingBlocked ? 'Messaging is unavailable for this conversation.' : 'This group is closed.'}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Select
                  value={conversation.disappearingTimer ?? 'off'}
                  disabled={!canManageConversation || settingsSaving || composerDisabled}
                  onValueChange={(value) => void handleTimerChange(value as ConversationTimer)}
                >
                  <SelectTrigger
                    aria-label="Message disappearing timer"
                    size="sm"
                    className="h-9 w-auto min-w-28 rounded-full border-white/12 bg-card/82 px-3 text-xs text-foreground shadow-[0_10px_24px_rgba(0,0,0,0.24)] hover:border-primary/30 hover:bg-card disabled:opacity-60"
                  >
                    <Timer className="size-3.5 text-primary" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    className="min-w-36 rounded-2xl border-white/12 bg-card/95 p-1 text-foreground shadow-[0_18px_52px_rgba(0,0,0,0.46)] backdrop-blur-xl"
                  >
                    {timerOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-primary/14 focus:text-foreground data-[state=checked]:bg-primary/16"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label
                  className={[
                    'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card/72 px-2.5 text-xs text-muted-foreground transition-colors',
                    photoViewOnce ? 'border-primary/40 bg-primary/10 text-primary' : '',
                    composerDisabled || photoUploading ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <Checkbox
                    aria-label="Send photo view once"
                    checked={photoViewOnce}
                    disabled={composerDisabled || photoUploading}
                    className="size-4 rounded-full"
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      setPhotoViewOnce(next);
                      if (next) {
                        openFileInput(fileInputRef, messagePhotoControlDisabled);
                      }
                    }}
                  />
                  <span
                    role="button"
                    tabIndex={composerDisabled || photoUploading ? -1 : 0}
                    onClick={(event) => {
                      event.preventDefault();
                      setPhotoViewOnce((current) => !current);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPhotoViewOnce((current) => !current);
                      }
                    }}
                  >once</span>
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Quick access gallery"
                  aria-label="Quick access gallery"
                  disabled={composerDisabled}
                  onClick={toggleFavoriteGallery}
                >
                  <Star className="size-4" fill={favoriteGalleryOpen ? 'currentColor' : 'none'} />
                </Button>
              </div>

              <div className="max-w-full rounded-[28px] border border-border bg-card/85 p-3 shadow-lg shadow-black/20">
                {favoriteGalleryOpen ? (
                  <div className="mb-3 space-y-3 rounded-3xl border border-white/10 bg-black/28 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Star className="size-4 text-primary" fill="currentColor" />
                        <p className="text-sm font-medium">Quick access gallery</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          id={favoriteImageInputId}
                          ref={favoriteFileInputRef}
                          type="file"
                          accept={MESSAGE_PHOTO_UPLOAD_ACCEPT}
                          aria-label="Choose favorite image"
                          className="sr-only"
                          disabled={favoriteUploadControlDisabled}
                          onChange={(event) => void handleFavoriteImageSelected(event)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={favoriteUploadControlDisabled}
                          onClick={() => openFileInput(favoriteFileInputRef, favoriteUploadControlDisabled)}
                        >
                          <ImagePlus className="size-4" />
                          {favoriteUploading ? 'Uploading' : 'Upload'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Close quick access gallery"
                          onClick={() => setFavoriteGalleryOpen(false)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {favoriteImagesLoading ? (
                      <div className="rounded-2xl border border-border bg-card/70 p-3 text-sm text-muted-foreground">
                        Loading favorite images...
                      </div>
                    ) : null}

                    {!favoriteImagesLoading && favoriteImages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
                        No favorite images yet.
                      </div>
                    ) : null}

                    {favoriteImages.length > 0 ? (
                      <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                        {favoriteImages.map((favorite) => {
                          const favoriteBusy = favoriteSendingId === favorite.id || favoriteRemovingId === favorite.id;
                          const hiddenByDlMode = shouldMaskPhoto(dlModeActive, favorite.explicit);

                          return (
                            <div key={favorite.id} className="overflow-hidden rounded-2xl border border-border bg-background/70">
                              <div className="relative aspect-square overflow-hidden bg-black/40">
                                {hiddenByDlMode ? (
                                  <div
                                    aria-label="Explicit favorite image hidden by DL Mode"
                                    className="flex h-full w-full items-center justify-center text-white"
                                    role="img"
                                    style={{ background: getProfileGradientCss(`favorite:${favorite.id}`) }}
                                  >
                                    <CruushIconImage src={dlModeWhite} className="size-5" />
                                  </div>
                                ) : (
                                  <img
                                    alt={favorite.label || 'Favorite image'}
                                    src={resolveMediaUrl(favorite.thumbnailUrl || favorite.url)}
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-1 p-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-full"
                                  aria-label="Send favorite image"
                                  disabled={composerDisabled || favoriteBusy}
                                  onClick={() => void handleSendFavoriteImage(favorite)}
                                >
                                  <CruushIcon name="send" className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-full text-destructive hover:bg-destructive/10"
                                  aria-label="Remove favorite image"
                                  disabled={favoriteBusy}
                                  onClick={() => void handleRemoveFavoriteImage(favorite)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex min-w-0 items-end gap-2 sm:gap-3">
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
                    className="min-h-[60px] min-w-0 flex-1 border-0 bg-transparent px-0 py-1 focus-visible:ring-0"
                  />
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <input
                      id={messagePhotoInputId}
                      ref={fileInputRef}
                      type="file"
                      accept={MESSAGE_PHOTO_UPLOAD_ACCEPT}
                      aria-label="Choose message photo"
                      className="sr-only"
                      disabled={messagePhotoControlDisabled}
                      onChange={(event) => void handlePhotoSelected(event)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={photoUploading ? 'Sending photo' : 'Attach photo'}
                      aria-label={photoUploading ? 'Sending photo' : 'Attach photo'}
                      disabled={messagePhotoControlDisabled}
                      onClick={() => openFileInput(fileInputRef, messagePhotoControlDisabled)}
                    >
                      <ImageIcon className="size-4" />
                    </Button>
                    <Button
                      onClick={() => void handleSend()}
                      disabled={!canSendMessage || composerDisabled}
                      size="icon"
                      className="rounded-full"
                      aria-label="Send message"
                      style={{
                        background: canSendMessage
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
