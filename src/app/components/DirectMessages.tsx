import { getNsfwPhotoRestriction } from '../lib/dlMode';
import { useTrustRestrictions } from '../lib/trustRestrictions';
import TrustRestrictionNotice from './TrustRestrictionNotice';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { DROPDOWN_TRIGGER_CLASS } from '../lib/controlStyles';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Clock3, MapPin, Pin, Plus, Search, Settings2, Trash2, X, ArrowLeft } from 'lucide-react';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import seekingIcon from '../assets/ui-icons/seeking-magnifying-glass-8149381.svg';
import HeartPhoto from './HeartPhoto';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import {
  createGroupConversation,
  deleteConversationForEveryone,
  getConversations,
  type ConversationThread,
  type ConversationTimer,
} from '../lib/messagesApi';
import { getMutualCruushMap, getMyCruushActivity, revokeMutualCruush, revokeSentCruush, sendCruush, type MutualCruushActivityItem } from '../lib/cruushApi';
import { getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';
import { getMyBillingStatus } from '../lib/billingApi';
import { getMyProfile } from '../lib/profileApi';
import { openConversationOrInbox } from '../lib/openConversation';
import ProfileActionTrio from './ProfileActionTrio';
import UserActivityCapsule from './UserActivityCapsule';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import CruushMatchSettings from './CruushMatchSettings';
import AppPageHeader from './AppPageHeader';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';
import { formatDistanceLabel, useDistancePreferences } from '../lib/distancePreferences';
import { resolveUserBorderTone } from '../lib/userBorderTone';
import {
  handleCruushSendSuccess,
  handleMutualCruushRevokeSuccess,
  handleSentCruushRevokeSuccess,
  notifyCruushSendError,
  notifyMutualCruushRevokeError,
  notifySentCruushRevokeError,
} from '../lib/cruushNotifications';

const messageCardActionClassName = '!gap-1 [&>button]:!size-9 [&>button]:!p-1.5 [&>button>img]:!size-5 [&>button>svg]:!size-5';

const timerOptions: Array<{ value: ConversationTimer; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '5m', label: '5 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '8h', label: '8 hours' },
  { value: '24h', label: '24 hours' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
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
      photoExplicit: raw?.user?.photoExplicit,
      sideBadges: raw?.user?.sideBadges,
      // Rebuilt field by field, so anything not named here is dropped: the
      // server was sending vibes and this discarded them before the card saw.
      vibes: Array.isArray(raw?.user?.vibes) ? raw.user.vibes : undefined,
      travelling: raw?.user?.travelling === true,
      lastActive: typeof raw?.user?.lastActive === 'string' ? raw.user.lastActive : undefined,
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
    disappearingTimer: ['off', '5m', '1h', '8h', '24h', '3d', '7d', '30d', '90d'].includes(raw?.disappearingTimer) ? raw.disappearingTimer : undefined,
    closed: typeof raw?.closed === 'boolean' ? raw.closed : undefined,
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
  };
}

function canDeleteConversation(conversation: ConversationThread) {
  return conversation.kind !== 'group' || ['owner', 'admin'].includes(conversation.currentUserRole ?? '');
}

const mutualBadgeClassName = 'rounded-md border border-[#8B5CF6]/45 bg-[#8B5CF6]/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#DCC7FF]';
const quietBadgeClassName = 'rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/52';
function getConversationHeartTheme(conversation: ConversationThread) {
  if (conversation.kind === 'group' || conversation.mutual) {
    return 'mutual';
  }

  return 'nearby';
}

type DirectSortMode = 'distance' | 'lastOnline';

const DIRECT_MESSAGE_DISCOVERY_LIMIT = 500;

function parseDistanceMiles(distance: string) {
  const match = distance.match(/[\d.]+/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLastActiveRank(lastActive: string) {
  const normalized = lastActive.toLowerCase();
  if (normalized === 'now' || normalized.includes('just')) {
    return 0;
  }

  const amount = Number(normalized.match(/\d+/)?.[0] ?? 9999);
  if (normalized.includes('m')) return amount;
  if (normalized.includes('h')) return amount * 60;
  if (normalized.includes('d')) return amount * 24 * 60;
  return 9999;
}

function seekingSortScore(user: DiscoveryUser) {
  return (
    (user.lookingFor?.length ?? 0) * 3 +
    (user.vibes?.length ?? 0) * 2 +
    (user.hasSharedCrowd ? 6 : 0)
  );
}

function displayCoordinateMiles(user: DiscoveryUser, viewer: { lat: number; lng: number } | null) {
  // Only the display coordinates the app already shows for this person, so an
  // approximate sharer never becomes more precise than their own setting.
  if (!viewer || typeof user.lat !== 'number' || typeof user.lng !== 'number') {
    return null;
  }

  const earthRadiusMiles = 3958.7613;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(user.lat - viewer.lat);
  const deltaLng = toRadians(user.lng - viewer.lng);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(viewer.lat)) * Math.cos(toRadians(user.lat)) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function comparePrivacySafeDistance(a: DiscoveryUser, b: DiscoveryUser, viewer: { lat: number; lng: number } | null = null) {
  const aLabelled = parseDistanceMiles(a.distance);
  const bLabelled = parseDistanceMiles(b.distance);
  // Approximate labels read the same for everyone. When neither row carries a
  // numeric label, rank them by the coordinates already on screen instead.
  const aDistance = aLabelled ?? displayCoordinateMiles(a, viewer);
  const bDistance = bLabelled ?? displayCoordinateMiles(b, viewer);

  if (aDistance === null && bDistance === null) return 0;
  if (aDistance === null) return 1;
  if (bDistance === null) return -1;
  return aDistance - bDistance;
}

function compareRecentActivity(a: DiscoveryUser, b: DiscoveryUser, viewer: { lat: number; lng: number } | null = null) {
  return parseLastActiveRank(a.lastActive) - parseLastActiveRank(b.lastActive)
    || seekingSortScore(b) - seekingSortScore(a)
    || comparePrivacySafeDistance(a, b, viewer)
    || a.name.localeCompare(b.name);
}

function compareDistance(a: DiscoveryUser, b: DiscoveryUser, viewer: { lat: number; lng: number } | null = null) {
  return comparePrivacySafeDistance(a, b, viewer)
    || compareRecentActivity(a, b, viewer);
}

function describeDiscoveryUser(user: DiscoveryUser) {
  return [user.age ? String(user.age) : '', ...(user.presentation ?? []), ...(user.identities ?? [])]
    .filter(Boolean)
    .slice(0, 5)
    .join(' · ');
}

function matchesMessageFilterBasics(user: DiscoveryUser, filters: FilterState) {
  const distanceMiles = parseDistanceMiles(user.distance);
  if (distanceMiles !== null && distanceMiles > filters.distance) {
    return false;
  }

  if (user.age !== null && (user.age < filters.ageRange[0] || user.age > filters.ageRange[1])) {
    return false;
  }

  if (filters.lookingFor.length > 0) {
    const lookingFor = user.lookingFor.map((value) => value.toLowerCase());
    if (!filters.lookingFor.some((value) => lookingFor.includes(value.toLowerCase()))) {
      return false;
    }
  }

  if (filters.vibes.length > 0) {
    const vibes = [...user.vibes, ...(user.scenes ?? []), ...(user.archetypes ?? [])]
      .map((value) => value.toLowerCase());
    if (!filters.vibes.some((value) => vibes.includes(value.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

export default function DirectMessages({
  embedded = false,
  onClose,
  onOpenConversation,
}: {
  embedded?: boolean;
  onClose?: () => void;
  onOpenConversation?: (conversationId: string) => void;
} = {}) {
  const navigate = useNavigate();
  const trust = useTrustRestrictions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [validPinUserIds, setValidPinUserIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'groups'>('all');
  const [error, setError] = useState<string | null>(null);
  const [composeChooserOpen, setComposeChooserOpen] = useState(false);
  const [messageSettingsOpen, setMessageSettingsOpen] = useState(false);
  const [directComposerOpen, setDirectComposerOpen] = useState(false);
  const [groupComposerOpen, setGroupComposerOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupTimer, setGroupTimer] = useState<ConversationTimer>('24h');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupSortMode, setGroupSortMode] = useState<DirectSortMode>('lastOnline');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [mutualOptions, setMutualOptions] = useState<MutualCruushActivityItem[]>([]);
  const [directOptions, setDirectOptions] = useState<DiscoveryUser[]>([]);
  const [requestedCruushIds, setRequestedCruushIds] = useState<string[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [directHasCruushPlus, setDirectHasCruushPlus] = useState(false);
  const [viewerCoordinates, setViewerCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [groupCreating, setGroupCreating] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [changingCruushUserId, setChangingCruushUserId] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const dlModeActive = useDlMode();
  const distancePreferences = useDistancePreferences();

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

      try {
        const [activity, mutualMapItems] = await Promise.all([
          getMyCruushActivity(),
          getMutualCruushMap().catch(() => []),
        ]);
        const distanceByUserId = new Map((activity?.mutual ?? []).map((item) => [
          item.user.id,
          item.distance,
        ]));
        setConversations(normalized.map((conversation) => conversation.kind === 'dm'
          ? {
              ...conversation,
              distance: distanceByUserId.get(conversation.user.id) ?? conversation.distance,
            }
          : conversation));
        setRequestedCruushIds((activity?.sent ?? [])
          .filter((item) => item.user && !item.mutual)
          .map((item) => item.user!.id));
        setValidPinUserIds(new Set(mutualMapItems
          .filter((item) => item.canRevealPreciseLocation === true
            && item.coordinates?.precision === 'precise'
            && (item.displayExpiresAtMs == null || item.displayExpiresAtMs > Date.now()))
          .map((item) => item.user.id)));
      } catch {
        setValidPinUserIds(new Set());
      }
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
  const groupMutuals = useMemo(() => {
    const groupQuery = groupSearchQuery.trim().toLowerCase();
    const filtered = mutualOptions.filter((item) => {
      if (!groupQuery) return true;
      return [
        item.user.name,
        item.user.pronouns,
        ...item.vibes,
        ...item.mutualCrowds,
      ].some((value) => value.toLowerCase().includes(groupQuery));
    });

    return [...filtered].sort((a, b) => {
      if (groupSortMode === 'distance') {
        const aDistance = parseDistanceMiles(a.distance);
        const bDistance = parseDistanceMiles(b.distance);
        if (aDistance !== null || bDistance !== null) {
          if (aDistance === null) return 1;
          if (bDistance === null) return -1;
          if (aDistance !== bDistance) return aDistance - bDistance;
        }
      }

      return parseLastActiveRank(a.lastActive) - parseLastActiveRank(b.lastActive)
        || a.user.name.localeCompare(b.user.name);
    });
  }, [groupSearchQuery, groupSortMode, mutualOptions]);

  const loadMessageableMutuals = async ({
    setComposerError,
    setComposerLoading,
  }: {
    setComposerError: (error: string | null) => void;
    setComposerLoading: (loading: boolean) => void;
  }) => {
    setComposerError(null);
    setComposerLoading(true);

    try {
      const activity = await getMyCruushActivity();
      setMutualOptions((activity.mutual ?? []).filter((item) => item.canMessage !== false));
    } catch (error) {
      console.error('Error loading mutuals:', error);
      setMutualOptions([]);
      setComposerError(error instanceof Error ? error.message : 'Failed to load cruushes.');
    } finally {
      setComposerLoading(false);
    }
  };

  const openGroupComposer = async () => {
    setComposeChooserOpen(false);
    setDirectComposerOpen(false);
    setGroupComposerOpen(true);
    await loadMessageableMutuals({
      setComposerError: setGroupError,
      setComposerLoading: setGroupLoading,
    });
  };

  const loadDirectMessageOptions = async (filters: FilterState = DEFAULT_FILTER_STATE) => {
    setDirectError(null);
    setDirectLoading(true);

    try {
      const [profile, activity, billing] = await Promise.all([
        getMyProfile().catch(() => null),
        getMyCruushActivity().catch(() => ({ mutual: [] })),
        getMyBillingStatus().catch(() => null),
      ]);
      const savedLocation = profile?.location;
      const coordinates = savedLocation
        ? {
            lat: savedLocation.fuzzy_lat ?? savedLocation.lat,
            lng: savedLocation.fuzzy_lng ?? savedLocation.lng,
          }
        : null;
      setViewerCoordinates(
        typeof coordinates?.lat === 'number' && typeof coordinates?.lng === 'number'
          ? { lat: coordinates.lat, lng: coordinates.lng }
          : null,
      );
      const messageableMutuals = (activity.mutual ?? []).filter((item) => item.canMessage !== false);
      setMutualOptions(messageableMutuals);
      setDirectHasCruushPlus(billing?.cruushPlus === true);

      try {
        // Message seeking filters rank the inclusive authorized set locally.
        // They must never remove every otherwise-messageable profile at the API boundary.
        const nearbyUsers = await getNearbyUsers(
          typeof coordinates?.lat === 'number' && typeof coordinates?.lng === 'number' ? coordinates : null,
          filters,
          { limit: DIRECT_MESSAGE_DISCOVERY_LIMIT },
        );
        setDirectOptions(nearbyUsers);
      } catch (error) {
        console.error('Error loading public people available for direct messaging:', error);
        setDirectOptions([]);
        if (messageableMutuals.length === 0) {
          setDirectError(error instanceof Error ? error.message : 'Failed to load people to message.');
        }
      }
    } catch (error) {
      console.error('Error loading people available for direct messaging:', error);
      setDirectOptions([]);
      setDirectError(error instanceof Error ? error.message : 'Failed to load people to message.');
    } finally {
      setDirectLoading(false);
    }
  };

  const openDirectComposer = async () => {
    setComposeChooserOpen(false);
    setGroupComposerOpen(false);
    setDirectComposerOpen(true);
    await loadDirectMessageOptions();
  };

  useEffect(() => {
    if (searchParams.get('compose') !== 'group') {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('compose');
    setSearchParams(nextParams, { replace: true });
    void openGroupComposer();
  }, [searchParams, setSearchParams]);

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
    setGroupSearchQuery('');
    setGroupSortMode('lastOnline');
    setSelectedMemberIds([]);
    setGroupError(null);
  };

  const resetDirectComposer = () => {
    setDirectComposerOpen(false);
    setDirectError(null);
  };

  const openConversation = (conversationId: string) => {
    if (embedded && onOpenConversation) {
      onOpenConversation(conversationId);
      return;
    }

    navigate(`/chat/${conversationId}`);
  };

  const returnToMessageOptions = () => {
    setDirectComposerOpen(false);
    setDirectError(null);
    setComposeChooserOpen(true);
  };

  const handleStartDirectChat = (userId: string) => {
    resetDirectComposer();
    void openConversationOrInbox(navigate, userId, embedded ? onOpenConversation : undefined);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMemberIds.length === 0 || groupCreating || trust.restricted('group_creation')) {
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
      openConversation(created.id);
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

  const handleConversationCruush = async (conversation: ConversationThread) => {
    if (conversation.kind !== 'dm' || changingCruushUserId) return;

    const userId = conversation.user.id;
    const sent = requestedCruushIds.includes(userId);
    setChangingCruushUserId(userId);

    try {
      if (conversation.mutual) {
        await revokeMutualCruush(userId);
        setConversations((current) => current.map((item) => item.user.id === userId ? { ...item, mutual: false } : item));
        setMutualOptions((current) => current.filter((item) => item.user.id !== userId));
        setRequestedCruushIds((current) => current.filter((id) => id !== userId));
        setValidPinUserIds((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
        handleMutualCruushRevokeSuccess(userId, conversation.user.name);
      } else if (sent) {
        await revokeSentCruush(userId);
        setRequestedCruushIds((current) => current.filter((id) => id !== userId));
        handleSentCruushRevokeSuccess(userId, conversation.user.name);
      } else {
        const result = await sendCruush(userId, conversation.user);
        if (result.mutual) {
          setConversations((current) => current.map((item) => item.user.id === userId ? { ...item, mutual: true } : item));
        } else {
          setRequestedCruushIds((current) => current.includes(userId) ? current : [...current, userId]);
        }
        handleCruushSendSuccess(userId, conversation.user.name, result);
      }
    } catch (error) {
      if (conversation.mutual) notifyMutualCruushRevokeError(error);
      else if (sent) notifySentCruushRevokeError(error);
      else notifyCruushSendError(error);
    } finally {
      setChangingCruushUserId(null);
    }
  };

  if (embedded && messageSettingsOpen) {
    return (
      <div className="relative min-h-full bg-[#050505] pb-6 text-white" data-testid="embedded-message-settings">
        <AppPageHeader
          title="Message settings"
          onBack={() => setMessageSettingsOpen(false)}
          backLabel="Back to Messages"
          onClose={onClose}
          closeLabel="Close Message settings"
          bugButtonTestId="embedded-message-settings-bug-button-slot"
        />
        <CruushMatchSettings embedded />
      </div>
    );
  }

  return (
    <div className={embedded ? 'relative min-h-full bg-[#050505] pb-6 text-white' : 'relative min-h-screen bg-[#050505] pb-[calc(7rem+env(safe-area-inset-bottom))] text-white'}>
      <header data-testid="direct-messages-header" className="sticky top-0 z-20 border-b border-white/10 bg-black/88 pb-4 pt-4 shadow-[0_20px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
        <div data-testid="direct-messages-header-content" className="mx-auto max-w-2xl space-y-4 px-4">
          <div data-testid="direct-messages-header-row" className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
              aria-label="Back"
              title="Back"
              onClick={() => embedded && onClose ? onClose() : navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl leading-none text-white sm:text-3xl">Messages</h1>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                disabled={trust.restricted('direct_messages') && trust.restricted('group_creation')}
                aria-label="New message"
                title="New message"
                onClick={() => setComposeChooserOpen(true)}
                className="h-11 w-11 rounded-full text-white disabled:grayscale"
                style={{ background: 'var(--cruush-gradient)' }}
              >
                <Plus className="size-4" />
              </Button>
              {embedded ? (
                <Button
                  type="button"
                  size="icon"
                  aria-label="Message settings"
                  title="Message settings"
                  className="h-11 w-11 rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
                  onClick={() => setMessageSettingsOpen(true)}
                >
                  <CruushIcon name="settings" className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  aria-label="Message settings"
                  title="Message settings"
                  className="h-11 w-11 rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
                  onClick={() => navigate('/cruush/settings')}
                >
                  <CruushIcon name="settings" className="h-5 w-5" />
                </Button>
              )}
              {/* Docked here on every layout; Close stays last. */}
              <div className="h-11 w-11 shrink-0" data-testid="direct-messages-bug-button-slot" ref={registerBugButtonSlot} />
              {embedded && onClose ? (
                <Button type="button" size="icon" variant="secondary" className="h-11 w-11 rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10" aria-label="Close Messages" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              ) : null}

            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center">
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-white/46">Unread</p>
              <p className="truncate text-sm tabular-nums text-white">{unreadCount}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center">
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-white/46">Active</p>
              <p className="truncate text-sm tabular-nums text-white">{activeNowCount}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center">
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-white/46">Threads</p>
              <p className="truncate text-sm tabular-nums text-white">{conversations.length}</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/46" />
            <Input
              placeholder="Search people, threads, vibes"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 rounded-lg border-white/10 bg-background/25 pl-10 text-white placeholder:text-white/46"
            />
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'unread' | 'groups')}>
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-lg border border-white/10 bg-background/25 p-1 shadow-[0_20px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <TabsTrigger value="all" className="h-10 rounded-md text-sm text-white/72">All</TabsTrigger>
              <TabsTrigger value="unread" className="h-10 rounded-md text-sm text-white/72">Unread</TabsTrigger>
              <TabsTrigger value="groups" className="h-10 rounded-md text-sm text-white/72">Groups</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {composeChooserOpen ? (
        <ComposeChoiceOverlay
          embedded={embedded}
          onClose={() => setComposeChooserOpen(false)}
          onStartDirect={() => void openDirectComposer()}
          onStartGroup={() => void openGroupComposer()}
        />
      ) : null}

      {directComposerOpen ? (
        <DirectUserOverlay
          embedded={embedded}
          error={directError}
          loading={directLoading}
          users={directOptions}
          mutuals={mutualOptions}
          viewerCoordinates={viewerCoordinates}
          hasCruushPlus={directHasCruushPlus}
          requestedCruushIds={requestedCruushIds}
          onAskMutual={(user) => {
            setRequestedCruushIds((current) => current.includes(user.id) ? current : [...current, user.id]);
          }}
          onRemoveSentCruush={(userId) => setRequestedCruushIds((current) => current.filter((id) => id !== userId))}
          onRemoveMutual={(userId) => {
            setMutualOptions((current) => current.filter((item) => item.user.id !== userId));
            setConversations((current) => current.map((item) => item.user.id === userId ? { ...item, mutual: false } : item));
            setValidPinUserIds((current) => {
              const next = new Set(current);
              next.delete(userId);
              return next;
            });
          }}
          onClose={resetDirectComposer}
          onBack={returnToMessageOptions}
          onApplyFilters={loadDirectMessageOptions}
          onUpgrade={() => navigate('/rewards')}
          onMessage={handleStartDirectChat}
          onOpenMap={(userId, mutual) => navigate(
            mutual
              ? `/map?mode=mutuals&focusUserId=${encodeURIComponent(userId)}`
              : `/map?focusUserId=${encodeURIComponent(userId)}`,
          )}
          onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
        />
      ) : null}

      {groupComposerOpen ? (
        <div
          className="scrollbar-hide fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background/95 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-md"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Back from new group" onClick={resetGroupComposer}>
                <ChevronLeft className="size-4" />
              </Button>
              <h3 className="min-w-0 flex-1 truncate text-xl">New group</h3>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Close group composer" onClick={resetGroupComposer}>
                <X className="size-4" />
              </Button>
              <div className="h-9 w-9 shrink-0" data-testid="direct-messages-group-bug-button-slot" ref={registerBugButtonSlot} />
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
                className={DROPDOWN_TRIGGER_CLASS}
              >
                {timerOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Cruushes</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search cruushes"
                  className="pl-9"
                  value={groupSearchQuery}
                  onChange={(event) => setGroupSearchQuery(event.target.value)}
                  placeholder="Search cruushes"
                />
              </div>
              <div
                className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-background/55 p-1"
                role="group"
                aria-label="Sort cruushes"
              >
                {([
                  ['lastOnline', 'Recently online', Clock3],
                  ['distance', 'Distance', MapPin],
                ] as const).map(([value, label, Icon]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={groupSortMode === value ? 'default' : 'ghost'}
                    aria-label={`Sort cruushes by ${label}`}
                    aria-pressed={groupSortMode === value}
                    className="min-h-11 min-w-0 rounded-xl px-2 text-xs"
                    onClick={() => setGroupSortMode(value)}
                  >
                    <Icon className="mr-1.5 size-3.5" />
                    {label}
                  </Button>
                ))}
              </div>
              {groupLoading ? (
                <LoadingCardSkeletons count={3} label="Loading cruushes" />
              ) : null}
              {!groupLoading && mutualOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  No cruushes available.
                </div>
              ) : null}
              {!groupLoading && mutualOptions.length > 0 && groupMutuals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  No cruushes match your search.
                </div>
              ) : null}
              <div className="space-y-2">
                {groupMutuals.map((item) => {
                  const selected = selectedMemberIds.includes(item.user.id);
                  return (
                  <UserActivityCapsule
                    key={item.user.id}
                    testId={`group-mutual-${item.user.id}`}
                    heart={(
                      <HeartPhoto
                        borderTone={resolveUserBorderTone({ mileHigh: item.user.travelling, mutual: true })}
                        className="w-20 shrink-0"
                        label={`${item.user.name} avatar`}
                        restriction={getNsfwPhotoRestriction(item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: true, sharesCrowd: (item.mutualCrowds?.length ?? 0) > 0 })}
                        masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: true, sharesCrowd: (item.mutualCrowds?.length ?? 0) > 0 })}
                        photo={item.user.photo}
                        userId={item.user.id}
                        theme="mutual"
                        fallback={<div className="text-base text-white/80">{getConversationInitials(item.user.name)}</div>}
                      />
                    )}
                    name={item.user.name}
                    pronouns={item.user.pronouns || 'Ask me'}
                    sideBadges={item.user.sideBadges}
                    sideBadgeTone={resolveUserBorderTone({ mileHigh: item.user.travelling, mutual: true })}
                    metadata={(
                      <span className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62">
                        <span className="truncate">{item.lastActive}</span>
                        <span className="truncate">{formatDistanceLabel(item.distance, distancePreferences.mode) ?? item.distance}</span>
                      </span>
                    )}
                    mutual
                    onSelect={() => toggleSelectedMember(item.user.id)}
                    selected={selected}
                    selectLabel={`${selected ? 'Remove' : 'Add'} ${item.user.name} ${selected ? 'from' : 'to'} group`}
                  />
                )})}
              </div>
            </div>

            <TrustRestrictionNotice message={trust.message('group_creation', 'Group creation')} />

            <Button
              type="button"
              className="w-full"
              disabled={!groupName.trim() || selectedMemberIds.length === 0 || groupCreating || trust.restricted('group_creation')}
              onClick={() => void handleCreateGroup()}
            >
              Create group
            </Button>
          </div>
        </div>
      ) : null}

      <div className="relative mx-auto max-w-2xl px-4 pb-8 pt-4">
        <TrustRestrictionNotice message={trust.message('direct_messages', 'Messaging')} />
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
                  onClick={() => openConversation(conversation.id)}
                  className="min-w-[150px] rounded-lg border border-white/10 bg-black/72 p-3 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <HeartPhoto
                      borderTone={resolveUserBorderTone({
                        mileHigh: conversation.user.travelling,
                        mutual: conversation.kind === 'group' || conversation.mutual,
                      })}
                      className="w-[var(--cruush-profile-heart-size)] shrink-0"
                      label={`${conversation.user.name} avatar`}
                      restriction={getNsfwPhotoRestriction(conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })}
                      masked={shouldMaskPhoto(dlModeActive, conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })}
                      photo={conversation.user.photo}
                      userId={conversation.user.id}
                      theme={getConversationHeartTheme(conversation)}
                      onClick={conversation.kind === 'dm' ? () => navigate(`/profile/${conversation.user.id}`) : undefined}
                      fallback={<div className="text-sm text-white/80">{getConversationInitials(conversation.user.name)}</div>}
                    />
                    {conversation.unreadCount > 0 ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 truncate">{conversation.user.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {conversation.kind === 'dm' ? conversation.user.lastActive ?? 'Active recently' : conversation.membersLabel}
                  </p>
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

            const openIdentity = conversation.kind === 'dm'
              ? () => navigate(`/profile/${conversation.user.id}`)
              : () => openConversation(conversation.id);
            const identityAdornment = (
              <>
                {conversation.kind === 'group' ? <Badge variant="outline" className={quietBadgeClassName}>Group</Badge> : null}
                {conversation.currentUserRole && conversation.currentUserRole !== 'member' ? <Badge variant="outline" className={quietBadgeClassName}>{conversation.currentUserRole}</Badge> : null}
                {conversation.muted ? <Badge variant="outline" className={quietBadgeClassName}>Quiet</Badge> : null}
                {conversation.unreadCount > 0 ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">{conversation.unreadCount}</span> : null}
              </>
            );

            return (
              <UserActivityCapsule
                key={conversation.id}
                testId="conversation-preview-row"
                heart={(
                  <HeartPhoto
                    borderTone={resolveUserBorderTone({
                      mileHigh: conversation.user.travelling,
                      mutual: conversation.kind === 'group' || conversation.mutual,
                    })}
                    className="w-20 shrink-0"
                    label={`${conversation.user.name} avatar`}
                    restriction={getNsfwPhotoRestriction(conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })}
                    masked={shouldMaskPhoto(dlModeActive, conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })}
                    photo={conversation.user.photo}
                    userId={conversation.user.id}
                    theme={getConversationHeartTheme(conversation)}
                    onClick={openIdentity}
                    fallback={conversation.kind === 'group'
                      ? <CruushIcon name="profile" className="size-7 opacity-80" />
                      : <div className="text-lg text-white/80">{getConversationInitials(conversation.user.name)}</div>}
                  />
                )}
                name={conversation.user.name}
                pronouns={conversation.user.pronouns || conversation.membersLabel}
                vibes={conversation.user.vibes}
                vibeTone={conversation.mutual ? 'mutual' : 'nearby'}
                sideBadges={conversation.user.sideBadges}
                sideBadgeTone={resolveUserBorderTone({
                  mileHigh: conversation.user.travelling,
                  mutual: conversation.kind === 'group' || conversation.mutual,
                })}
                identityAdornment={identityAdornment}
                onOpenIdentity={openIdentity}
                metadata={(
                  <button type="button" className="flex h-11 min-w-0 flex-col justify-center gap-0.5 text-left text-xs leading-snug text-white/62 sm:text-sm" onClick={() => openConversation(conversation.id)}>
                    <span className="truncate">{formatRelativeTime(conversation.updatedAt)}</span>
                    <span className="truncate">
                      {conversation.kind === 'dm' ? conversation.user.lastActive ?? 'Active recently' : conversation.membersLabel}
                    </span>
                  </button>
                )}
                actions={conversation.kind === 'dm' ? (
                  <ProfileActionTrio
                    className={messageCardActionClassName}
                    size="sm"
                    userName={conversation.user.name}
                    cruushState={changingCruushUserId === conversation.user.id
                      ? 'sending'
                      : conversation.mutual
                        ? 'mutual'
                        : requestedCruushIds.includes(conversation.user.id)
                          ? 'sent'
                          : 'available'}
                    cruushTone={conversation.mutual || requestedCruushIds.includes(conversation.user.id) ? 'dark' : undefined}
                    onCruush={() => void handleConversationCruush(conversation)}
                    canMessage
                    onMessage={() => openConversation(conversation.id)}
                    canCenterPin={validPinUserIds.has(conversation.user.id)}
                    onCenterPin={() => navigate(`/map?mode=mutuals&focusUserId=${encodeURIComponent(conversation.user.id)}`)}
                  />
                ) : undefined}
                cornerBadge={canDeleteConversation(conversation) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={deleteLabel}
                    title={deleteLabel}
                    disabled={deletingConversationId === conversation.id}
                    onClick={() => void handleDeleteConversation(conversation)}
                    className="size-8 text-white/55 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
                mutual={conversation.kind === 'group' || conversation.mutual === true}
                content={(
                  <div className="space-y-2">
                    {conversation.lastMessage ? (
                      <button
                        type="button"
                        className={`line-clamp-1 min-w-0 break-words text-left text-base ${conversation.unreadCount > 0 ? 'text-white' : 'text-white/62'}`}
                        onClick={() => openConversation(conversation.id)}
                      >
                        {conversation.lastMessage}
                      </button>
                    ) : null}
                    {(conversation.disappearingTimer && conversation.disappearingTimer !== 'off') || conversation.closed ? (
                      <div className="flex flex-wrap gap-2">
                        {conversation.disappearingTimer && conversation.disappearingTimer !== 'off' ? <Badge variant="outline" className={quietBadgeClassName}>{conversation.disappearingTimer}</Badge> : null}
                        {conversation.closed ? <Badge variant="outline" className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-destructive">Closed</Badge> : null}
                      </div>
                    ) : null}
                  </div>
                )}
                cornerAction={canDeleteConversation(conversation) ? undefined : <ChevronRight className="m-2 size-4 text-white/40" />}
              />
            );
          })}

          {!loading && error ? (
            <Card className="gap-0 border-destructive/30 bg-destructive/10 p-8 text-center" data-testid="messages-error-card">
              <CruushIcon name="messages" className="mx-auto mb-4 size-14 opacity-55" />
              <p className="text-destructive">{error}</p>
              <Button className="mt-4" variant="outline" onClick={() => void fetchConversations()}>
                Try again
              </Button>
            </Card>
          ) : null}

          {!loading && !error && filteredConversations.length === 0 ? (
            <Card className="gap-0 border-white/10 bg-card/70 p-12 text-center shadow-[0_12px_32px_rgba(0,0,0,0.24)]" data-testid="messages-empty-card">
              <CruushIcon name="messages" className="mx-auto mb-4 size-14 opacity-55" />
              {conversations.length === 0 ? (
                <>
                  <p className="text-muted-foreground">No messages yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">Mutual conversations will appear here.</p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">No threads match that search.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Try a name, a vibe, or jump back into All.
                  </p>
                </>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ComposeChoiceOverlay({
  embedded,
  onClose,
  onStartDirect,
  onStartGroup,
}: {
  embedded: boolean;
  onClose: () => void;
  onStartDirect: () => void;
  onStartGroup: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-background/95 px-4 py-6 backdrop-blur-md">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className={`flex items-center justify-between gap-3 ${embedded ? '' : 'pr-14'}`}>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">new message</p>
            <h3 className="text-2xl">Start a conversation</h3>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close message options" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-2xl border border-border bg-card/80 p-4 text-left transition-colors hover:bg-accent/60"
            onClick={onStartDirect}
          >
            <span className="block">Start chat with someone</span>
            <span className="mt-1 block text-sm text-muted-foreground">Pick someone nearby and open a direct chat.</span>
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border border-border bg-card/80 p-4 text-left transition-colors hover:bg-accent/60"
            onClick={onStartGroup}
          >
            <span className="block">Create group message</span>
            <span className="mt-1 block text-sm text-muted-foreground">Choose cruushes for a group thread.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DirectUserOverlay({
  embedded,
  error,
  loading,
  users,
  mutuals,
  viewerCoordinates,
  hasCruushPlus,
  requestedCruushIds,
  onAskMutual,
  onRemoveSentCruush,
  onRemoveMutual,
  onClose,
  onBack,
  onApplyFilters,
  onUpgrade,
  onMessage,
  onOpenMap,
  onOpenProfile,
}: {
  embedded: boolean;
  error: string | null;
  loading: boolean;
  users: DiscoveryUser[];
  mutuals: MutualCruushActivityItem[];
  viewerCoordinates: { lat: number; lng: number } | null;
  hasCruushPlus: boolean;
  requestedCruushIds: string[];
  onAskMutual: (user: DiscoveryUser) => void;
  onRemoveSentCruush: (userId: string) => void;
  onRemoveMutual: (userId: string) => void;
  onClose: () => void;
  onBack: () => void;
  onApplyFilters: (filters: FilterState) => Promise<void>;
  onUpgrade: () => void;
  onMessage: (userId: string) => void;
  onOpenMap: (userId: string, mutual: boolean) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const dlModeActive = useDlMode();
  // The compose page lists everyone you may message. Mutuals has its own
  // surface, so there is nothing here to switch between.
  const activeComposerTab = 'public' as const;
  const distancePreferences = useDistancePreferences();
  const [sortMode, setSortMode] = useState<DirectSortMode>('lastOnline');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const mutualUserIds = useMemo(() => new Set(mutuals.map((item) => item.user.id)), [mutuals]);
  const publicUsers = useMemo(
    () => users.filter((user) => user.relationship?.mutualCruush !== true && !mutualUserIds.has(user.id)),
    [mutualUserIds, users],
  );
  const filteredPublicUsers = useMemo(() => {
    return publicUsers.filter((user) => matchesMessageFilterBasics(user, filters));
  }, [publicUsers, filters]);
  const broadenedPublicUsers = filteredPublicUsers.length > 0 ? filteredPublicUsers : publicUsers;
  const sortedPublicUsers = useMemo(() => {
    return [...broadenedPublicUsers].sort((a, b) => (sortMode === 'distance'
      ? compareDistance(a, b, viewerCoordinates)
      : compareRecentActivity(a, b, viewerCoordinates)));
  }, [broadenedPublicUsers, sortMode, viewerCoordinates]);

  const togglePublicCruush = async (user: DiscoveryUser) => {
    if (requestingUserId) return;

    setRequestingUserId(user.id);
    setRequestError(null);

    try {
      if (requestedCruushIds.includes(user.id)) {
        await revokeSentCruush(user.id);
        onRemoveSentCruush(user.id);
        handleSentCruushRevokeSuccess(user.id, user.name);
      } else {
        const result = await sendCruush(user.id, {
          name: user.name,
          pronouns: user.pronouns,
          photo: user.photo,
        });
        onAskMutual(user);
        handleCruushSendSuccess(user.id, user.name, result);
      }
    } catch (error) {
      if (requestedCruushIds.includes(user.id)) notifySentCruushRevokeError(error);
      else notifyCruushSendError(error);
      setRequestError(error instanceof Error ? error.message : 'Failed to update cruush.');
    } finally {
      setRequestingUserId(null);
    }
  };

  const removeMutual = async (item: MutualCruushActivityItem) => {
    if (requestingUserId) return;
    setRequestingUserId(item.user.id);
    setRequestError(null);
    try {
      await revokeMutualCruush(item.user.id);
      onRemoveMutual(item.user.id);
      handleMutualCruushRevokeSuccess(item.user.id, item.user.name);
    } catch (error) {
      notifyMutualCruushRevokeError(error);
      setRequestError(error instanceof Error ? error.message : 'Failed to remove mutual.');
    } finally {
      setRequestingUserId(null);
    }
  };

  return (
    <div
      className="scrollbar-hide fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background/95 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-md"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="mx-auto min-h-full max-w-2xl space-y-5 pb-8">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Back to message options" onClick={onBack}>
            <ChevronLeft className="size-4" />
          </Button>
          <h3 className="min-w-0 flex-1 truncate text-xl">Choose someone to message</h3>
          <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Close mutual picker" onClick={onClose}>
            <X className="size-4" />
          </Button>
          <div className="h-9 w-9 shrink-0" data-testid="message-picker-bug-button-slot" ref={registerBugButtonSlot} />
        </div>

        {activeComposerTab === 'public' ? (
          <div className="rounded-2xl border border-white/10 bg-card/58 p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Seeking filters"
              className="h-9 rounded-full border-white/12 bg-background/70 px-3 text-xs text-foreground"
              onClick={() => setFiltersOpen(true)}
            >
              <CruushIconImage src={seekingIcon} className="mr-1.5 size-3.5 brightness-0 invert" />
              Seeking filters
            </Button>

            <section className="mt-3 border-t border-white/10 pt-3" aria-labelledby="message-picker-sort-title">
              <div className="px-1">
                <p id="message-picker-sort-title" className="text-xs font-medium uppercase tracking-[0.14em] text-white/70">Sort people by</p>
              </div>
              <div
                className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-background/55 p-1"
                role="group"
                aria-labelledby="message-picker-sort-title"
              >
                {([
                  ['lastOnline', 'Recently online', Clock3],
                  ['distance', 'Distance', MapPin],
                ] as const).map(([value, label, Icon]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={sortMode === value ? 'default' : 'ghost'}
                    aria-label={`Sort by ${label}`}
                    aria-pressed={sortMode === value}
                    className="min-h-12 min-w-0 flex-col gap-0.5 rounded-xl px-2 py-1.5 text-xs"
                    onClick={() => setSortMode(value)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon className="size-3.5" />
                      {label}
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {requestError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {requestError}
          </div>
        ) : null}

        {loading ? (
          <LoadingCardSkeletons count={3} label="Loading people" />
        ) : null}

        {!loading && activeComposerTab === 'mutuals' && mutuals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
            No cruushes are available right now.
          </div>
        ) : null}

        <div className="space-y-2">
          {activeComposerTab === 'public' && sortedPublicUsers.length > 0 ? sortedPublicUsers.map((user) => {
            const requested = requestedCruushIds.includes(user.id);
            const canMessageNow = user.relationship?.canMessage === true;
            return (
              <UserActivityCapsule
                key={user.id}
                className="border-border bg-card/70 hover:bg-accent/60"
                testId={`message-discovery-${user.id}`}
                heart={(
                  <HeartPhoto
                    borderTone={resolveUserBorderTone({
                      activePing: Boolean(user.activePing),
                      current: user.isCurrentUser,
                      mileHigh: user.travelling,
                      mutual: user.relationship?.mutualCruush,
                    })}
                    className="w-20"
                    label={`${user.name} avatar`}
                    restriction={getNsfwPhotoRestriction(user.photoExplicit, { ...user.photoRelationship, isMutualCruush: user.relationship?.mutualCruush, sharesCrowd: user.photoRelationship?.sharesCrowd ?? (user.hasSharedCrowd === true || user.relationshipContext === 'MUTUAL_CROWD') })}
                    masked={shouldMaskPhoto(dlModeActive, user.photoExplicit, { ...user.photoRelationship, isMutualCruush: user.relationship?.mutualCruush, sharesCrowd: user.photoRelationship?.sharesCrowd ?? (user.hasSharedCrowd === true || user.relationshipContext === 'MUTUAL_CROWD') })}
                    photo={user.photo}
                    userId={user.id}
                    onClick={() => onOpenProfile(user.id)}
                    fallback={<div className="text-base text-white/80">{getConversationInitials(user.name)}</div>}
                  />
                )}
                name={user.name}
                pronouns={user.pronouns || 'Ask me'}
                sideBadges={user.sideBadges}
                sideBadgeTone={resolveUserBorderTone({
                  activePing: Boolean(user.activePing),
                  current: user.isCurrentUser,
                  mileHigh: user.travelling,
                  mutual: user.relationship?.mutualCruush,
                })}
                onOpenIdentity={() => onOpenProfile(user.id)}
                metadata={(
                  <button type="button" className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62" onClick={() => onOpenProfile(user.id)}>
                    {describeDiscoveryUser(user) ? <span className="truncate">{describeDiscoveryUser(user)}</span> : null}
                    <span className="truncate">{formatDistanceLabel(user.distance, distancePreferences.mode)}</span>
                  </button>
                )}
                actions={<ProfileActionTrio
                  className={messageCardActionClassName}
                  size="sm"
                  userName={user.name}
                  cruushState={requestingUserId === user.id ? 'sending' : requested ? 'sent' : 'available'}
                  onCruush={() => { void togglePublicCruush(user); }}
                  canMessage={canMessageNow}
                  onMessage={() => onMessage(user.id)}
                  canCenterPin={false}
                  onCenterPin={() => onOpenMap(user.id, false)}
                />}
                mutual={user.relationship?.mutualCruush === true}
              />
            );
          }) : mutuals.map((item) => {
            const canCenterPin = item.canRevealPreciseLocation === true
              && item.coordinates?.precision === 'precise'
              && (item.displayExpiresAtMs == null || item.displayExpiresAtMs > Date.now());
            return (
              <UserActivityCapsule
                key={item.user.id}
                className="border-[#8B5CF6]/35 bg-card/70 hover:bg-accent/60"
                testId={`message-mutual-discovery-${item.user.id}`}
                heart={(
                  <HeartPhoto
                    borderTone={resolveUserBorderTone({ mileHigh: item.user.travelling, mutual: true })}
                    className="w-20"
                    label={`${item.user.name} avatar`}
                    restriction={getNsfwPhotoRestriction(item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: true, sharesCrowd: (item.mutualCrowds?.length ?? 0) > 0 })}
                    masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: true, sharesCrowd: (item.mutualCrowds?.length ?? 0) > 0 })}
                    photo={item.user.photo}
                    theme="mutual"
                    userId={item.user.id}
                    onClick={() => onOpenProfile(item.user.id)}
                    fallback={<div className="text-base text-white/80">{getConversationInitials(item.user.name)}</div>}
                  />
                )}
                name={item.user.name}
                pronouns={item.user.pronouns || 'Ask me'}
                sideBadges={item.user.sideBadges}
                sideBadgeTone={resolveUserBorderTone({ mileHigh: item.user.travelling, mutual: true })}
                onOpenIdentity={() => onOpenProfile(item.user.id)}
                metadata={(
                  <button type="button" className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62" onClick={() => onOpenProfile(item.user.id)}>
                    <span className="truncate">{item.lastActive}</span>
                    <span className="truncate">{formatDistanceLabel(item.distance, distancePreferences.mode)}</span>
                  </button>
                )}
                actions={<ProfileActionTrio
                  className={messageCardActionClassName}
                  size="sm"
                  userName={item.user.name}
                  cruushState={requestingUserId === item.user.id ? 'sending' : 'mutual'}
                  cruushTone="dark"
                  onCruush={() => void removeMutual(item)}
                  canMessage={item.canMessage !== false}
                  onMessage={() => onMessage(item.user.id)}
                  canCenterPin={canCenterPin}
                  onCenterPin={() => onOpenMap(item.user.id, true)}
                />}
                mutual
              />
            );
          })}
        </div>

        <MapFiltersSurface
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Seeking Filter"
          description=""
          value={filters}
          onChange={setFilters}
          hasCruushPlus={hasCruushPlus}
          onUpgrade={onUpgrade}
          onClear={() => {
            setFilters(DEFAULT_FILTER_STATE);
            void onApplyFilters(DEFAULT_FILTER_STATE);
          }}
          onApply={() => {
            setFiltersOpen(false);
            void onApplyFilters(filters);
          }}
        />
      </div>
    </div>
  );
}
