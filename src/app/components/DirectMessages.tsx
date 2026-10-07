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
import { Textarea } from './ui/textarea';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
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
import { getMyProfile, type ProfileRecord } from '../lib/profileApi';
import { decryptDisplayLocationToken } from '../lib/displayLocationTokens';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';
import { visibilityRulesToState, visibilityStateToRules } from '../lib/visibilityControls';
import { openConversationOrInbox } from '../lib/openConversation';
import ProfileActionTrio from './ProfileActionTrio';
import CruushesProfileCard from './CruushesProfileCard';
import UserActivityCapsule from './UserActivityCapsule';
import ClubDirectoryPanel from './ClubDirectoryPanel';
import TagInput from './TagInput';
import { createClub } from '../lib/clubsApi';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import CruushMatchSettings from './CruushMatchSettings';
import AppPageHeader from './AppPageHeader';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';
import { formatDistanceLabel, useDistancePreferences } from '../lib/distancePreferences';
import { resolveUserBorderTone } from '../lib/userBorderTone';
import { buildCruushPlusStorePath } from '../lib/cruushPlusConversion';
import { trackCruushPlusConversion } from '../lib/posthog';
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
    notificationLevel: raw?.notificationLevel === 'mentions' ? 'mentions' : 'all',
    mutedUntil: typeof raw?.mutedUntil === 'string' ? raw.mutedUntil : null,
    mutual: typeof raw?.mutual === 'boolean' ? raw.mutual : false,
    membersLabel: raw?.membersLabel ?? undefined,
    currentUserRole: ['owner', 'admin', 'moderator', 'member'].includes(raw?.currentUserRole) ? raw.currentUserRole : undefined,
    disappearingTimer: ['off', '5m', '1h', '8h', '24h', '3d', '7d', '30d', '90d'].includes(raw?.disappearingTimer) ? raw.disappearingTimer : undefined,
    closed: typeof raw?.closed === 'boolean' ? raw.closed : undefined,
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    clubId: typeof raw?.clubId === 'string' ? raw.clubId : undefined,
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
type ViewerCoordinates = { lat: number; lng: number };
type DistanceSortable = {
  distance: string;
  lat?: number | null;
  lng?: number | null;
};

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

function displayCoordinateMiles(user: DistanceSortable, viewer: ViewerCoordinates | null) {
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

function comparePrivacySafeDistance(a: DistanceSortable, b: DistanceSortable, viewer: ViewerCoordinates | null = null) {
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

function compareRecentActivity(a: DiscoveryUser, b: DiscoveryUser, viewer: ViewerCoordinates | null = null) {
  return parseLastActiveRank(a.lastActive) - parseLastActiveRank(b.lastActive)
    || seekingSortScore(b) - seekingSortScore(a)
    || comparePrivacySafeDistance(a, b, viewer)
    || a.name.localeCompare(b.name);
}

function compareDistance(a: DiscoveryUser, b: DiscoveryUser, viewer: ViewerCoordinates | null = null) {
  return comparePrivacySafeDistance(a, b, viewer)
    || compareRecentActivity(a, b, viewer);
}

async function resolveViewerCoordinates(profile: ProfileRecord | null): Promise<ViewerCoordinates | null> {
  const location = profile?.location;
  const lat = location?.fuzzy_lat ?? location?.lat;
  const lng = location?.fuzzy_lng ?? location?.lng;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return { lat, lng };
  }

  if (!location?.display_location_token) {
    return null;
  }

  try {
    const displayPayload = await decryptDisplayLocationToken(location.display_location_token);
    return Number.isFinite(displayPayload.latitude) && Number.isFinite(displayPayload.longitude)
      ? { lat: displayPayload.latitude, lng: displayPayload.longitude }
      : null;
  } catch {
    return null;
  }
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
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'groups' | 'clubs'>(() => (
    searchParams.get('tab') === 'clubs' ? 'clubs' : 'all'
  ));
  const [error, setError] = useState<string | null>(null);
  const [composeChooserOpen, setComposeChooserOpen] = useState(false);
  const [messageSettingsOpen, setMessageSettingsOpen] = useState(false);
  const [directComposerOpen, setDirectComposerOpen] = useState(false);
  const [groupComposerOpen, setGroupComposerOpen] = useState(false);
  const [clubComposerOpen, setClubComposerOpen] = useState(false);
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
  const [viewerCoordinates, setViewerCoordinates] = useState<ViewerCoordinates | null>(null);
  const [groupCreating, setGroupCreating] = useState(false);
  const [clubName, setClubName] = useState('');
  const [clubSummary, setClubSummary] = useState('');
  const [clubTags, setClubTags] = useState<string[]>([]);
  const [clubSearchQuery, setClubSearchQuery] = useState('');
  const [selectedClubMemberIds, setSelectedClubMemberIds] = useState<string[]>([]);
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubLoading, setClubLoading] = useState(false);
  const [clubCreating, setClubCreating] = useState(false);
  const [clubVisibilityOpen, setClubVisibilityOpen] = useState(false);
  const [clubVisibility, setClubVisibility] = useState<VisibilityControlState>(DEFAULT_VISIBILITY_STATE);
  const [clubHasCruushPlus, setClubHasCruushPlus] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [changingCruushUserId, setChangingCruushUserId] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const dlModeActive = useDlMode();
  const distancePreferences = useDistancePreferences();

  useEffect(() => {
    void fetchConversations();
  }, []);

  useEffect(() => {
    if (activeTab !== 'clubs') return;

    let active = true;
    void getMyBillingStatus()
      .then((billing) => {
        if (active) setClubHasCruushPlus(billing.cruushPlus === true);
      })
      .catch(() => {
        if (active) setClubHasCruushPlus(false);
      });

    return () => { active = false; };
  }, [activeTab]);

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

    if (activeTab === 'groups' && (conversation.kind !== 'group' || conversation.clubId)) {
      return false;
    }

    if (activeTab === 'all' && conversation.clubId) {
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

  const pinnedConversations = conversations.filter((conversation) => (
    conversation.pinned
    && !(activeTab === 'all' && conversation.clubId)
    && !(activeTab === 'groups' && (conversation.kind !== 'group' || conversation.clubId))
  )).slice(0, 4);
  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const allUnreadCount = conversations
    .filter((conversation) => !conversation.clubId)
    .reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const groupUnreadCount = conversations
    .filter((conversation) => conversation.kind === 'group' && !conversation.clubId)
    .reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const clubUnreadCount = conversations
    .filter((conversation) => Boolean(conversation.clubId))
    .reduce((sum, conversation) => sum + conversation.unreadCount, 0);
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
        const distanceOrder = comparePrivacySafeDistance({
          distance: a.distance,
          lat: a.coordinates?.lat,
          lng: a.coordinates?.lng,
        }, {
          distance: b.distance,
          lat: b.coordinates?.lat,
          lng: b.coordinates?.lng,
        }, viewerCoordinates);
        if (distanceOrder !== 0) return distanceOrder;
      }

      return parseLastActiveRank(a.lastActive) - parseLastActiveRank(b.lastActive)
        || a.user.name.localeCompare(b.user.name);
    });
  }, [groupSearchQuery, groupSortMode, mutualOptions, viewerCoordinates]);
  const clubMutuals = useMemo(() => {
    const clubQuery = clubSearchQuery.trim().toLowerCase();
    if (!clubQuery) return mutualOptions;
    return mutualOptions.filter((item) => [
      item.user.name,
      item.user.pronouns,
      ...item.vibes,
      ...item.mutualCrowds,
    ].some((value) => value.toLowerCase().includes(clubQuery)));
  }, [clubSearchQuery, mutualOptions]);

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
      const [activity, profile] = await Promise.all([
        getMyCruushActivity(),
        getMyProfile().catch(() => null),
      ]);
      setViewerCoordinates(await resolveViewerCoordinates(profile));
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

  const openClubComposer = async () => {
    // The cruush+ flag is only loaded on the Clubs tab, and the + menu offers
    // Create Club from every tab. Ask before sending a paying member to checkout.
    let hasCruushPlus = clubHasCruushPlus;
    if (!hasCruushPlus) {
      try {
        hasCruushPlus = (await getMyBillingStatus()).cruushPlus === true;
        setClubHasCruushPlus(hasCruushPlus);
      } catch {
        hasCruushPlus = false;
      }
    }

    if (!hasCruushPlus) {
      trackCruushPlusConversion('cruush_plus_upgrade_clicked', {
        surface: 'club_creation',
        benefit: 'club_creation',
      });
      navigate(buildCruushPlusStorePath('club_creation', 'club_creation'));
      return;
    }
    setClubComposerOpen(true);
    await Promise.all([
      loadMessageableMutuals({
        setComposerError: setClubError,
        setComposerLoading: setClubLoading,
      }),
      getMyProfile()
        .then((profile) => setClubVisibility(visibilityRulesToState(profile.visibility_rules)))
        .catch(() => setClubVisibility(DEFAULT_VISIBILITY_STATE)),
    ]);
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
      const coordinates = await resolveViewerCoordinates(profile);
      setViewerCoordinates(coordinates);
      const messageableMutuals = (activity.mutual ?? []).filter((item) => item.canMessage !== false);
      setMutualOptions(messageableMutuals);
      setDirectHasCruushPlus(billing?.cruushPlus === true);

      try {
        // Message seeking filters rank the inclusive authorized set locally.
        // They must never remove every otherwise-messageable profile at the API boundary.
        const nearbyUsers = await getNearbyUsers(
          coordinates,
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
        : prev.length < 99 ? [...prev, userId] : prev
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

  const resetClubComposer = () => {
    setClubComposerOpen(false);
    setClubName('');
    setClubSummary('');
    setClubTags([]);
    setClubSearchQuery('');
    setSelectedClubMemberIds([]);
    setClubVisibilityOpen(false);
    setClubVisibility(DEFAULT_VISIBILITY_STATE);
    setClubError(null);
  };

  const toggleSelectedClubMember = (userId: string) => {
    setSelectedClubMemberIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : current.length < 999 ? [...current, userId] : current);
  };

  const handleCreateClub = async () => {
    if (!clubName.trim() || !clubSummary.trim() || clubTags.length === 0 || clubCreating) return;
    setClubCreating(true);
    setClubError(null);
    try {
      const created = await createClub({
        title: clubName.trim(),
        summary: clubSummary.trim(),
        tags: clubTags,
        memberIds: selectedClubMemberIds,
        visibilityRules: visibilityStateToRules(clubVisibility),
      });
      resetClubComposer();
      openConversation(created.conversationId);
    } catch (createError) {
      setClubError(createError instanceof Error ? createError.message : 'Club could not be created.');
    } finally {
      setClubCreating(false);
    }
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

  const emptyInbox = !loading && !error && conversations.length === 0;

  return (
    <div data-testid="direct-messages-root" className={embedded ? 'relative min-h-full bg-[#050505] pb-6 text-white' : `relative bg-[#050505] text-white ${emptyInbox ? 'h-[100dvh] overflow-hidden' : 'min-h-screen pb-[calc(7rem+env(safe-area-inset-bottom))]'}`}>
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

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'unread' | 'groups' | 'clubs')}>
            <TabsList className="grid h-auto w-full grid-cols-4 rounded-lg border border-white/10 bg-background/25 p-1 shadow-[0_20px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <TabsTrigger value="all" className="relative h-10 rounded-md text-sm text-white/72">
                All
                {allUnreadCount > 0 ? <span aria-hidden="true" className="absolute right-2 top-1.5 size-2 rounded-full bg-red-500" data-testid="all-unread-dot" /> : null}
              </TabsTrigger>
              <TabsTrigger value="unread" className="relative h-10 rounded-md text-sm text-white/72">
                Unread
                {unreadCount > 0 ? <span aria-hidden="true" className="absolute right-2 top-1.5 size-2 rounded-full bg-red-500" data-testid="unread-unread-dot" /> : null}
              </TabsTrigger>
              <TabsTrigger value="groups" className="relative h-10 rounded-md text-sm text-white/72" onClick={() => setActiveTab('groups')}>
                Groups
                {groupUnreadCount > 0 ? <span aria-hidden="true" className="absolute right-2 top-1.5 size-2 rounded-full bg-red-500" data-testid="groups-unread-dot" /> : null}
              </TabsTrigger>
              <TabsTrigger value="clubs" className="relative h-10 rounded-md text-sm text-white/72" onClick={() => setActiveTab('clubs')}>
                Clubs
                {clubUnreadCount > 0 ? <span aria-hidden="true" className="absolute right-2 top-1.5 size-2 rounded-full bg-red-500" data-testid="clubs-unread-dot" /> : null}
              </TabsTrigger>
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
          onStartClub={() => void openClubComposer()}
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
          onUpgrade={() => navigate(buildCruushPlusStorePath('message_filters', 'seeking_visibility'))}
          conversionSurface="message_filters"
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
                    <CruushesProfileCard
                      key={item.user.id}
                      testId={`group-mutual-${item.user.id}`}
                      user={{ ...item.user, vibes: item.user.vibes ?? item.vibes }}
                      metadata={(
                        <span className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62">
                          <span className="truncate">{item.lastActive}</span>
                        </span>
                      )}
                      mutual
                      sharesCrowd={(item.mutualCrowds?.length ?? 0) > 0}
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

      {clubComposerOpen ? (
        <div
          className="scrollbar-hide fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background/95 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-md"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Back from new Club" onClick={resetClubComposer}>
                <ChevronLeft className="size-4" />
              </Button>
              <h3 className="min-w-0 flex-1 truncate text-xl">New Club</h3>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Close Club composer" onClick={resetClubComposer}>
                <X className="size-4" />
              </Button>
              <div className="h-9 w-9 shrink-0" data-testid="direct-messages-club-bug-button-slot" ref={registerBugButtonSlot} />
            </div>

            {clubError ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {clubError}
              </div>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">Club name</span>
              <Input aria-label="Club name" maxLength={120} value={clubName} onChange={(event) => setClubName(event.target.value)} />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">Short description</span>
              <Textarea aria-label="Short description" maxLength={1000} value={clubSummary} onChange={(event) => setClubSummary(event.target.value)} />
            </label>

            <div className="block space-y-2">
              <span className="text-sm text-muted-foreground">Tags</span>
              <TagInput ariaLabel="Club tags" maxTags={10} onChange={setClubTags} tags={clubTags} />
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={() => setClubVisibilityOpen(true)}>
              Visibility Controls
            </Button>

            <TrustRestrictionNotice message={trust.message('group_creation', 'Club creation')} />
            <Button
              type="button"
              className="w-full"
              disabled={!clubName.trim() || !clubSummary.trim() || clubTags.length === 0 || clubCreating || trust.restricted('group_creation')}
              onClick={() => void handleCreateClub()}
              style={{ background: 'var(--cruush-gradient)' }}
            >
              Create Club
            </Button>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Cruushes</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search cruushes for Club"
                  className="pl-9"
                  value={clubSearchQuery}
                  onChange={(event) => setClubSearchQuery(event.target.value)}
                  placeholder="Search cruushes"
                />
              </div>
              {clubLoading ? <LoadingCardSkeletons count={3} label="Loading cruushes" /> : null}
              {!clubLoading && mutualOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  No cruushes available.
                </div>
              ) : null}
              {!clubLoading && mutualOptions.length > 0 && clubMutuals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  No cruushes match your search.
                </div>
              ) : null}
              <div className="space-y-2">
                {clubMutuals.map((item) => {
                  const selected = selectedClubMemberIds.includes(item.user.id);
                  return (
                    <CruushesProfileCard
                      key={item.user.id}
                      testId={`club-mutual-${item.user.id}`}
                      user={{ ...item.user, vibes: item.user.vibes ?? item.vibes }}
                      metadata={(
                        <span className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62">
                          <span className="truncate">{item.lastActive}</span>
                          <span className="truncate">{formatDistanceLabel(item.distance, distancePreferences.mode) ?? item.distance}</span>
                        </span>
                      )}
                      mutual
                      sharesCrowd={(item.mutualCrowds?.length ?? 0) > 0}
                      onSelect={() => toggleSelectedClubMember(item.user.id)}
                      selected={selected}
                      selectLabel={`${selected ? 'Remove' : 'Add'} ${item.user.name} ${selected ? 'from' : 'to'} Club`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <MapVisibilitySurface
        description="Choose who can discover this Club."
        searchPlaceholder="Hide this Club from matching names, bios, or #tags"
        open={clubVisibilityOpen}
        onOpenChange={setClubVisibilityOpen}
        value={clubVisibility}
        hasCruushPlus={clubHasCruushPlus}
        onChange={setClubVisibility}
        onClear={() => setClubVisibility(DEFAULT_VISIBILITY_STATE)}
        onApply={() => setClubVisibilityOpen(false)}
      />

      <div className="relative mx-auto max-w-2xl px-4 pb-8 pt-4">
        {activeTab === 'clubs' ? (
          <ClubDirectoryPanel
            query={deferredSearchQuery}
            conversations={conversations}
            onOpenConversation={openConversation}
            onClubDeleted={(conversationId) => {
              if (!conversationId) return;
              setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
            }}
          />
        ) : (
        <>
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
        </>
        )}
      </div>
    </div>
  );
}

function ComposeChoiceOverlay({
  embedded,
  onClose,
  onStartDirect,
  onStartGroup,
  onStartClub,
}: {
  embedded: boolean;
  onClose: () => void;
  onStartDirect: () => void;
  onStartGroup: () => void;
  onStartClub: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-background/95 px-4 py-6 backdrop-blur-md">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className={`flex items-center justify-between gap-3 ${embedded ? '' : 'pr-14'}`}>
          <Button type="button" variant="ghost" size="icon" aria-label="Back to Messages" onClick={onClose}>
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
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
          <button
            type="button"
            className="w-full rounded-2xl border border-border bg-card/80 p-4 text-left transition-colors hover:bg-accent/60"
            onClick={onStartClub}
          >
            <span className="block">Create Club</span>
            <span className="mt-1 block text-sm text-muted-foreground">Build a space around what brings you together.</span>
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
  // The compose page lists everyone you may message. Mutuals has its own
  // surface, so there is nothing here to switch between.
  const activeComposerTab = 'public' as const;
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

            <Accordion className="mt-3 border-t border-white/10 pt-3" collapsible type="single">
              <AccordionItem className="rounded-2xl border border-white/10 bg-background/55 px-3" value="message-sort">
                <AccordionTrigger className="min-h-12 w-full py-2 text-base text-white hover:no-underline">
                  <span className="flex min-w-0 flex-col">
                    <span>Sort people by</span>
                    <span className="text-sm font-normal text-white/62">{sortMode === 'distance' ? 'Distance' : 'Recently online'}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="grid grid-cols-2 gap-2 pb-3">
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
                      className="min-h-12 min-w-0 flex-col gap-0.5 rounded-xl px-2 py-1.5 text-base"
                      onClick={() => setSortMode(value)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon className="size-3.5" />
                        {label}
                      </span>
                    </Button>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
              <CruushesProfileCard
                key={user.id}
                testId={`message-discovery-${user.id}`}
                user={user}
                onOpenProfile={() => onOpenProfile(user.id)}
                metadata={(
                  <button type="button" className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62" onClick={() => onOpenProfile(user.id)}>
                    {describeDiscoveryUser(user) ? <span className="truncate">{describeDiscoveryUser(user)}</span> : null}
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
                sharesCrowd={user.hasSharedCrowd === true || user.relationshipContext === 'MUTUAL_CROWD'}
              />
            );
          }) : mutuals.map((item) => {
            const canCenterPin = item.canRevealPreciseLocation === true
              && item.coordinates?.precision === 'precise'
              && (item.displayExpiresAtMs == null || item.displayExpiresAtMs > Date.now());
            return (
              <CruushesProfileCard
                key={item.user.id}
                testId={`message-mutual-discovery-${item.user.id}`}
                user={{ ...item.user, vibes: item.user.vibes ?? item.vibes }}
                onOpenProfile={() => onOpenProfile(item.user.id)}
                metadata={(
                  <button type="button" className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62" onClick={() => onOpenProfile(item.user.id)}>
                    <span className="truncate">{item.lastActive}</span>
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
                sharesCrowd={(item.mutualCrowds?.length ?? 0) > 0}
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
