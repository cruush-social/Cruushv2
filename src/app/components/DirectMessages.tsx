import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Clock3, MapPin, Pin, Plus, Search, Settings2, SlidersHorizontal, Trash2, X, ArrowLeft } from 'lucide-react';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import HeartPhoto from './HeartPhoto';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import {
  createGroupConversation,
  deleteConversationForEveryone,
  getConversations,
  type ConversationThread,
  type ConversationTimer,
} from '../lib/messagesApi';
import { getMyCruushActivity, sendCruush, type MutualCruushActivityItem } from '../lib/cruushApi';
import { getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';
import { getMyBillingStatus } from '../lib/billingApi';
import { getMyProfile } from '../lib/profileApi';
import { openConversationOrInbox } from '../lib/openConversation';
import { resolveVibeTone, vibeCapsuleStyle } from '../lib/vibeTone';
import ProfileActionTrio from './ProfileActionTrio';
import CruushMatchSettings from './CruushMatchSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';

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
      photoExplicit: raw?.user?.photoExplicit,
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

const mutualBadgeClassName = 'rounded-md border border-[#8B5CF6]/45 bg-[#8B5CF6]/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#DCC7FF]';
const quietBadgeClassName = 'rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/52';
const vibeBadgeBaseClassName = 'rounded-full border px-2 py-0.5 text-[11px] uppercase leading-tight tracking-[0.08em]';
const mutualVibeBadgeClassName = `${vibeBadgeBaseClassName} border-[#6F00FF]/55 bg-[#6F00FF]/12 text-[#DCC7FF]`;
const nearbyVibeBadgeClassName = `${vibeBadgeBaseClassName} border-transparent bg-[rgba(111,0,255,0.22)] text-white/88`;

function topVibeTags(...groups: Array<string[] | undefined>) {
  return [...new Set(groups.flatMap((group) => group ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 3);
}

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
  const aDistance = aLabelled ?? (bLabelled === null ? displayCoordinateMiles(a, viewer) : null);
  const bDistance = bLabelled ?? (aLabelled === null ? displayCoordinateMiles(b, viewer) : null);

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
  return [user.pronouns, user.age ? String(user.age) : '', ...(user.presentation ?? []), ...(user.identities ?? [])]
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

export default function DirectMessages({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
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
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const dlModeActive = useDlMode();

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
      setComposerError(error instanceof Error ? error.message : 'Failed to load mutuals.');
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

  const loadDirectMessageOptions = async (_filters: FilterState = DEFAULT_FILTER_STATE) => {
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
          undefined,
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
    setSelectedMemberIds([]);
    setGroupError(null);
  };

  const resetDirectComposer = () => {
    setDirectComposerOpen(false);
    setDirectError(null);
  };

  const returnToMessageOptions = () => {
    setDirectComposerOpen(false);
    setDirectError(null);
    setComposeChooserOpen(true);
  };

  const handleStartDirectChat = (userId: string) => {
    resetDirectComposer();
    void openConversationOrInbox(navigate, userId);
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
    <div className={embedded ? 'relative min-h-full bg-[#050505] pb-6 text-white' : 'relative min-h-screen bg-[#050505] pb-[calc(7rem+env(safe-area-inset-bottom))] text-white'}>
      <header data-testid="direct-messages-header" className="sticky top-0 z-20 border-b border-white/10 bg-black/88 pb-4 pt-4 shadow-[0_20px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
        <div data-testid="direct-messages-header-content" className="mx-auto max-w-2xl space-y-4 px-4">
          <div data-testid="direct-messages-header-row" className="flex items-center gap-3 pr-[3.5rem]">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
              aria-label="Back"
              title="Back"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <h1 className="text-2xl leading-none text-white sm:text-3xl">Messages</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                aria-label="New message"
                title="New message"
                onClick={() => setComposeChooserOpen(true)}
                className="h-11 w-11 rounded-full text-white"
                style={{ background: 'var(--cruush-gradient)' }}
              >
                <Plus className="size-4" />
              </Button>
              <Dialog open={messageSettingsOpen} onOpenChange={setMessageSettingsOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    aria-label="Message settings"
                    title="Message settings"
                    className="h-11 w-11 rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
                  >
                    <CruushIcon name="settings" className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-lg border-white/10 bg-background pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                  <DialogHeader>
                    <DialogTitle>Message settings</DialogTitle>
                    <DialogDescription>Choose who can start a chat with you.</DialogDescription>
                  </DialogHeader>
                  <CruushMatchSettings embedded />
                </DialogContent>
              </Dialog>
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
          onClose={() => setComposeChooserOpen(false)}
          onStartDirect={() => void openDirectComposer()}
          onStartGroup={() => void openGroupComposer()}
        />
      ) : null}

      {directComposerOpen ? (
        <DirectUserOverlay
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
          className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background/95 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-md"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center justify-between gap-3 pr-14">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Group chat</p>
                <h3 className="text-2xl">New group</h3>
              </div>
              <div className="flex items-center gap-2">
                <div data-testid="direct-messages-group-bug-button-slot" ref={registerBugButtonSlot} />
                <Button type="button" variant="ghost" size="icon" aria-label="Close group composer" onClick={resetGroupComposer}>
                  <X className="size-4" />
                </Button>
              </div>
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
              <p className="text-sm text-muted-foreground">Mutuals</p>
              {groupLoading ? (
                <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Loading mutuals...
                </div>
              ) : null}
              {!groupLoading && mutualOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  No mutuals available.
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
                      masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit)}
                      photo={item.user.photo}
                      userId={item.user.id}
                      theme="mutual"
                      onClick={() => navigate(`/profile/${item.user.id}`)}
                      fallback={<div className="text-xs text-white/80">{getConversationInitials(item.user.name)}</div>}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{item.user.name}</span>
                      <span className="block text-xs text-muted-foreground">{item.distance}</span>
                      {item.vibes.length > 0 ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.vibes.slice(0, 3).map((vibe) => (
                            <span key={vibe} className={mutualVibeBadgeClassName}>
                              {vibe}
                            </span>
                          ))}
                        </span>
                      ) : null}
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
                  className="min-w-[150px] rounded-lg border border-white/10 bg-black/72 p-3 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <HeartPhoto
                      className="w-12"
                      label={`${conversation.user.name} avatar`}
                      masked={shouldMaskPhoto(dlModeActive, conversation.user.photoExplicit)}
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
                className="relative rounded-lg border border-white/10 bg-black/72 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:bg-white/[0.06]"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/chat/${conversation.id}`)}
                  className="block w-full p-4 pr-12 text-left"
                >
                  <div className="flex gap-4">
                    <HeartPhoto
                      className="w-20 shrink-0"
                      label={`${conversation.user.name} avatar`}
                      masked={shouldMaskPhoto(dlModeActive, conversation.user.photoExplicit)}
                      photo={conversation.user.photo}
                      userId={conversation.user.id}
                      theme={getConversationHeartTheme(conversation)}
                      onClick={conversation.kind === 'dm' ? () => navigate(`/profile/${conversation.user.id}`) : undefined}
                      fallback={
                        conversation.kind === 'group'
                          ? <CruushIcon name="profile" className="size-7 opacity-80" />
                          : <div className="text-lg text-white/80">{getConversationInitials(conversation.user.name)}</div>
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className={`min-w-0 max-w-full truncate text-base text-white ${conversation.unreadCount > 0 ? 'font-medium' : ''}`}>
                          {conversation.user.name}
                        </p>
                        {conversation.mutual ? (
                          <Badge variant="outline" className={mutualBadgeClassName}>
                            Mutual
                          </Badge>
                        ) : null}
                        {conversation.kind === 'group' ? (
                          <Badge variant="outline" className={quietBadgeClassName}>
                            Group
                          </Badge>
                        ) : null}
                        {conversation.currentUserRole && conversation.currentUserRole !== 'member' ? (
                          <Badge variant="outline" className={quietBadgeClassName}>
                            {conversation.currentUserRole}
                          </Badge>
                        ) : null}
                        {conversation.muted ? (
                          <Badge variant="outline" className={quietBadgeClassName}>
                            Quiet
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/62">
                        {conversation.user.pronouns ? <span className="truncate">{conversation.user.pronouns}</span> : null}
                        {conversation.membersLabel ? <span>{conversation.membersLabel}</span> : null}
                        <span className="inline-flex items-center gap-1">
                          <CruushIcon name="map" className="size-3 opacity-70" />
                          {conversation.distance}
                        </span>
                        <span className="text-white/52">{formatRelativeTime(conversation.updatedAt)}</span>
                        {conversation.unreadCount > 0 ? (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>

                      {conversation.lastMessage ? (
                        <p className={`mt-3 line-clamp-2 break-words text-sm ${conversation.unreadCount > 0 ? 'text-white' : 'text-white/62'}`}>
                          {conversation.lastMessage}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {conversation.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className={quietBadgeClassName}>
                            {tag}
                          </Badge>
                        ))}
                        {conversation.disappearingTimer && conversation.disappearingTimer !== 'off' ? (
                          <Badge variant="outline" className={quietBadgeClassName}>
                            {conversation.disappearingTimer}
                          </Badge>
                        ) : null}
                        {conversation.closed ? (
                          <Badge variant="outline" className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-destructive">
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
                    className="absolute right-3 top-3 size-8 text-white/55 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <ChevronRight className="absolute right-4 top-5 size-4 text-white/40" />
                )}
              </article>
            );
          })}

          {!loading && error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-8 text-center">
              <CruushIcon name="messages" className="mx-auto mb-4 size-14 opacity-55" />
              <p className="text-destructive">{error}</p>
              <Button className="mt-4" variant="outline" onClick={() => void fetchConversations()}>
                Try again
              </Button>
            </div>
          ) : null}

          {!loading && !error && filteredConversations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-card/60 p-12 text-center">
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ComposeChoiceOverlay({
  onClose,
  onStartDirect,
  onStartGroup,
}: {
  onClose: () => void;
  onStartDirect: () => void;
  onStartGroup: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-background/95 px-4 py-6 backdrop-blur-md">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between gap-3 pr-14">
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
            <span className="mt-1 block text-sm text-muted-foreground">Choose mutuals for a group thread.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DirectUserOverlay({
  error,
  loading,
  users,
  mutuals,
  viewerCoordinates,
  hasCruushPlus,
  requestedCruushIds,
  onAskMutual,
  onClose,
  onBack,
  onApplyFilters,
  onUpgrade,
  onMessage,
  onOpenMap,
  onOpenProfile,
}: {
  error: string | null;
  loading: boolean;
  users: DiscoveryUser[];
  mutuals: MutualCruushActivityItem[];
  viewerCoordinates: { lat: number; lng: number } | null;
  hasCruushPlus: boolean;
  requestedCruushIds: string[];
  onAskMutual: (user: DiscoveryUser) => void;
  onClose: () => void;
  onBack: () => void;
  onApplyFilters: (filters: FilterState) => Promise<void>;
  onUpgrade: () => void;
  onMessage: (userId: string) => void;
  onOpenMap: (userId: string, mutual: boolean) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const dlModeActive = useDlMode();
  const [activeComposerTab, setActiveComposerTab] = useState<'public' | 'mutuals'>('public');
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

  const requestMutual = async (user: DiscoveryUser) => {
    if (requestingUserId || requestedCruushIds.includes(user.id)) {
      return;
    }

    setRequestingUserId(user.id);
    setRequestError(null);

    try {
      await sendCruush(user.id, {
        name: user.name,
        pronouns: user.pronouns,
        photo: user.photo,
      });
      onAskMutual(user);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Failed to send cruush.');
    } finally {
      setRequestingUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background/95 px-4 py-6 backdrop-blur-md" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="mx-auto min-h-full max-w-2xl space-y-5 pb-8">
        <div className="flex items-center justify-between gap-3 pr-14">
          <div className="flex min-w-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Back to message options" onClick={onBack}>
              <ChevronLeft className="size-4" />
            </Button>
            <h3 className="text-2xl">Choose someone to message</h3>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close mutual picker" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <Tabs value={activeComposerTab} onValueChange={(value) => setActiveComposerTab(value as 'public' | 'mutuals')}>
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg border border-white/10 bg-background/25 p-1">
            <TabsTrigger value="public" className="h-10 rounded-md text-sm text-white/72">Public</TabsTrigger>
            <TabsTrigger value="mutuals" className="h-10 rounded-md text-sm text-white/72">Mutuals</TabsTrigger>
          </TabsList>
        </Tabs>

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
              <SlidersHorizontal className="mr-1.5 size-3.5 text-primary" />
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
          <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
            Loading people...
          </div>
        ) : null}

        {!loading && activeComposerTab === 'mutuals' && mutuals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
            No mutuals are available right now.
          </div>
        ) : null}

        <div className="space-y-2">
          {activeComposerTab === 'public' && sortedPublicUsers.length > 0 ? sortedPublicUsers.map((user) => {
            const requested = requestedCruushIds.includes(user.id);
            const canMessageNow = user.relationship?.canMessage === true;
            const hasPreciseLocation = user.displayMode === 'PRECISE';
            const vibeTags = topVibeTags(user.vibes, user.scenes, user.archetypes);
            return (
              <div
                key={user.id}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 text-left transition-colors hover:bg-accent/60"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => canMessageNow ? onMessage(user.id) : onOpenProfile(user.id)}
                >
                  <HeartPhoto
                    className="w-20 shrink-0"
                    label={`${user.name} avatar`}
                    masked={shouldMaskPhoto(dlModeActive, user.photoExplicit)}
                    photo={user.photo}
                    userId={user.id}
                    onClick={() => onOpenProfile(user.id)}
                    fallback={<div className="text-base text-white/80">{getConversationInitials(user.name)}</div>}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base">{user.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{describeDiscoveryUser(user) || user.distance}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={quietBadgeClassName}>{user.distance}</Badge>
                      {vibeTags.map((vibe) => (
                        <Badge
                          key={vibe}
                          variant="outline"
                          className={vibeBadgeBaseClassName}
                          style={vibeCapsuleStyle(resolveVibeTone({ mutual: user.relationship?.mutualCruush, isCurrentUser: user.isCurrentUser }))}
                        >
                          {vibe}
                        </Badge>
                      ))}
                      {user.latestFeedPostPreview ? (
                        <Badge variant="outline" className="max-w-[12rem] border-white/10 bg-white/[0.04] text-[10px] text-white/62">
                          <CruushIcon name="map" className="mr-1 inline size-3 opacity-80" />
                          {user.latestFeedPostPreview}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </button>
                <ProfileActionTrio
                  size="sm"
                  userName={user.name}
                  cruushState={requestingUserId === user.id ? 'sending' : requested ? 'sent' : 'available'}
                  cruushDisabled={requested || requestingUserId === user.id}
                  onCruush={() => { void requestMutual(user); }}
                  canMessage={canMessageNow}
                  onMessage={() => onMessage(user.id)}
                  canCenterPin={hasPreciseLocation}
                  onCenterPin={() => onOpenMap(user.id, false)}
                />
              </div>
            );
          }) : mutuals.map((item) => (
            <div
              key={item.user.id}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#8B5CF6]/35 bg-card/70 p-3 text-left transition-colors hover:bg-accent/60"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => onMessage(item.user.id)}
              >
                <HeartPhoto
                  className="w-20 shrink-0"
                  label={`${item.user.name} avatar`}
                  masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit)}
                  photo={item.user.photo}
                  theme="mutual"
                  userId={item.user.id}
                  onClick={() => onOpenProfile(item.user.id)}
                  fallback={<div className="text-base text-white/80">{getConversationInitials(item.user.name)}</div>}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base">{item.user.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{[item.user.pronouns, item.distance].filter(Boolean).join(' · ')}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={mutualBadgeClassName}>Mutual</Badge>
                    {topVibeTags(item.vibes).map((vibe) => (
                      <Badge
                        key={vibe}
                        variant="outline"
                        className={vibeBadgeBaseClassName}
                        style={vibeCapsuleStyle('mutual')}
                      >
                        {vibe}
                      </Badge>
                    ))}
                  </span>
                </span>
              </button>
              <ProfileActionTrio
                size="sm"
                userName={item.user.name}
                cruushState="mutual"
                cruushDisabled
                onCruush={() => onOpenProfile(item.user.id)}
                canMessage={item.canMessage !== false}
                onMessage={() => onMessage(item.user.id)}
                canCenterPin={item.coordinates?.precision === 'precise'}
                onCenterPin={() => onOpenMap(item.user.id, true)}
              />
            </div>
          ))}
        </div>

        <MapFiltersSurface
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Seeking"
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
