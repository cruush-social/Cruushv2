import { usePopupRoute } from '../lib/popupRouteContext';
import { useContentVisibilityRefresh } from '../lib/contentVisibilityRevision';
import { Switch } from './ui/switch';
import { useTrustRestrictions } from '../lib/trustRestrictions';
import TrustRestrictionNotice from './TrustRestrictionNotice';
import PhotoUploadSpinner from './PhotoUploadSpinner';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, RefObject } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router';
import { Clock3, Eye, Image as ImageIcon, ImagePlus, Share2, Timer, Star, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import { CruushIcon } from './CruushIconImage';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import HeartPhoto from './HeartPhoto';
import CruushesProfileCard from './CruushesProfileCard';
import ProfileActionTrio from './ProfileActionTrio';
import { Textarea } from './ui/textarea';
import { getCurrentUserId } from '../lib/sessionUser';
import { addCruushChangedListener } from '../lib/cruushEvents';
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
  leaveGroupConversation,
  removeFavoriteMessageImage,
  promoteGroupAdmin,
  removeGroupMember,
  setClubMemberRole,
  sendGroupPulse,
  sendFavoriteMessageImage,
  setConversationDisappearingTimer,
  setConversationNotifications,
  type ChatMessageRecord,
  type ConversationMuteDuration,
  type ConversationNotificationLevel,
  type ConversationTimer,
  type ConversationThread,
  type FavoriteMessageImage,
  type GroupMemberRecord,
  type MessageAttachment,
  type MessageSender,
  type PendingPhotoReview,
  type RemoteChatMessage,
  parseInAppShareMessage,
  updateGroupConversation,
  uploadFavoriteMessageImage,
  viewMessageAttachment,
} from '../lib/messagesApi';
import { getMyCruushActivity, revokeMutualCruush, revokeSentCruush, sendCruush, type MutualCruushActivityItem } from '../lib/cruushApi';
import {
  getClub,
  getClubJoinRequests,
  reviewClubJoinRequest,
  updateClub,
  updateClubVisibility,
  type ClubApplicant,
  type ClubDetailRecord,
} from '../lib/clubsApi';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';
import { useDlMode, shouldMaskPhoto, getNsfwPhotoRestriction, getNsfwPhotoRestrictionLabel, type NsfwPhotoRestriction } from '../lib/dlMode';
import { resolveUserBorderTone } from '../lib/userBorderTone';
import { MESSAGE_PHOTO_UPLOAD_ACCEPT, prepareMessagePhotoForUpload } from '../lib/messagePhotoProcessing';
import { getProfileGradientCss } from '../lib/profileGradient';
import { getProfileById, type ProfileRecord } from '../lib/profileApi';
import { openConversationOrInbox } from '../lib/openConversation';
import DlModePhotoPlaceholder from './DlModePhotoPlaceholder';
import PulseLedIcon from './PulseLedIcon';
import { useMapServiceArea } from './MapServiceAreaContext';
import TagInput from './TagInput';
import AppPageHeader from './AppPageHeader';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';
import { visibilityRulesToState, visibilityStateToRules } from '../lib/visibilityControls';
import InAppShareDialog from './InAppShareDialog';
import ViewOncePhotoViewer from './ViewOncePhotoViewer';
import profileEditIconWhite from '../assets/ui-icons/humanity-profile-selected-winged-heart-symmetric.png';

const timerOptions: Array<{ value: ConversationTimer; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const notificationMuteOptions: Array<{ value: ConversationMuteDuration; label: string }> = [
  { value: 'off', label: 'Notifications on' },
  { value: '1h', label: 'Mute for 1 hour' },
  { value: '8h', label: 'Mute for 8 hours' },
  { value: '24h', label: 'Mute for 24 hours' },
  { value: '7d', label: 'Mute for 7 days' },
];

const KEYBOARD_INSET_THRESHOLD_PX = 120;
const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const sharedProfileActionClassName = '!gap-1 [&>button]:!size-9 [&>button]:!p-1.5 [&>button>img]:!size-5 [&>button>svg]:!size-5';

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
    readAt: message.readAt ? String(message.readAt) : undefined,
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

function ExplicitMessagePhotoShield({ attachmentKey, restriction }: { attachmentKey: string; restriction?: NsfwPhotoRestriction }) {
  return (
    <div
      aria-label={getNsfwPhotoRestrictionLabel(restriction) ?? 'Explicit message photo hidden by DL Mode'}
      className="flex aspect-[4/5] max-h-80 w-full max-w-xs min-w-[12rem] flex-col items-center justify-center gap-2 rounded-[22px] border border-white/10 p-4 text-center text-white shadow-[0_18px_45px_rgba(0,0,0,0.28)]"
      data-testid={`explicit-message-gradient-${attachmentKey}`}
      role="img"
      style={{ background: getProfileGradientCss(attachmentKey) }}
    >
      <DlModePhotoPlaceholder restriction={restriction} />
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
      outOfSight: groupMember.outOfSight,
      photoExplicit: groupMember.photoExplicit,
      photoRelationship: groupMember.photoRelationship,
    };
  }

  return message.userId
    ? { id: message.userId, name: 'cruush user', pronouns: '', photo: null, photoExplicit: true }
    : null;
}

function sharedProfileCardUser(profile: ProfileRecord) {
  const firstPhoto = profile.photos[0] ?? null;
  const firstPhotoMetadata = firstPhoto
    ? profile.photo_metadata?.find((photo) => photo.url === firstPhoto)
    : undefined;

  return {
    id: profile.id,
    name: profile.display_name,
    pronouns: [...profile.pronouns, profile.custom_pronouns].filter(Boolean).join(' / '),
    photo: firstPhoto,
    photoExplicit: firstPhotoMetadata?.explicit,
    photoRelationship: profile.photo_relationship,
    badges: profile.badges,
    sideBadges: profile.side_badges,
    travelling: profile.travelling,
    outOfSight: profile.outOfSight === true,
    vibes: profile.vibes,
  };
}

export default function PrivateGroupChat({
  backLabel = 'Back to messages',
  conversationId,
  embedded: embeddedProp = false,
  onBack,
  onClose,
}: {
  backLabel?: string;
  conversationId?: string;
  embedded?: boolean;
  onBack?: () => void;
  onClose?: () => void;
} = {}) {
  const popupRoute = usePopupRoute();
  const embedded = embeddedProp || Boolean(popupRoute);
  const params = useParams();
  const { profilePinsAllowed: groupPulseAllowed } = useMapServiceArea();
  // The dock renders this thread without a route of its own.
  const chatId = conversationId ?? params.chatId;
  const navigate = useNavigate();
  const location = useLocation();
  const settingsOpen = location.pathname.endsWith('/settings');
  const routeBackLabel = !embedded
    && (location.state as { conversationOrigin?: string } | null)?.conversationOrigin === 'profile'
    ? 'Back to profile'
    : backLabel;
  const messagePhotoInputId = useId();
  const favoriteImageInputId = useId();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [sharedProfiles, setSharedProfiles] = useState<Record<string, ProfileRecord>>({});
  const [expiryNowMs, setExpiryNowMs] = useState(() => Date.now());
  const chatLoadGeneration = useRef(0);
  const [conversation, setConversation] = useState<ConversationThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerErrorCode, setComposerErrorCode] = useState<string | null>(null);
  const [photoUploadNotice, setPhotoUploadNotice] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [textMessageSending, setTextMessageSending] = useState(false);
  const [photoViewOnce, setPhotoViewOnce] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMemberRecord[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupPulseSending, setGroupPulseSending] = useState(false);
  const [groupPulseNotice, setGroupPulseNotice] = useState('');
  const [groupTitleDraft, setGroupTitleDraft] = useState('');
  const [clubSettings, setClubSettings] = useState<ClubDetailRecord | null>(null);
  const [clubApplicants, setClubApplicants] = useState<ClubApplicant[]>([]);
  const [clubTitleDraft, setClubTitleDraft] = useState('');
  const [clubSummaryDraft, setClubSummaryDraft] = useState('');
  const [clubTagsDraft, setClubTagsDraft] = useState<string[]>([]);
  const [clubRequiresJoinApprovalDraft, setClubRequiresJoinApprovalDraft] = useState(true);
  const [clubVisibilityOpen, setClubVisibilityOpen] = useState(false);
  const [clubShareOpen, setClubShareOpen] = useState(false);
  const [clubVisibility, setClubVisibility] = useState<VisibilityControlState>(DEFAULT_VISIBILITY_STATE);
  const [reviewingClubUserId, setReviewingClubUserId] = useState<string | null>(null);
  const [mutualOptions, setMutualOptions] = useState<MutualCruushActivityItem[]>([]);
  const [addMemberId, setAddMemberId] = useState('');
  const [viewedAttachmentUrls, setViewedAttachmentUrls] = useState<Record<string, string>>({});
  const [activeViewOnceKey, setActiveViewOnceKey] = useState<string | null>(null);
  const viewOnceRequestScopeRef = useRef(0);
  const viewedAttachmentUrlsRef = useRef(viewedAttachmentUrls);
  viewedAttachmentUrlsRef.current = viewedAttachmentUrls;
  const [viewingAttachmentIds, setViewingAttachmentIds] = useState<Record<string, boolean>>({});
  const [mutualRequiredConversationId, setMutualRequiredConversationId] = useState<string | null>(null);
  const dlModeActive = useDlMode();
  const [favoriteGalleryOpen, setFavoriteGalleryOpen] = useState(false);
  const [favoriteImages, setFavoriteImages] = useState<FavoriteMessageImage[]>([]);
  const [favoriteImagesLoading, setFavoriteImagesLoading] = useState(false);
  const [favoriteUploading, setFavoriteUploading] = useState(false);
  const [favoriteSendingId, setFavoriteSendingId] = useState<string | null>(null);
  const [favoriteRemovingId, setFavoriteRemovingId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [composerFocused, setComposerFocused] = useState(false);
  const [dmKeyboardOpen, setDmKeyboardOpen] = useState(false);
  const dmKeyboardOpenRef = useRef(false);
  const keyboardViewportBaseline = useRef({ height: Math.max(window.innerHeight, document.documentElement.clientHeight), width: window.innerWidth });
  const [dmComposerClearance, setDmComposerClearance] = useState<number | null>(null);
  const threadContentRef = useRef<HTMLDivElement | null>(null);
  const composerBarRef = useRef<HTMLDivElement | null>(null);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const retainKeyboardBottomRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const favoriteFileInputRef = useRef<HTMLInputElement | null>(null);
  const settingsPanelRef = useRef<HTMLElement | null>(null);
  const textMessageSendingRef = useRef(false);

  useLayoutEffect(() => {
    if (conversation?.kind !== 'dm' || settingsOpen) return;
    const composer = composerBarRef.current;
    const viewport = threadContentRef.current?.closest<HTMLElement>(embedded
      ? '[data-testid="map-side-panel-content"], [data-testid="popup-route-content"]'
      : '[data-testid="app-page-content"]');
    if (!composer || !viewport) return;
    const measure = () => {
      const composerBounds = composer.getBoundingClientRect();
      const viewportBounds = viewport.getBoundingClientRect();
      if (!composerBounds.height || !viewportBounds.height) return;
      // AppViewport already reserves navigation space. Reserve only the part
      // of its scroll area covered by the fixed composer; the route retains
      // its existing 1rem end gap. Keyboard bottom retention is handled separately.
      setDmComposerClearance(Math.max(0, viewportBounds.bottom - composerBounds.top));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    observer.observe(viewport);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [conversation?.kind, embedded, settingsOpen, keyboardInset, composerFocused, dmKeyboardOpen]);

  useLayoutEffect(() => {
    if (conversation?.kind !== 'dm' || embedded || settingsOpen || !dmKeyboardOpen) return;
    const viewport = threadContentRef.current?.closest<HTMLElement>('[data-testid="app-page-content"]');
    if (!viewport) return;
    let frame = 0;
    const retainBottom = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (retainKeyboardBottomRef.current) viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      });
    };
    const releaseBottom = () => { retainKeyboardBottomRef.current = false; };
    const observer = new ResizeObserver(retainBottom);
    observer.observe(viewport);
    if (threadContentRef.current) observer.observe(threadContentRef.current);
    viewport.addEventListener('touchstart', releaseBottom, { passive: true });
    viewport.addEventListener('wheel', releaseBottom, { passive: true });
    retainBottom();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener('touchstart', releaseBottom);
      viewport.removeEventListener('wheel', releaseBottom);
    };
  }, [conversation?.kind, embedded, settingsOpen, dmKeyboardOpen, dmComposerClearance, keyboardInset]);

  // Opening a thread starts at its newest message. Keep that position through
  // late media/composer layout, but stop as soon as the reader browses history.
  useLayoutEffect(() => {
    if (loading || settingsOpen || !messages.length || conversation?.id !== chatId) return;
    const content = threadContentRef.current;
    const viewport = content?.closest<HTMLElement>(
      '[data-testid="map-side-panel-content"], [data-testid="popup-route-content"], [data-testid="app-page-content"]',
    );
    if (!content || !viewport) return;
    let retaining = true;
    let frame = 0;
    let lastScrollTop = viewport.scrollTop;
    const release = () => { retaining = false; cancelAnimationFrame(frame); };
    const retainLatest = () => {
      if (!retaining) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!retaining) return;
        viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        lastScrollTop = viewport.scrollTop;
      });
    };
    const onScroll = () => {
      if (viewport.scrollTop < lastScrollTop - 1) release();
      lastScrollTop = viewport.scrollTop;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
        && !(event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]'))) release();
    };
    const observer = new ResizeObserver(retainLatest);
    observer.observe(content);
    observer.observe(viewport);
    if (composerBarRef.current) observer.observe(composerBarRef.current);
    viewport.addEventListener('wheel', release, { passive: true });
    viewport.addEventListener('touchstart', release, { passive: true });
    viewport.addEventListener('pointerdown', release, { passive: true });
    viewport.addEventListener('keydown', onKeyDown);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    retainLatest();
    return () => {
      release();
      observer.disconnect();
      viewport.removeEventListener('wheel', release);
      viewport.removeEventListener('touchstart', release);
      viewport.removeEventListener('pointerdown', release);
      viewport.removeEventListener('keydown', onKeyDown);
      viewport.removeEventListener('scroll', onScroll);
    };
  }, [chatId, conversation?.id, loading, settingsOpen, messages.length > 0]);

  const focusComposer = () => {
    if (!dmKeyboardOpenRef.current) {
      const viewport = threadContentRef.current?.closest<HTMLElement>('[data-testid="app-page-content"]');
      const last = latestMessageRef.current?.getBoundingClientRect();
      const bounds = viewport?.getBoundingClientRect();
      const composerTop = composerBarRef.current?.getBoundingClientRect().top;
      retainKeyboardBottomRef.current = Boolean(viewport && (
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 24
        || (last && last.height > 0 && bounds && composerTop !== undefined
          && last.bottom >= bounds.top && last.bottom <= Math.min(bounds.bottom, composerTop))
      ));
    }
    setComposerFocused(true);
  };

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

  const closeViewOncePhoto = () => {
    if (!activeViewOnceKey) return;
    const key = activeViewOnceKey;
    const url = viewedAttachmentUrlsRef.current[key];
    if (url) URL.revokeObjectURL(url);
    setViewedAttachmentUrls((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setActiveViewOnceKey(null);
  };

  const activeViewOnceAttachment = messages.flatMap((item) =>
    (item.attachments ?? []).map((attachment) => ({ key: `${item.id}:${attachment.id}`, attachment })),
  ).find((item) => item.key === activeViewOnceKey)?.attachment;
  const activeViewOnceUrl = activeViewOnceKey ? viewedAttachmentUrls[activeViewOnceKey] : undefined;
  const viewOncePhotoAllowed = activeViewOnceAttachment
    && !shouldMaskPhoto(dlModeActive, activeViewOnceAttachment.explicit, activeViewOnceAttachment.photoRelationship);

  useEffect(() => {
    if (activeViewOnceKey && !viewOncePhotoAllowed) closeViewOncePhoto();
  }, [activeViewOnceKey, viewOncePhotoAllowed]);

  useEffect(() => {
    setActiveViewOnceKey(null);
    return () => { viewOnceRequestScopeRef.current += 1; };
  }, [chatId]);

  useEffect(() => () => {
    for (const url of Object.values(viewedAttachmentUrlsRef.current)) URL.revokeObjectURL(url);
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
    const sharedProfileIds = [...new Set(messages
      .map((item) => parseInAppShareMessage(item.content))
      .filter((share): share is NonNullable<typeof share> => share?.kind === 'profile')
      .map((share) => share.id))];

    if (sharedProfileIds.length === 0) {
      return;
    }

    let active = true;
    void Promise.all(sharedProfileIds.map(async (profileId) => {
      try {
        return await getProfileById(profileId);
      } catch {
        return null;
      }
    })).then((profiles) => {
      if (!active) return;
      const loadedProfiles = profiles.filter((profile): profile is ProfileRecord => Boolean(profile));
      if (loadedProfiles.length === 0) return;
      setSharedProfiles((current) => ({
        ...current,
        ...Object.fromEntries(loadedProfiles.map((profile) => [profile.id, profile])),
      }));
    });

    return () => {
      active = false;
    };
  }, [messages]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const updateKeyboardInset = () => {
      const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
      const visibleHeight = visualViewport?.height ?? window.innerHeight;
      const offsetTop = visualViewport?.offsetTop ?? 0;
      const baseline = keyboardViewportBaseline.current;
      if (baseline.width !== window.innerWidth) {
        baseline.width = window.innerWidth;
        baseline.height = Math.max(layoutHeight, window.innerHeight);
      } else {
        baseline.height = Math.max(baseline.height, layoutHeight, window.innerHeight);
      }
      if (conversation?.kind === 'dm') {
        const mobileInput = window.matchMedia?.('(pointer: coarse)').matches
          || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
          || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const viewportShrunk = layoutHeight - visibleHeight >= KEYBOARD_INSET_THRESHOLD_PX
          || (mobileInput && baseline.height - Math.min(window.innerHeight, visibleHeight) >= KEYBOARD_INSET_THRESHOLD_PX);
        const open = Boolean(viewportShrunk && (composerFocused || dmKeyboardOpenRef.current));
        dmKeyboardOpenRef.current = open;
        setDmKeyboardOpen(open);
        // Safari pans the layout viewport while changing innerHeight. Fixed
        // positioning still uses clientHeight; detection is separate because
        // the required bottom inset can legitimately become zero mid-keyboard.
        setKeyboardInset(open ? Math.max(0, Math.round(layoutHeight - visibleHeight - offsetTop)) : 0);
        return;
      }
      const nextInset = Math.max(
        0,
        Math.round(window.innerHeight - visibleHeight - offsetTop),
      );
      setKeyboardInset(nextInset >= KEYBOARD_INSET_THRESHOLD_PX ? nextInset : 0);
    };

    updateKeyboardInset();
    visualViewport?.addEventListener('resize', updateKeyboardInset);
    visualViewport?.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('resize', updateKeyboardInset);

    return () => {
      visualViewport?.removeEventListener('resize', updateKeyboardInset);
      visualViewport?.removeEventListener('scroll', updateKeyboardInset);
      window.removeEventListener('resize', updateKeyboardInset);
    };
  }, [conversation?.kind, composerFocused]);

  useEffect(() => {
    if (conversation?.kind !== 'dm' || embedded) return;
    const update = (open: boolean) => {
      if (open) document.documentElement.dataset.cruushDmKeyboardOpen = 'true';
      else delete document.documentElement.dataset.cruushDmKeyboardOpen;
      window.dispatchEvent(new Event('cruush:dm-keyboard-changed'));
    };
    update(dmKeyboardOpen && !settingsOpen);
    return () => update(false);
  }, [conversation?.kind, embedded, settingsOpen, dmKeyboardOpen]);

  useEffect(() => {
    let active = true;

    const loadChatState = async () => {
      const generation = ++chatLoadGeneration.current;
      setLoading(true);
      setError(null);
      setComposerError(null);

      try {
        const resolvedUserId = await getCurrentUserId();

        if (!active || generation !== chatLoadGeneration.current) {
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

        if (!active || generation !== chatLoadGeneration.current) {
          return;
        }

        setConversation(data.conversation);
        setMessages(Array.isArray(data.messages) ? normalizeRemoteMessages(data.messages, resolvedUserId) : []);
        setMutualRequiredConversationId(data.conversation.kind === 'dm' && data.conversation.canMessage === false ? data.conversation.id : null);
        setError(null);
      } catch (error) {
        if (!active || generation !== chatLoadGeneration.current) {
          return;
        }

        console.error('Error loading chat:', error);
        setConversation(null);
        setMessages([]);
        setError(error instanceof Error ? error.message : 'Failed to load live chat.');
        setComposerError(null);
      } finally {
        if (active && generation === chatLoadGeneration.current) {
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
    if (conversation?.kind !== 'dm') return;
    let active = true;
    const unsubscribe = addCruushChangedListener(({ targetUserId, revoked }) => {
      if (targetUserId !== conversation.user.id) return;
      const generation = chatLoadGeneration.current;
      if (revoked) setMutualRequiredConversationId(conversation.id);
      void getConversationMessages(conversation.id).then((data) => {
        if (!active || generation !== chatLoadGeneration.current) return;
        setConversation(data.conversation);
        setMutualRequiredConversationId(data.conversation.canMessage === false ? data.conversation.id : null);
      }).catch(() => {
        // Keep sending disabled after revocation until permissions can be refreshed.
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversation?.id, conversation?.kind, conversation?.user.id]);

  useEffect(() => {
    if (conversation?.kind === 'group') {
      setGroupTitleDraft(conversation.user.name);
    }
  }, [conversation?.kind, conversation?.user.name]);

  useContentVisibilityRefresh(async (isCurrent) => {
    if (!chatId) return;
    const generation = ++chatLoadGeneration.current;
    try {
      const resolvedUserId = currentUserId ?? await getCurrentUserId();
      const data = await getConversationMessages(chatId);
      if (!isCurrent() || generation !== chatLoadGeneration.current) return;
      setLoading(false);
      setCurrentUserId(resolvedUserId);
      setConversation(data.conversation);
      const visibleMessages = Array.isArray(data.messages) ? normalizeRemoteMessages(data.messages, resolvedUserId) : [];
      setMessages(current => [
        ...visibleMessages,
        ...current.filter(item => item.author === 'self' && item.id.startsWith('local-')),
      ]);
      setMutualRequiredConversationId(data.conversation.kind === 'dm' && data.conversation.canMessage === false ? data.conversation.id : null);
    } catch (error) {
      if (!isCurrent() || generation !== chatLoadGeneration.current) return;
      if (!(error instanceof ApiClientError) || ![403, 404].includes(error.status)) throw error;
      setConversation(null);
      setMessages([]);
      setError(error.message);
    } finally {
      if (isCurrent() && generation === chatLoadGeneration.current) setLoading(false);
    }
  }, chatId);

  const canManageConversation = conversation?.kind !== 'group' || ['owner', 'admin'].includes(conversation.currentUserRole ?? '');
  const canReviewClubRequests = Boolean(conversation?.clubId)
    && ['owner', 'admin', 'moderator'].includes(conversation?.currentUserRole ?? '');
  const canModerateMessages = canManageConversation
    || (Boolean(conversation?.clubId) && conversation?.currentUserRole === 'moderator');
  const dmMessagingBlocked = conversation?.kind === 'dm' && (
    conversation.canMessage === false ||
    mutualRequiredConversationId === conversation.id
  );
  const composerDisabled = Boolean(conversation?.closed) || dmMessagingBlocked;
  const trust = useTrustRestrictions();
  const messageFeature = conversation?.kind === 'group' ? 'group_messages' : 'direct_messages';
  const messagePhotoFeature = conversation?.kind === 'group' ? 'group_message_photos' : 'direct_message_photos';
  const messageSendDisabled = composerDisabled || trust.restricted(messageFeature);

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

  const loadClubSettingsData = async (clubId: string) => {
    try {
      const item = await getClub(clubId);
      setClubSettings(item);
      setClubTitleDraft(item.title);
      setClubSummaryDraft(item.summary);
      setClubTagsDraft(item.tags);
      setClubRequiresJoinApprovalDraft(item.requiresJoinApproval !== false);
      setClubVisibility({ ...visibilityRulesToState(item.visibilityRules), outsideServiceAreaMembers: false });
      if (item.currentUserRole === 'owner' || item.currentUserRole === 'admin' || item.currentUserRole === 'moderator') {
        setClubApplicants(await getClubJoinRequests(clubId));
      } else {
        setClubApplicants([]);
      }
    } catch (loadError) {
      console.error('Error loading Club settings:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Coven settings.');
    }
  };

  const openSettings = () => {
    if (!conversation) return;
    const conversationPath = conversation.kind === 'group'
      ? `/chat/group/${conversation.id}`
      : `/chat/${conversation.id}`;
    navigate(`${conversationPath}/settings`);
  };

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    if (conversation?.kind === 'group') void loadGroupSettingsData(conversation.id);
    if (conversation?.clubId && canReviewClubRequests) void loadClubSettingsData(conversation.clubId);
  }, [settingsOpen, conversation?.id, conversation?.clubId, canReviewClubRequests]);

  const loadFavoriteImages = async () => {
    setFavoriteImagesLoading(true);

    try {
      const data = await getFavoriteMessageImages();
      setFavoriteImages(Array.isArray(data.images) ? data.images : []);
      setError(null);
    } catch (error) {
      console.error('Error loading favorite images:', error);
      setError(error instanceof Error ? error.message : 'Failed to load Quick access gallery.');
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

    if (!file || favoriteUploading || composerDisabled || trust.restricted('favorite_images')) {
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
        setPhotoUploadNotice('Photo submitted for review. It will appear in your Quick access gallery automatically.');
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
    if (!chatId || !conversation || messageSendDisabled || favoriteSendingId) {
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

  const handleNotificationLevelChange = async (notificationLevel: ConversationNotificationLevel) => {
    if (!conversation || conversation.kind !== 'group') return;
    setSettingsSaving(true);
    try {
      setConversation(await setConversationNotifications(conversation.id, { notificationLevel }));
      setError(null);
    } catch (notificationError) {
      setError(notificationError instanceof Error ? notificationError.message : 'Failed to update notifications.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleNotificationMuteChange = async (muteFor: ConversationMuteDuration) => {
    if (!conversation || conversation.kind !== 'group') return;
    setSettingsSaving(true);
    try {
      setConversation(await setConversationNotifications(conversation.id, { muteFor }));
      setError(null);
    } catch (notificationError) {
      setError(notificationError instanceof Error ? notificationError.message : 'Failed to update notifications.');
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

  const handleSaveClub = async () => {
    if (!conversation?.clubId || !canManageConversation || settingsSaving) return;
    if (!clubTitleDraft.trim() || clubTagsDraft.length === 0) return;

    setSettingsSaving(true);
    try {
      const updated = await updateClub(conversation.clubId, {
        title: clubTitleDraft.trim(),
        summary: clubSummaryDraft.trim(),
        tags: clubTagsDraft,
        requiresJoinApproval: clubRequiresJoinApprovalDraft,
      });
      setClubSettings(updated);
      setConversation((current) => current ? {
        ...current,
        user: { ...current.user, name: updated.title },
        tags: updated.tags,
      } : current);
      setError(null);
    } catch (saveError) {
      console.error('Error saving Club settings:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save Coven settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveClubVisibility = async () => {
    if (!conversation?.clubId || !canManageConversation || settingsSaving) return;
    setSettingsSaving(true);
    try {
      const visibilityRules = { ...visibilityStateToRules(clubVisibility), outside_service_area_members: false };
      await updateClubVisibility(conversation.clubId, visibilityRules);
      setClubSettings((current) => current ? { ...current, visibilityRules } : current);
      setClubVisibilityOpen(false);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save Coven visibility.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleClubRequest = async (applicant: ClubApplicant, decision: 'approve' | 'deny') => {
    if (!conversation?.clubId || !canReviewClubRequests || reviewingClubUserId) return;
    setReviewingClubUserId(applicant.userId);
    try {
      await reviewClubJoinRequest(conversation.clubId, applicant.userId, decision);
      setClubApplicants((current) => current.filter((item) => item.userId !== applicant.userId));
      if (decision === 'approve') await loadGroupSettingsData(conversation.id);
      setError(null);
    } catch (reviewError) {
      console.error('Error reviewing Club request:', reviewError);
      setError(reviewError instanceof Error ? reviewError.message : 'Failed to review Coven request.');
    } finally {
      setReviewingClubUserId(null);
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

  const handleGroupPulse = async () => {
    if (!conversation || conversation.kind !== 'group' || !canManageConversation || conversation.closed || !groupPulseAllowed) {
      return;
    }

    setGroupPulseSending(true);
    setGroupPulseNotice('');
    setError(null);

    try {
      const status = await sendGroupPulse(conversation.id);
      const remaining = status.allowance.remaining;
      setGroupPulseNotice(typeof remaining === 'number'
        ? `Group Pulse sent. ${remaining} of ${status.allowance.limit} Pulses remain.`
        : 'Group Pulse sent.');
    } catch (pulseError) {
      setError(pulseError instanceof Error ? pulseError.message : 'Group Pulse could not be sent.');
    } finally {
      setGroupPulseSending(false);
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

  const handleClubMemberRole = async (member: GroupMemberRecord, role: 'admin' | 'moderator' | 'member') => {
    if (!conversation?.clubId || !canManageConversation || member.role === 'owner') return;
    setSettingsSaving(true);
    try {
      await setClubMemberRole(conversation.id, member.id, role);
      await loadGroupSettingsData(conversation.id);
      setError(null);
    } catch (roleError) {
      console.error('Error updating Club role:', roleError);
      setError(roleError instanceof Error ? roleError.message : 'Failed to update Coven role.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!conversation || conversation.kind !== 'group' || !conversation.currentUserRole || conversation.currentUserRole === 'owner' || settingsSaving) return;
    if (!window.confirm(conversation.clubId ? 'Leave this Coven?' : 'Leave this group chat?')) return;
    const generation = chatLoadGeneration.current;
    const destination = conversation.clubId ? '/messages?tab=clubs' : '/messages';
    setSettingsSaving(true);
    setError(null);
    try {
      await leaveGroupConversation(conversation.id);
      if (chatLoadGeneration.current !== generation) return;
      onClose?.();
      navigate(destination, { replace: true });
    } catch (leaveError) {
      if (chatLoadGeneration.current === generation) setError(leaveError instanceof Error ? leaveError.message : 'Could not leave this chat.');
    } finally {
      if (chatLoadGeneration.current === generation) setSettingsSaving(false);
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

    const restriction = getNsfwPhotoRestriction(attachment.explicit, attachment.photoRelationship);
    if (restriction) {
      setError(getNsfwPhotoRestrictionLabel(restriction)!);
      return;
    }
    if (shouldMaskPhoto(dlModeActive, attachment.explicit, attachment.photoRelationship)) {
      setError('Turn off DL Mode to open this explicit view-once photo. It has not been consumed.');
      return;
    }

    if (viewingAttachmentIds[attachmentKey]) {
      return;
    }

    setViewingAttachmentIds((prev) => ({ ...prev, [attachmentKey]: true }));

    const requestScope = viewOnceRequestScopeRef.current;
    try {
      const objectUrl = await viewMessageAttachment(messageId, attachment.id);
      if (requestScope !== viewOnceRequestScopeRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setViewedAttachmentUrls((prev) => ({ ...prev, [attachmentKey]: objectUrl }));
      setActiveViewOnceKey(attachmentKey);
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
    if (!normalizedComposerMessage || !chatId || !conversation || messageSendDisabled || textMessageSendingRef.current) return;

    const composerDraft = message;
    textMessageSendingRef.current = true;
    setTextMessageSending(true);

    const optimisticId = `local-${Date.now()}`;
    const optimisticMessage: ChatMessageRecord = {
      id: optimisticId,
      userId: currentUserId ?? undefined,
      author: 'self',
      content: normalizedComposerMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setMessage('');
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
      setError(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      setMessage((currentMessage) => currentMessage ? currentMessage : composerDraft);
      if (error instanceof ApiClientError && error.code === 'FORBIDDEN') {
        setError(error.message || 'You cannot message this user.');
      } else {
        const textError = describeTextMessageError(error);
        setError(null);
        setComposerError(textError.message);
        setComposerErrorCode(textError.code);
      }
    } finally {
      textMessageSendingRef.current = false;
      setTextMessageSending(false);
    }
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file || !chatId || !conversation || photoUploading || composerDisabled || trust.restricted(messagePhotoFeature)) {
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

  const handleSharedProfileCruush = async (profile: ProfileRecord) => {
    const relationship = profile.viewer_relationship;

    try {
      if (relationship?.mutual_cruush) {
        await revokeMutualCruush(profile.id);
      } else if (relationship?.outgoing_cruush) {
        await revokeSentCruush(profile.id);
      } else {
        await sendCruush(profile.id, {
          name: profile.display_name,
          pronouns: [...profile.pronouns, profile.custom_pronouns].filter(Boolean).join(' / '),
          photo: profile.photos[0] ?? null,
        });
      }

      const refreshedProfile = await getProfileById(profile.id);
      setSharedProfiles((current) => ({ ...current, [refreshedProfile.id]: refreshedProfile }));
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update cruush.');
    }
  };

  const openDmProfile = () => {
    if (!conversation || conversation.kind !== 'dm') {
      return;
    }

    openUserProfile(conversation.user.id);
  };
  const groupMemberIds = new Set(groupMembers.map((member) => member.id));
  const availableAddOptions = mutualOptions.filter((item) => !groupMemberIds.has(item.user.id));
  const messagePhotoControlDisabled = photoUploading || composerDisabled || trust.restricted(messagePhotoFeature);
  const normalizedComposerMessage = normalizeMessageForSend(message);
  const canSendMessage = normalizedComposerMessage.length > 0;
  const favoriteUploadControlDisabled = favoriteUploading || composerDisabled || trust.restricted('favorite_images');
  // DM keyboard visibility requires measured viewport shrink, not focus alone.
  // Keep the existing Group/Coven focus behavior.
  const keyboardOpen = conversation?.kind === 'dm' ? dmKeyboardOpen : keyboardInset > 0 || composerFocused;
  const composerBarStyle = {
    // With the keyboard up the composer sits flush on it: no rem gap and no
    // safe-area either, since the keyboard already covers that zone. The gap
    // used to reveal a strip of the thread underneath the input.
    '--chat-composer-bottom': embedded ? '0px' : keyboardInset > 0
      ? `${keyboardInset}px`
      : keyboardOpen
        ? '0px'
        : conversation?.kind === 'dm'
          // Match the chat fade to the measured navigation, retaining its
          // existing top padding as the gap above the navigation pill.
          ? 'var(--cruush-nav-clearance, calc(6rem + env(safe-area-inset-bottom)))'
          : 'calc(5.5rem + env(safe-area-inset-bottom))',
  } as CSSProperties & { '--chat-composer-bottom': string };

  return (
    <div data-testid="private-group-chat-screen" className={`relative max-w-full overflow-x-clip bg-background ${embedded && conversation?.kind === 'dm' && !settingsOpen ? 'flex min-h-full flex-col' : `pb-20 ${embedded ? 'min-h-full' : 'min-h-screen'}`}`}>
      {settingsOpen ? (
        <AppPageHeader
          title={conversation?.clubId ? 'Coven settings' : conversation?.kind === 'group' ? 'Group settings' : 'Message settings'}
          onBack={() => navigate(location.pathname.replace(/\/settings$/, ''))}
          backLabel="Back to conversation"
          bugButtonTestId="conversation-settings-bug-button-slot"
        />
      ) : (
      <AppPageHeader
        title={conversation?.kind === 'dm' ? (
          <span className="inline-flex min-w-0 max-w-full items-baseline gap-2">
            <span className="min-w-0 truncate">{conversation.user.name}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm text-white/62">
              <Clock3 className="size-3 opacity-70" />
              {conversation.user.lastActive ?? 'Active recently'}
            </span>
          </span>
        ) : (conversation?.user.name ?? (loading ? 'Loading chat...' : 'Conversation unavailable'))}
        onBack={() => embeddedProp ? (onBack ?? onClose)?.() : navigate(-1)}
        backLabel={routeBackLabel}
        onClose={embedded ? onClose : undefined}
        closeLabel="Close messages"
        bugButtonTestId="chat-bug-button-slot"
        testId="chat-thread-header"
        className="z-40"
        leading={conversation?.clubId ? null : conversation ? (
              <HeartPhoto
                borderTone={resolveUserBorderTone({
                  mileHigh: conversation.user.travelling,
                  mutual: conversation.kind === 'group' || conversation.mutual,
                })}
                className="w-12 shrink-0"
                label={`${conversation.user.name} avatar`}
                restriction={getNsfwPhotoRestriction(conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })}
                masked={shouldMaskPhoto(dlModeActive, conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })}
                photo={conversation.user.photo}
                outOfSight={conversation.kind === 'dm' && conversation.user.outOfSight === true}
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
        subtitle={conversation && conversation.kind !== 'dm' && !conversation.clubId ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {conversation.kind === 'group' && !conversation.clubId ? (
                      <Badge variant="outline" className="border-border/80 bg-card/60 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Group
                      </Badge>
            ) : null}
            {conversation.membersLabel ? <span>{conversation.membersLabel}</span> : null}
          </div>
        ) : !conversation ? <p className="mt-1 text-xs text-muted-foreground">Messages</p> : null}
        actions={(
          <>
            {conversation?.clubId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Share Coven"
                onClick={() => setClubShareOpen(true)}
              >
                <Share2 className="h-5 w-5" />
              </Button>
            ) : null}
            {conversation && conversation.kind !== 'dm' ? (
              <ReportAction
                targetType="conversation"
                targetId={conversation.id}
                targetLabel={conversation.user.name}
                label="Report conversation"
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Conversation settings"
              aria-expanded={settingsOpen}
              aria-controls="conversation-settings"
              disabled={!conversation}
              onClick={openSettings}
            >
              <CruushIcon name="settings" className="h-5 w-5" />
            </Button>
          </>
        )}
      />
      )}

      <div
        ref={threadContentRef}
        data-testid="chat-thread-content"
        className={`mx-auto flex w-full max-w-2xl flex-col px-4 pt-4 ${embedded && conversation?.kind === 'dm' && !settingsOpen ? 'flex-1' : ''} ${settingsOpen ? 'pb-8' : 'pb-[calc(17rem+env(safe-area-inset-bottom))]'}`}
        style={conversation?.kind === 'dm' && !settingsOpen && dmComposerClearance !== null ? { paddingBottom: dmComposerClearance + (embedded ? 16 : 0) } : undefined}
      >
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

            {conversation.kind === 'group' ? (
              <div className="space-y-3 border-b border-border pb-4">
                <span className="block text-sm text-muted-foreground">Notifications</span>
                <Select
                  value={conversation.notificationLevel ?? 'all'}
                  disabled={settingsSaving}
                  onValueChange={(value) => void handleNotificationLevelChange(value as ConversationNotificationLevel)}
                >
                  <SelectTrigger aria-label="Group or Coven notification level" className="h-11 w-full rounded-2xl border-white/12 bg-card/82 px-4 text-sm text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" className="rounded-2xl border-white/12 bg-card/95 p-1 text-foreground">
                    <SelectItem value="all">All messages</SelectItem>
                    <SelectItem value="mentions">@me only</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={conversation.muted ? 'muted' : 'off'}
                  disabled={settingsSaving}
                  onValueChange={(value) => value !== 'muted' && void handleNotificationMuteChange(value as ConversationMuteDuration)}
                >
                  <SelectTrigger aria-label="Temporarily mute Group or Coven" className="h-11 w-full rounded-2xl border-white/12 bg-card/82 px-4 text-sm text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" className="rounded-2xl border-white/12 bg-card/95 p-1 text-foreground">
                    {conversation.muted ? (
                      <SelectItem value="muted">
                        Muted{conversation.mutedUntil ? ` until ${new Date(conversation.mutedUntil).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                      </SelectItem>
                    ) : null}
                    {notificationMuteOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

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
              disabled={!canManageConversation || settingsSaving}
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
                {conversation.clubId && canManageConversation ? (
                  <div className="space-y-4 border-b border-border pb-4">
                    <h4 className="text-sm text-muted-foreground">Coven settings</h4>
                    <label className="block space-y-2">
                      <span className="text-sm text-muted-foreground">Coven name</span>
                      <Input
                        aria-label="Coven settings name"
                        maxLength={120}
                        value={clubTitleDraft}
                        onChange={(event) => setClubTitleDraft(event.target.value)}
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm text-muted-foreground">Short description</span>
                      <Textarea
                        aria-label="Coven settings short description"
                        maxLength={1000}
                        value={clubSummaryDraft}
                        onChange={(event) => setClubSummaryDraft(event.target.value)}
                      />
                    </label>
                    <div className="block space-y-2">
                      <span className="text-sm text-muted-foreground">Tags</span>
                      <TagInput ariaLabel="Coven settings tags" maxTags={10} onChange={setClubTagsDraft} tags={clubTagsDraft} />
                    </div>
                    <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                      <Switch
                        aria-label="Require approval to join"
                        checked={clubRequiresJoinApprovalDraft}
                        disabled={!clubSettings || settingsSaving}
                        onCheckedChange={setClubRequiresJoinApprovalDraft}
                      />
                      <span>Require approval to join</span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!clubSettings || !clubTitleDraft.trim() || clubTagsDraft.length === 0 || settingsSaving}
                      onClick={() => void handleSaveClub()}
                    >
                      Save Coven
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!clubSettings || settingsSaving}
                      onClick={() => setClubVisibilityOpen(true)}
                    >
                      Visibility Controls
                    </Button>

                    <div className="space-y-2">
                      <h4 className="text-sm text-muted-foreground">Join requests</h4>
                      {clubApplicants.length === 0 ? (
                        <p className="rounded-2xl border border-border bg-background/60 p-3 text-sm text-muted-foreground">No pending requests.</p>
                      ) : clubApplicants.map((applicant) => (
                        <div key={applicant.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3">
                          <p className="min-w-0 truncate">{applicant.name}</p>
                          <div className="flex shrink-0 gap-2">
                            <Button disabled={reviewingClubUserId === applicant.userId} onClick={() => void handleClubRequest(applicant, 'approve')} size="sm" style={{ background: 'var(--cruush-gradient)' }} type="button">Approve</Button>
                            <Button disabled={reviewingClubUserId === applicant.userId} onClick={() => void handleClubRequest(applicant, 'deny')} size="sm" type="button" variant="outline">Deny</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {conversation.clubId && conversation.currentUserRole === 'moderator' ? (
                  <div className="space-y-2 border-b border-border pb-4">
                    <h4 className="text-sm text-muted-foreground">Join requests</h4>
                    {clubApplicants.length === 0 ? (
                      <p className="rounded-2xl border border-border bg-background/60 p-3 text-sm text-muted-foreground">No pending requests.</p>
                    ) : clubApplicants.map((applicant) => (
                      <div key={applicant.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3">
                        <p className="min-w-0 truncate">{applicant.name}</p>
                        <div className="flex shrink-0 gap-2">
                          <Button disabled={reviewingClubUserId === applicant.userId} onClick={() => void handleClubRequest(applicant, 'approve')} size="sm" style={{ background: 'var(--cruush-gradient)' }} type="button">Approve</Button>
                          <Button disabled={reviewingClubUserId === applicant.userId} onClick={() => void handleClubRequest(applicant, 'deny')} size="sm" type="button" variant="outline">Deny</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {canManageConversation ? (
                  <>
                    {!conversation.clubId ? <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
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
                    </div> : null}

                    {!conversation.clubId ? <div className="space-y-2">
                      {availableAddOptions.map((item) => (
                        <CruushesProfileCard
                          key={item.user.id}
                          user={{ ...item.user, vibes: item.user.vibes ?? item.vibes }}
                          mutual
                          sharesCrowd={(item.mutualCrowds?.length ?? 0) > 0}
                          onSelect={() => setAddMemberId(item.user.id)}
                          selected={addMemberId === item.user.id}
                          selectLabel={`Add ${item.user.name} to group`}
                        />
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!addMemberId || settingsSaving}
                        onClick={() => void handleAddGroupMember()}
                      >
                        Add
                      </Button>
                    </div> : null}

                    <div className="rounded-2xl border border-[#c8ff31]/35 bg-black/45 p-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-center border-[#c8ff31]/60 text-white hover:border-[#c8ff31] hover:bg-[#c8ff31]/10 hover:text-white"
                        disabled={groupPulseSending || conversation.closed || !groupPulseAllowed}
                        onClick={() => void handleGroupPulse()}
                      >
                        <PulseLedIcon className="size-5 text-[#c8ff31]" />
                        {groupPulseSending ? 'Sending Pulse...' : 'Pulse group'}
                      </Button>
                      <p className="mt-2 text-xs leading-snug text-muted-foreground">
                        Uses one of your Pulses. Members receive it only when Pulse alerts are on and repeat limits allow it.
                      </p>
                      {groupPulseNotice ? (
                        <p aria-live="polite" className="mt-2 text-xs text-[#c8ff31]">{groupPulseNotice}</p>
                      ) : null}
                    </div>
                  </>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Members</p>
                  {groupMembersLoading ? (
                    <LoadingCardSkeletons count={2} label="Loading members" />
                  ) : null}
                  {groupMembers.map((member) => (
                    <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3">
                      <div className="min-w-0">
                        <p className="truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                      {canManageConversation && member.role !== 'owner' ? (
                        <div className="flex flex-wrap gap-2">
                          {conversation.clubId ? (
                            <>
                              {member.role !== 'moderator' ? <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleClubMemberRole(member, 'moderator')}>Make moderator</Button> : null}
                              {member.role !== 'admin' ? <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleClubMemberRole(member, 'admin')}>Make admin</Button> : null}
                              {member.role !== 'member' ? <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleClubMemberRole(member, 'member')}>Remove role</Button> : null}
                            </>
                          ) : member.role === 'admin' ? (
                            <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleGroupMemberAction(member, 'demote')}>Demote</Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleGroupMemberAction(member, 'promote')}>Promote</Button>
                          )}
                          <Button type="button" size="sm" variant="outline" disabled={settingsSaving} onClick={() => void handleGroupMemberAction(member, 'remove')}>
                            Remove
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {conversation.currentUserRole && conversation.currentUserRole !== 'owner' ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center"
                    disabled={settingsSaving}
                    onClick={() => void handleLeaveGroup()}
                  >
                    {conversation.clubId ? 'Leave Coven' : 'Leave Group Chat'}
                  </Button>
                ) : null}

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

        <div className={settingsOpen ? 'hidden' : 'contents'}>

        {conversation ? (
          <>
            {!conversation.clubId ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {conversation.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="rounded-3xl border border-border bg-card/70 p-3 text-sm text-muted-foreground">
              Keep specifics here until you both want to move.
            </div>
          </>
        ) : null}

        <div className={`mt-4 flex-1 space-y-4 ${embedded && conversation?.kind === 'dm' ? 'flex flex-col justify-end' : ''}`}>
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
                <CruushIcon name="messages" className="mx-auto mb-4 size-12 opacity-55" />
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
            const inAppShare = parseInAppShareMessage(msg.content);
            const sharedProfile = inAppShare?.kind === 'profile' ? sharedProfiles[inAppShare.id] : null;
            const sharedProfileMessage = inAppShare?.kind === 'profile';

            if (isSystem) {
              return (
                <div key={msg.id} ref={msg.id === messages[messages.length - 1]?.id ? latestMessageRef : undefined} className="flex justify-center">
                  <div className="max-w-[80%] rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-center text-xs text-primary">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                ref={msg.id === messages[messages.length - 1]?.id ? latestMessageRef : undefined}
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
                      staticMileHigh={conversation?.kind === 'dm' && conversation.user.travelling === true}
                      className="w-9"
                      label={`${messageSender.name} avatar`}
                      restriction={getNsfwPhotoRestriction(messageSender.photoExplicit, messageSender.photoRelationship)}
                      masked={shouldMaskPhoto(dlModeActive, messageSender.photoExplicit, messageSender.photoRelationship)}
                      photo={messageSender.photo}
                      outOfSight={messageSender.outOfSight === true}
                      theme={conversation?.kind === 'dm' && conversation.mutual ? 'mutual' : 'nearby'}
                      userId={messageSender.id}
                      fallback={<div className="text-[10px] text-white/75">{getConversationInitials(messageSender.name)}</div>}
                    />
                  </button>
                ) : null}

                <div className={`${sharedProfileMessage ? 'min-w-0 flex-1' : 'max-w-[78%]'} ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  {msg.attachments?.map((attachment) => {
                    const attachmentKey = `${msg.id}:${attachment.id}`;
                    const openedViewOnceUrl = viewedAttachmentUrls[attachmentKey];
                    if (attachment.viewOnce) {
                      if (isOwn && !openedViewOnceUrl) {
                        return shouldMaskPhoto(dlModeActive, attachment.explicit, attachment.photoRelationship) ? (
                          <ExplicitMessagePhotoShield key={attachment.id} attachmentKey={attachmentKey} restriction={getNsfwPhotoRestriction(attachment.explicit, attachment.photoRelationship)} />
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

                      const restriction = getNsfwPhotoRestriction(attachment.explicit, attachment.photoRelationship);
                      if (restriction) {
                        return <ExplicitMessagePhotoShield key={attachment.id} attachmentKey={attachmentKey} restriction={restriction} />;
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
                        {shouldMaskPhoto(dlModeActive, attachment.explicit, attachment.photoRelationship) ? (
                          <ExplicitMessagePhotoShield attachmentKey={attachmentKey} restriction={getNsfwPhotoRestriction(attachment.explicit, attachment.photoRelationship)} />
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
                  {sharedProfile ? (
                    <CruushesProfileCard
                      mutual={sharedProfile.viewer_relationship?.mutual_cruush === true}
                      heartFallback={conversation?.kind === 'dm'
                        ? <img alt="" aria-hidden="true" className="h-7 w-7 object-contain opacity-80" src={profileEditIconWhite} />
                        : undefined}
                      onOpenProfile={() => navigate(`/profile/${sharedProfile.id}`)}
                      onSelect={() => navigate(`/profile/${sharedProfile.id}`)}
                      selectLabel={`Open ${sharedProfile.display_name} profile`}
                      testId={`shared-profile-card-${sharedProfile.id}`}
                      user={sharedProfileCardUser(sharedProfile)}
                      metadata={(
                        <button
                          type="button"
                          className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62"
                          onClick={() => navigate(`/profile/${sharedProfile.id}`)}
                        >
                          <span className="truncate">{sharedProfile.last_active ?? 'Active recently'}</span>
                          <span className="truncate">{sharedProfile.distance_label ?? 'Nearby'}</span>
                        </button>
                      )}
                      actions={sharedProfile.id === currentUserId ? undefined : (
                        <ProfileActionTrio
                          className={sharedProfileActionClassName}
                          size="sm"
                          userName={sharedProfile.display_name}
                          cruushState={sharedProfile.viewer_relationship?.mutual_cruush
                            ? 'mutual'
                            : sharedProfile.viewer_relationship?.outgoing_cruush
                              ? 'sent'
                              : 'available'}
                          cruushTone={sharedProfile.viewer_relationship?.mutual_cruush || sharedProfile.viewer_relationship?.outgoing_cruush ? 'dark' : undefined}
                          onCruush={() => void handleSharedProfileCruush(sharedProfile)}
                          canMessage={sharedProfile.viewer_relationship?.can_message === true}
                          onMessage={() => void openConversationOrInbox(navigate, sharedProfile.id)}
                          canCenterPin={sharedProfile.viewer_relationship?.can_reveal_precise_location === true
                            && sharedProfile.location?.display_mode === 'PRECISE'
                            && (sharedProfile.location.display_expires_at_ms == null || sharedProfile.location.display_expires_at_ms > Date.now())}
                          onCenterPin={() => navigate(`/map?focusUserId=${encodeURIComponent(sharedProfile.id)}`)}
                        />
                      )}
                      wrapVibes
                    />
                  ) : inAppShare ? (
                    <button
                      aria-label={inAppShare.kind === 'club' ? `Open ${inAppShare.label} Coven` : undefined}
                      className="min-w-48 rounded-[22px] border border-white/14 bg-black/38 px-4 py-3 text-left text-white transition hover:border-white/30"
                      onClick={() => navigate(inAppShare.kind === 'place'
                        ? `/places/${inAppShare.id}`
                        : inAppShare.kind === 'club'
                          ? `/clubs/${inAppShare.id}`
                          : `/profile/${inAppShare.id}`)}
                      type="button"
                    >
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-white/50">
                        {inAppShare.kind === 'place' ? 'Spot' : inAppShare.kind === 'club' ? 'Coven' : 'Profile'}
                      </span>
                      <span className="mt-1 block text-sm">{inAppShare.label}</span>
                    </button>
                  ) : msg.content ? (
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
                      {isOwn && msg.readAt ? ' · Read' : ''}
                    </span>
                    {(isOwn || (conversation?.kind === 'group' && canModerateMessages)) ? (
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
                    {!isOwn && conversation?.kind !== 'dm' ? (
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

        {conversation?.kind === 'dm' && !embedded ? (
          <div
            aria-hidden="true"
            data-testid="chat-composer-underlay"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[49] bg-background"
            style={{ height: composerBarStyle['--chat-composer-bottom'] }}
          />
        ) : null}

        {conversation ? (
          <div
            ref={composerBarRef}
            data-testid="chat-composer-bar"
            className={`fixed bottom-[var(--chat-composer-bottom)] left-0 right-0 ${conversation.kind === 'dm' ? 'z-50' : 'z-[70]'} max-w-[100vw] overflow-x-hidden border-t border-border bg-background px-3 pt-3 backdrop-blur-md sm:px-4 ${keyboardOpen ? 'pb-3' : 'pb-0'}`}
            data-keyboard-open={(conversation.kind === 'dm' ? dmKeyboardOpen : keyboardInset > 0) ? 'true' : undefined}
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

              <TrustRestrictionNotice message={trust.message(messageFeature, 'Messaging') || trust.message(messagePhotoFeature, 'Photo messaging')} />

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
                    style={!canManageConversation || composerDisabled ? { background: 'var(--cruush-gradient)', opacity: 0.5 } : undefined}
                    size="sm"
                    className="h-9 w-auto min-w-28 rounded-full border-white/12 bg-card/82 px-3 text-xs text-foreground shadow-[0_10px_24px_rgba(0,0,0,0.24)] hover:border-primary/30 hover:bg-card disabled:opacity-60"
                  >
                    <Timer className="size-3.5 text-primary" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    side="top"
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
                    messagePhotoControlDisabled ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <Checkbox
                    aria-label="Send photo view once"
                    checked={photoViewOnce}
                    disabled={messagePhotoControlDisabled}
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
                    tabIndex={messagePhotoControlDisabled ? -1 : 0}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!messagePhotoControlDisabled) setPhotoViewOnce((current) => !current);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!messagePhotoControlDisabled) setPhotoViewOnce((current) => !current);
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
                  style={composerDisabled ? { background: 'var(--cruush-gradient)', opacity: 0.5 } : undefined}
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
                          style={composerDisabled || trust.restricted('favorite_images') ? { background: 'var(--cruush-gradient)', opacity: 0.5 } : undefined}
                          onClick={() => openFileInput(favoriteFileInputRef, favoriteUploadControlDisabled)}
                        >
                          {favoriteUploading ? <PhotoUploadSpinner className="size-4" /> : <ImagePlus className="size-4" />}
                          Upload
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Close Quick access gallery"
                          onClick={() => setFavoriteGalleryOpen(false)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {favoriteImagesLoading ? (
                      <LoadingCardSkeletons count={2} label="Loading Quick access gallery" />
                    ) : null}

                    {!favoriteImagesLoading && favoriteImages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
                        No photos in your Quick access gallery yet.
                      </div>
                    ) : null}

                    {favoriteImages.length > 0 ? (
                      <div className="scrollbar-hide grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
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
                                    <DlModePhotoPlaceholder className="w-14" />
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
                                  style={messageSendDisabled ? { background: 'var(--cruush-gradient)', opacity: 0.5 } : undefined}
                                  disabled={messageSendDisabled || favoriteBusy}
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
                      if (event.key === 'Enter' && !event.shiftKey && !messageSendDisabled && !textMessageSending) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    onFocus={focusComposer}
                    onBlur={() => setComposerFocused(false)}
                    disabled={messageSendDisabled}
                    placeholder={dmMessagingBlocked ? 'cruushes only' : conversation.closed ? 'Group closed' : conversation.kind === 'group' ? 'Drop the plan...' : 'Say what you want...'}
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
                      style={composerDisabled || trust.restricted(messagePhotoFeature) ? { background: 'var(--cruush-gradient)', opacity: 0.5 } : undefined}
                      onClick={() => openFileInput(fileInputRef, messagePhotoControlDisabled)}
                    >
                      {photoUploading ? <PhotoUploadSpinner className="size-4" /> : <ImageIcon className="size-4" />}
                    </Button>
                    <Button
                      onClick={() => void handleSend()}
                      disabled={!canSendMessage || messageSendDisabled || textMessageSending}
                      size="icon"
                      className="rounded-full"
                      aria-label="Send message"
                      style={{
                        background: 'var(--cruush-gradient)',
                        opacity: !canSendMessage || messageSendDisabled ? 0.5 : undefined,
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
      {activeViewOnceUrl && viewOncePhotoAllowed ? (
        <ViewOncePhotoViewer url={activeViewOnceUrl} onClose={closeViewOncePhoto} />
      ) : null}
      {conversation?.clubId ? (
        <InAppShareDialog
          onOpenChange={setClubShareOpen}
          open={clubShareOpen}
          share={{ kind: 'club', id: conversation.clubId, label: conversation.user.name }}
        />
      ) : null}
      <MapVisibilitySurface
        description="Choose who can discover this Coven."
        searchPlaceholder="Hide this Coven from matching names, bios, or #tags"
        showOutsideServiceAreaControl={false}
        open={clubVisibilityOpen}
        onOpenChange={setClubVisibilityOpen}
        value={clubVisibility}
        hasCruushPlus
        onChange={setClubVisibility}
        onClear={() => setClubVisibility(DEFAULT_VISIBILITY_STATE)}
        onApply={() => void handleSaveClubVisibility()}
      />
    </div>
  );
}
