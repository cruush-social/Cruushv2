import { useContentVisibilityRefresh } from '../lib/contentVisibilityRevision';
import { getNsfwPhotoRestriction } from '../lib/dlMode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import HeartPhoto from './HeartPhoto';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { dismissIncomingCruush, getMutualCruushMap, getMyCruushActivity, removeProfileView, revokeMutualCruush, revokeSentCruush, sendCruush, type CruushActivity, type CruushLockableActivityItem, type MutualCruushActivityItem, type ProfileViewActivityItem } from '../lib/cruushApi';
import { DEBUG_CRUUSH_PLUS_EVENT } from '../lib/debugApi';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';
import { addCruushChangedListener } from '../lib/cruushEvents';
import {
  handleCruushSendSuccess,
  handleMutualCruushRevokeSuccess,
  handleSentCruushRevokeSuccess,
  notifyCruushSendError,
  notifyMutualCruushRevokeError,
  notifySentCruushRevokeError,
} from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { formatDistanceLabel as formatUserDistanceLabel, useDistancePreferences, type DistanceDisplayMode } from '../lib/distancePreferences';
import ProfileActionTrio from './ProfileActionTrio';
import CruushesProfileCard from './CruushesProfileCard';
import UserActivityCapsule from './UserActivityCapsule';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import CruushMatchSettings from './CruushMatchSettings';
import AppPageHeader from './AppPageHeader';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { resolveUserBorderTone } from '../lib/userBorderTone';
import { buildCruushPlusStorePath, type CruushPlusConversionSurface } from '../lib/cruushPlusConversion';
import { trackCruushPlusConversion } from '../lib/posthog';

type ActivityTab = 'incoming' | 'sent' | 'mutual' | 'views';
type CruushActionState = 'available' | 'sending' | 'sent' | 'mutual';

const activityHeartClassName = 'w-20 shrink-0';
const activityActionClassName = '!gap-1 [&>button]:!size-9 [&>button]:!p-1.5 [&>button>img]:!size-5 [&>button>svg]:!size-5';
// Cruushes cards read as Feed cards: the same surface and hover, and the same
// padding. A Feed card is taller because a post sits under the identity row;
// with no post to carry, these centre their content in that space rather than
// pinning it to the top and leaving the rest empty.
const activityCardClassName = 'bg-black/72 hover:bg-black/86 min-h-[7.5rem] content-center';

function activityDistanceLabel(
  item: CruushLockableActivityItem | MutualCruushActivityItem,
  mode: DistanceDisplayMode,
  fallback?: string,
) {
  if (('distance' in item && item.distance === 'Dark Room') || fallback === 'Dark Room') return 'Dark Room';
  const distance = item.distanceLabel
    ?? (item.user?.outOfSight ? 'Far far away' : undefined)
    ?? ('distance' in item ? item.distance : fallback);
  return formatUserDistanceLabel(distance, mode) ?? 'Nearby';
}

function formatRelativeTime(isoTimestamp: string) {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMinutes = Math.max(0, Math.floor((now - then) / 60000));

  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function ActivityBadge({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-[#6F00FF]/55 bg-[#6F00FF]/18 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#DCC7FF]">
      {children}
    </span>
  );
}

function ActivityMeta({ items }: { items: Array<string | null | undefined> }) {
  const visibleItems = items.filter((item): item is string => Boolean(item));

  return (
    <p className="flex h-11 w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden text-xs leading-snug text-white/62 sm:text-sm">
      {visibleItems.map((item, index) => (
        <span key={`${item}-${index}`} className="block min-w-0 truncate">
          {item}
        </span>
      ))}
    </p>
  );
}

function CruushActionButton({
  state,
  userName,
  onClick,
  revocable = false,
}: {
  state: CruushActionState;
  userName: string;
  onClick: () => void;
  revocable?: boolean;
}) {
  const labels: Record<CruushActionState, string> = {
    available: `Send cruush to ${userName}`,
    sending: `Sending cruush to ${userName}`,
    sent: revocable ? `Unsend cruush to ${userName}` : `cruush sent to ${userName}`,
    mutual: revocable ? `Uncruush ${userName}` : `Mutual with ${userName}`,
  };
  const disabled = state === 'sending' || (!revocable && state !== 'available');

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={[
        state === 'mutual' && revocable ? 'cruush-action-sheen' : '',
        'h-11 w-11 shrink-0 rounded-full text-white transition disabled:opacity-100',
        'border-0 hover:brightness-125',
      ].join(' ')}
      style={{
        background: state === 'mutual' || (disabled && state !== 'sending') || state === 'available' ? 'var(--cruush-gradient)' : 'var(--cruush-gradient-soft-28)',
        opacity: state === 'mutual' || (disabled && state !== 'sending') ? 0.5 : undefined,
      }}
      aria-label={labels[state]}
      title={labels[state]}
      disabled={disabled}
      onClick={onClick}
    >
      <CruushIcon name="mutual" className="h-6 w-6" variant="white" />
    </Button>
  );
}

function LockedHeart({ label = 'Locked profile preview' }: { label?: string }) {
  return (
    <div className={`relative ${activityHeartClassName}`}>
      <HeartPhoto
        className="w-20 blur-[2px]"
        label={label}
        masked
        theme="nearby"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/58 text-white">
          <Lock className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function PersonHeart({
  item,
  fallbackLabel,
  onOpenProfile,
}: {
  item: CruushLockableActivityItem | ProfileViewActivityItem;
  fallbackLabel: string;
  onOpenProfile?: (userId: string) => void;
}) {
  const dlModeActive = useDlMode();
  if (item.locked || !item.user) {
    return <LockedHeart label={fallbackLabel} />;
  }

  const borderTone = resolveUserBorderTone({
    mileHigh: item.user.travelling,
    mutual: 'mutual' in item && item.mutual === true,
  });

  return (
    <HeartPhoto
      borderTone={borderTone}
      className={activityHeartClassName}
      label={`${item.user.name} preview`}
      restriction={getNsfwPhotoRestriction(item.user.photoExplicit, item.user.photoRelationship)}
      masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit, item.user.photoRelationship)}
      photo={item.user.photo}
      outOfSight={item.user.outOfSight === true}
      userId={item.user.id}
      theme={'mutual' in item && item.mutual ? 'mutual' : 'nearby'}
      onClick={onOpenProfile ? () => onOpenProfile(item.user!.id) : undefined}
    />
  );
}

function UpgradeBanner({
  count,
  label,
  onUpgrade,
  surface,
}: {
  count: number;
  label: string;
  onUpgrade: () => void;
  surface: CruushPlusConversionSurface;
}) {
  useEffect(() => {
    if (count > 0) {
      trackCruushPlusConversion('cruush_plus_paywall_viewed', {
        surface,
        benefit: 'full_activity',
      });
    }
  }, [count, surface]);

  if (count <= 0) {
    return null;
  }

  const resolvedLabel = count === 1 && label.startsWith('have ')
    ? `has ${label.slice('have '.length)}`
    : label;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/18 bg-primary/10 px-4 py-4">
      <div className="absolute inset-0 opacity-40" style={{ background: 'var(--cruush-gradient-soft-28)' }} />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <CruushIcon name="lucky" className="mt-0.5 h-5 w-5" variant="colored" />
          <div>
            <p className="text-sm text-white">{pluralize(count, 'more person', 'more people')} {resolvedLabel}</p>
            <p className="mt-1 text-xs text-white/68">Upgrade to <CruushPlusWord /> to see them.</p>
          </div>
        </div>
        <Button
          type="button"
          className="h-10 shrink-0 rounded-lg px-4 text-white"
          style={{ background: 'var(--cruush-gradient)' }}
          onClick={() => {
            trackCruushPlusConversion('cruush_plus_upgrade_clicked', {
              surface,
              benefit: 'full_activity',
            });
            onUpgrade();
          }}
        >
          <CruushPlusWord />
        </Button>
      </div>
    </div>
  );
}

function IncomingRow({
  item,
  onCruushAction,
  distance,
  sentCruush = false,
  pendingCruush = false,
  pinActionable,
  onOpenProfile,
  onMessage,
  onOpenMap,
  onDismiss,
  dismissing = false,
}: {
  item: CruushLockableActivityItem;
  onCruushAction: (item: CruushLockableActivityItem) => void;
  distance: string;
  sentCruush?: boolean;
  pendingCruush?: boolean;
  pinActionable: boolean;
  onOpenProfile: (userId: string, state?: { distance?: string; lastActive?: string }) => void;
  onMessage: (userId: string) => void;
  onOpenMap: (userId: string) => void;
  onDismiss?: (item: CruushLockableActivityItem) => void;
  dismissing?: boolean;
}) {
  const unlocked = !item.locked && item.user;
  const actionState: CruushActionState = item.mutual
    ? 'mutual'
    : pendingCruush
      ? 'sending'
      : sentCruush
        ? 'sent'
        : 'available';

  if (unlocked) {
    return (
      <CruushesProfileCard
        testId="activity-row"
        user={item.user}
        onOpenProfile={() => onOpenProfile(item.user!.id, { distance })}
        metadata={(
          <button type="button" className="min-w-0 text-left" onClick={() => onOpenProfile(item.user!.id, { distance })}>
            <ActivityMeta items={[formatRelativeTime(item.createdAt), distance]} />
          </button>
        )}
        actions={(
          <ProfileActionTrio
            className={activityActionClassName}
            userName={item.user.name}
            cruushState={actionState}
            cruushTone={actionState === 'mutual' ? 'dark' : undefined}
            cruushReceived
            onCruush={() => onCruushAction(item)}
            canMessage={item.permissions?.canMessage === true}
            onMessage={() => onMessage(item.user!.id)}
            canCenterPin={pinActionable}
            onCenterPin={() => onOpenMap(item.user!.id)}
          />
        )}
        cornerBadge={onDismiss ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-white"
            aria-label={`Clear incoming cruush from ${item.user.name}`}
            title="Clear from your list"
            disabled={dismissing}
            onClick={(event) => {
              event.stopPropagation();
              onDismiss(item);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
        mutual={item.mutual === true}
      />
    );
  }

  return (
    <UserActivityCapsule
      className={activityCardClassName}
      testId="activity-row"
      heart={<PersonHeart item={item} fallbackLabel="Locked incoming cruush" onOpenProfile={onOpenProfile} />}
      name="Someone new"
      identityDisabled
      metadata={(
        <div className="min-w-0 text-left">
          <ActivityMeta items={['Has a cruush on you', formatRelativeTime(item.createdAt)]} />
          <p className="mt-1 text-xs text-primary">Upgrade to view</p>
        </div>
      )}
      mutual={item.mutual === true}
    />
  );
}

function SentRow({
  item,
  distance,
  pendingRevoke,
  pinActionable,
  onOpenProfile,
  onRevoke,
  onMessage,
  onOpenMap,
}: {
  item: CruushLockableActivityItem;
  distance: string;
  pendingRevoke: boolean;
  pinActionable: boolean;
  onOpenProfile: (userId: string, state?: { distance?: string; lastActive?: string }) => void;
  onRevoke: (item: CruushLockableActivityItem) => void;
  onMessage: (userId: string) => void;
  onOpenMap: (userId: string) => void;
}) {
  if (!item.user) {
    return null;
  }

  return (
    <CruushesProfileCard
      testId="activity-row"
      user={item.user}
      onOpenProfile={() => onOpenProfile(item.user!.id, { distance })}
      metadata={<button type="button" className="min-w-0 text-left" onClick={() => onOpenProfile(item.user!.id, { distance })}><ActivityMeta items={[formatRelativeTime(item.createdAt), distance]} /></button>}
      actions={(
        <ProfileActionTrio
          className={activityActionClassName}
          cruushTone="dark"
          userName={item.user.name}
          cruushState={pendingRevoke ? 'sending' : item.mutual ? 'mutual' : 'sent'}
          onCruush={() => onRevoke(item)}
          canMessage={item.permissions?.canMessage === true}
          onMessage={() => onMessage(item.user!.id)}
          canCenterPin={pinActionable}
          onCenterPin={() => onOpenMap(item.user!.id)}
        />
      )}
      mutual={item.mutual === true}
    />
  );
}

function MutualRow({
  item,
  distance,
  pendingRevoke,
  pinActionable,
  onRevoke,
  onOpenMap,
  onMessage,
  onOpenProfile,
}: {
  item: MutualCruushActivityItem;
  distance: string;
  pendingRevoke: boolean;
  pinActionable: boolean;
  onRevoke: (item: MutualCruushActivityItem) => void;
  onOpenMap: (userId: string) => void;
  onMessage: (userId: string) => void;
  onOpenProfile: (userId: string, state?: { distance?: string; lastActive?: string }) => void;
}) {
  return (
    <CruushesProfileCard
      testId="activity-row"
      user={item.user}
      identityAdornment={item.canRevealPreciseLocation ? <ActivityBadge>Precise</ActivityBadge> : null}
      onOpenProfile={() => onOpenProfile(item.user.id, { distance, lastActive: item.lastActive })}
      metadata={<button type="button" className="min-w-0 text-left" onClick={() => onOpenProfile(item.user.id, { distance, lastActive: item.lastActive })}><ActivityMeta items={[item.lastActive, distance]} /></button>}
      actions={(
        <ProfileActionTrio
          className={activityActionClassName}
          cruushTone="dark"
          userName={item.user.name}
          cruushState={pendingRevoke ? 'sending' : 'mutual'}
          onCruush={() => onRevoke(item)}
          canMessage={item.canMessage !== false}
          onMessage={() => onMessage(item.user.id)}
          canCenterPin={pinActionable}
          onCenterPin={() => onOpenMap(item.user.id)}
        />
      )}
      mutual
    />
  );
}

function ViewRow({
  item,
  distance,
  actionState,
  pinActionable,
  onCruush,
  onOpenProfile,
  onMessage,
  onOpenMap,
  onRemove,
  removing = false,
}: {
  item: ProfileViewActivityItem;
  distance: string;
  actionState: CruushActionState;
  pinActionable: boolean;
  onCruush: (item: ProfileViewActivityItem) => void;
  onOpenProfile: (userId: string, state?: { distance?: string; lastActive?: string }) => void;
  onMessage: (userId: string) => void;
  onRemove?: (item: ProfileViewActivityItem) => void;
  removing?: boolean;
  onOpenMap: (userId: string) => void;
}) {
  const unlocked = !item.locked && item.user;

  if (unlocked) {
    return (
      <CruushesProfileCard
        testId="activity-row"
        user={item.user}
        onOpenProfile={() => onOpenProfile(item.user!.id, { distance })}
        metadata={(
          <button type="button" className="min-w-0 text-left" onClick={() => onOpenProfile(item.user!.id, { distance })}>
            <ActivityMeta items={[formatRelativeTime(item.viewedAt), distance]} />
          </button>
        )}
        actions={(
          <ProfileActionTrio
            className={activityActionClassName}
            userName={item.user.name}
            cruushState={actionState}
            cruushTone={actionState === 'mutual' ? 'dark' : undefined}
            onCruush={() => onCruush(item)}
            canMessage={item.permissions?.canMessage === true}
            onMessage={() => onMessage(item.user!.id)}
            canCenterPin={pinActionable}
            onCenterPin={() => onOpenMap(item.user!.id)}
          />
        )}
        cornerBadge={onRemove ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-white"
            aria-label={`Clear profile view from ${item.user.name}`}
            title="Clear from your list"
            disabled={removing}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
        mutual={actionState === 'mutual'}
      />
    );
  }

  return (
    <UserActivityCapsule
      className={activityCardClassName}
      testId="activity-row"
      heart={<PersonHeart item={item} fallbackLabel="Locked profile view" onOpenProfile={onOpenProfile} />}
      name="Someone new"
      identityDisabled
      metadata={(
        <div className="min-w-0 text-left">
          <ActivityMeta items={['Viewed your profile', formatRelativeTime(item.viewedAt)]} />
          <p className="mt-1 text-xs text-primary">Upgrade to view</p>
        </div>
      )}
      mutual={actionState === 'mutual'}
      vibeTone={actionState === 'mutual' ? 'mutual' : 'nearby'}
    />
  );
}

export default function CruushActivity({
  embedded = false,
  onClose,
  onOpenConversation,
  onOpenSettings,
}: {
  embedded?: boolean;
  onClose?: () => void;
  onOpenConversation?: (conversationId: string) => void;
  onOpenSettings?: () => void;
} = {}) {
  const navigate = useNavigate();
  const distancePreferences = useDistancePreferences();
  const [activity, setActivity] = useState<CruushActivity | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityTab>('incoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCruushUserIds, setPendingCruushUserIds] = useState<Set<string>>(() => new Set());
  const [pendingRevokeUserIds, setPendingRevokeUserIds] = useState<Set<string>>(() => new Set());
  const [validPinUserIds, setValidPinUserIds] = useState<Set<string>>(() => new Set());
  const [composeChooserOpen, setComposeChooserOpen] = useState(false);
  const [matchSettingsOpen, setMatchSettingsOpen] = useState(false);
  const [directComposerOpen, setDirectComposerOpen] = useState(false);

  const activityRequest = useRef(0);
  const fetchCruushActivity = async (retryVisibilityFailure = false) => {
    const request = ++activityRequest.current;
    setError(null);
    try {
      const [nextActivity, mutualMapItems] = await Promise.all([
        getMyCruushActivity(),
        getMutualCruushMap().catch(() => []),
      ]);
      if (request !== activityRequest.current) return;
      setActivity(nextActivity);
      setValidPinUserIds(new Set(mutualMapItems
        .filter((item) => item.canRevealPreciseLocation === true
          && item.coordinates?.precision === 'precise'
          && (item.displayExpiresAtMs == null || item.displayExpiresAtMs > Date.now()))
        .map((item) => item.user.id)));
    } catch (fetchError) {
      if (request !== activityRequest.current) return;
      console.error('Error fetching cruush activity:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load cruush activity.');
      if (retryVisibilityFailure) throw fetchError;
    } finally {
      if (request === activityRequest.current) setLoading(false);
    }
  };

  useContentVisibilityRefresh(() => fetchCruushActivity(true));

  useEffect(() => {
    void fetchCruushActivity();
    return () => { activityRequest.current += 1; };
  }, []);

  useEffect(() => {
    const handleDebugCruushPlusChange = () => {
      void fetchCruushActivity();
    };

    window.addEventListener(DEBUG_CRUUSH_PLUS_EVENT, handleDebugCruushPlusChange);
    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, handleDebugCruushPlusChange);

    return () => {
      window.removeEventListener(DEBUG_CRUUSH_PLUS_EVENT, handleDebugCruushPlusChange);
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, handleDebugCruushPlusChange);
    };
  }, []);

  useEffect(() => {
    return addCruushChangedListener(() => {
      void fetchCruushActivity();
    });
  }, []);

  // The panel stays mounted while the phone is in a pocket, and it only ever
  // fetched on mount, so incoming cruushes and views sat frozen at whatever
  // they were when the app was last opened. Coming back to the foreground
  // reads them again, no more than once a minute.
  useEffect(() => {
    let lastRefreshedAtMs = Date.now();

    const refreshAfterResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshedAtMs < 60_000) return;
      lastRefreshedAtMs = Date.now();
      void fetchCruushActivity();
    };

    window.addEventListener('focus', refreshAfterResume);
    window.addEventListener('online', refreshAfterResume);
    document.addEventListener('visibilitychange', refreshAfterResume);

    return () => {
      window.removeEventListener('focus', refreshAfterResume);
      window.removeEventListener('online', refreshAfterResume);
      document.removeEventListener('visibilitychange', refreshAfterResume);
    };
  }, []);

  const handleCruushBack = async (item: CruushLockableActivityItem) => {
    if (!item.user) {
      return;
    }

    if (item.mutual || pendingCruushUserIds.has(item.user.id)) {
      return;
    }

    setPendingCruushUserIds((current) => new Set(current).add(item.user!.id));
    try {
      const cruush = await sendCruush(item.user.id, {
        name: item.user.name,
        pronouns: item.user.pronouns,
        photo: item.user.photo,
      });
      handleCruushSendSuccess(item.user.id, item.user.name, cruush);
    } catch (cruushError) {
      console.error('Error sending cruush:', cruushError);
      notifyCruushSendError(cruushError);
      setError(cruushError instanceof Error ? cruushError.message : 'Failed to send cruush.');
    } finally {
      setPendingCruushUserIds((current) => {
        const next = new Set(current);
        next.delete(item.user!.id);
        return next;
      });
    }
  };

  const handleRevokeSent = async (item: CruushLockableActivityItem) => {
    if (!item.user || pendingRevokeUserIds.has(item.user.id)) {
      return;
    }

    const targetUser = item.user;
    const mutual = item.mutual === true;
    setPendingRevokeUserIds((current) => new Set(current).add(targetUser.id));
    try {
      if (mutual) {
        await revokeMutualCruush(targetUser.id);
      } else {
        await revokeSentCruush(targetUser.id);
      }
      setActivity((current) => current ? {
        ...current,
        counts: {
          ...current.counts,
          sent: mutual ? current.counts.sent : Math.max(0, current.counts.sent - 1),
          mutual: mutual ? Math.max(0, current.counts.mutual - 1) : current.counts.mutual,
        },
        incoming: mutual
          ? current.incoming.map((incomingItem) => incomingItem.user?.id === targetUser.id
            ? { ...incomingItem, mutual: false }
            : incomingItem)
          : current.incoming,
        sent: mutual
          ? current.sent.map((sentItem) => sentItem.user?.id === targetUser.id
            ? { ...sentItem, mutual: false }
            : sentItem)
          : current.sent.filter((sentItem) => sentItem.id !== item.id),
        mutual: mutual ? current.mutual.filter((mutualItem) => mutualItem.user.id !== targetUser.id) : current.mutual,
      } : current);
      if (mutual) {
        handleMutualCruushRevokeSuccess(targetUser.id, targetUser.name);
      } else {
        handleSentCruushRevokeSuccess(targetUser.id, targetUser.name);
      }
    } catch (revokeError) {
      console.error('Error revoking cruush:', revokeError);
      if (mutual) {
        notifyMutualCruushRevokeError(revokeError);
      } else {
        notifySentCruushRevokeError(revokeError);
      }
      setError(revokeError instanceof Error ? revokeError.message : 'Failed to unsend cruush.');
    } finally {
      setPendingRevokeUserIds((current) => {
        const next = new Set(current);
        next.delete(targetUser.id);
        return next;
      });
    }
  };

  const handleRevokeMutual = async (targetUser: { id: string; name: string }) => {
    if (pendingRevokeUserIds.has(targetUser.id)) {
      return;
    }

    setPendingRevokeUserIds((current) => new Set(current).add(targetUser.id));
    try {
      await revokeMutualCruush(targetUser.id);
      setActivity((current) => current ? {
        ...current,
        counts: {
          ...current.counts,
          mutual: Math.max(0, current.counts.mutual - 1),
        },
        incoming: current.incoming.map((incomingItem) => incomingItem.user?.id === targetUser.id
          ? { ...incomingItem, mutual: false }
          : incomingItem),
        sent: current.sent.map((sentItem) => sentItem.user?.id === targetUser.id
          ? { ...sentItem, mutual: false }
          : sentItem),
        mutual: current.mutual.filter((mutualItem) => mutualItem.user.id !== targetUser.id),
      } : current);
      handleMutualCruushRevokeSuccess(targetUser.id, targetUser.name);
    } catch (revokeError) {
      console.error('Error removing mutual:', revokeError);
      notifyMutualCruushRevokeError(revokeError);
      setError(revokeError instanceof Error ? revokeError.message : 'Failed to uncruush.');
    } finally {
      setPendingRevokeUserIds((current) => {
        const next = new Set(current);
        next.delete(targetUser.id);
        return next;
      });
    }
  };

  const [clearingUserIds, setClearingUserIds] = useState<Set<string>>(() => new Set());

  const markClearing = (userId: string, clearing: boolean) => {
    setClearingUserIds((current) => {
      const next = new Set(current);
      if (clearing) next.add(userId); else next.delete(userId);
      return next;
    });
  };

  // Clearing an incoming cruush hides it from your list only. The sender keeps
  // it in their Sent list, so this never edits somebody else's history.
  const handleDismissIncoming = async (item: CruushLockableActivityItem) => {
    const targetUser = item.user;
    if (!targetUser || clearingUserIds.has(targetUser.id)) return;

    markClearing(targetUser.id, true);
    try {
      await dismissIncomingCruush(targetUser.id);
      setActivity((current) => current ? {
        ...current,
        counts: { ...current.counts, incoming: Math.max(0, current.counts.incoming - 1) },
        incoming: current.incoming.filter((row) => row.user?.id !== targetUser.id),
      } : current);
    } catch (dismissError) {
      console.error('Error clearing incoming cruush:', dismissError);
    } finally {
      markClearing(targetUser.id, false);
    }
  };

  const handleRemoveView = async (item: ProfileViewActivityItem) => {
    if (clearingUserIds.has(item.user.id)) return;

    markClearing(item.user.id, true);
    try {
      await removeProfileView(item.user.id);
      setActivity((current) => current ? {
        ...current,
        counts: { ...current.counts, views: Math.max(0, current.counts.views - 1) },
        views: current.views.filter((row) => row.user.id !== item.user.id),
      } : current);
    } catch (removeError) {
      console.error('Error clearing profile view:', removeError);
    } finally {
      markClearing(item.user.id, false);
    }
  };

  const openProfile = (userId: string, state?: { distance?: string; lastActive?: string }) =>
    navigate(`/profile/${userId}`, state ? { state } : undefined);
  const openMutualOnMap = (userId: string) => navigate(`/map?mode=mutuals&focusUserId=${encodeURIComponent(userId)}`);
  const openMessage = (userId: string) => {
    setDirectComposerOpen(false);
    void openConversationOrInbox(navigate, userId, embedded ? onOpenConversation : undefined);
  };
  const openGroupComposer = () => {
    setComposeChooserOpen(false);
    navigate('/messages?compose=group');
  };

  const messageableMutuals = (activity?.mutual ?? []).filter((item) => item.canMessage !== false);
  const sentUserIds = new Set((activity?.sent ?? []).flatMap((item) => item.user ? [item.user.id] : []));
  const mutualUserIds = new Set((activity?.mutual ?? []).map((item) => item.user.id));
  const mutualDistanceByUserId = new Map((activity?.mutual ?? []).map((item) => [
    item.user.id,
    activityDistanceLabel(item, distancePreferences.mode),
  ]));
  const distanceForItem = (item: CruushLockableActivityItem | MutualCruushActivityItem) =>
    activityDistanceLabel(item, distancePreferences.mode, item.user ? mutualDistanceByUserId.get(item.user.id) : undefined);

  const handleIncomingAction = (item: CruushLockableActivityItem) => {
    if (!item.user) return;
    if (item.mutual) {
      void handleRevokeMutual(item.user);
      return;
    }
    const sentItem = activity?.sent.find((candidate) => candidate.user?.id === item.user?.id);
    if (sentItem) {
      void handleRevokeSent(sentItem);
      return;
    }
    void handleCruushBack(item);
  };

  const handleViewAction = (item: ProfileViewActivityItem) => {
    if (!item.user) return;
    if (mutualUserIds.has(item.user.id)) {
      void handleRevokeMutual(item.user);
      return;
    }
    const sentItem = activity?.sent.find((candidate) => candidate.user?.id === item.user?.id);
    if (sentItem) {
      void handleRevokeSent(sentItem);
      return;
    }
    void handleCruushBack(item);
  };

  const viewActionState = (item: ProfileViewActivityItem): CruushActionState => {
    if (!item.user) return 'available';
    if (mutualUserIds.has(item.user.id)) return 'mutual';
    if (sentUserIds.has(item.user.id)) return 'sent';
    if (pendingCruushUserIds.has(item.user.id)) return 'sending';
    return 'available';
  };

  const lockedIncomingCount = Math.max(0, (activity?.counts.incoming ?? 0) - (activity?.incoming.filter((item) => !item.locked).length ?? 0));
  const lockedViewsCount = Math.max(0, (activity?.counts.views ?? 0) - (activity?.views.filter((item) => !item.locked).length ?? 0));

  return (
    <div className={embedded ? 'min-h-full bg-[#050505] pb-6' : 'min-h-screen bg-[#050505] pb-[calc(7rem+env(safe-area-inset-bottom))]'}>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActivityTab)}>
        <AppPageHeader
          testId="cruush-activity-header"
          contentTestId="cruush-activity-header-content"
          contentClassName={embedded ? 'max-w-none' : ''}
          title="Cruushes"
          onBack={() => embedded && onClose ? onClose() : navigate(-1)}
          onClose={embedded ? onClose : undefined}
          closeLabel="Close Cruushes"
          bugButtonTestId="cruush-activity-bug-button-slot"
          actions={embedded && onOpenSettings ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
                    aria-label="Open Message permissions"
                    onClick={onOpenSettings}
                  >
                    <CruushIcon name="settings" className="h-5 w-5" />
                  </Button>
                ) : <Dialog open={matchSettingsOpen} onOpenChange={setMatchSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
                      aria-label="Open Message permissions"
                    >
                      <CruushIcon name="settings" className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    aria-describedby={undefined}
                    showCloseButton={false}
                    className="scrollbar-hide max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-lg border-white/10 bg-background pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                  >
                    <DialogTitle className="sr-only">Message permissions</DialogTitle>
                    <AppPageHeader
                      title="Message permissions"
                      onClose={() => setMatchSettingsOpen(false)}
                      closeLabel="Close Message permissions"
                      bugButtonTestId="message-permissions-bug-button-slot"
                      className="-mx-6 -mt-6"
                    />
                    <CruushMatchSettings embedded />
                  </DialogContent>
                </Dialog>}
        >
          <div
              className="mx-auto flex w-full max-w-[38rem] flex-col items-center space-y-3 text-center"
              data-testid="cruush-stats-tabs"
            >
              <div data-testid="cruush-count-grid" className="cruush-activity-count-grid grid w-full grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
                {(['incoming', 'sent', 'mutual', 'views'] as ActivityTab[]).map((tab) => (
                  <div key={tab} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-1 py-1.5 text-center sm:px-2">
                    <p className="truncate text-[9px] uppercase tracking-[0.08em] text-white/46 sm:text-[10px]">{tab}</p>
                    <p className="truncate text-sm tabular-nums text-white">{activity?.counts[tab] ?? 0}</p>
                  </div>
                ))}
              </div>

              <TabsList
                data-testid="cruush-tab-grid"
                className="cruush-activity-tab-grid grid h-auto w-full grid-cols-[repeat(4,minmax(0,1fr))] rounded-lg border border-white/10 bg-background/25 p-1 shadow-[0_20px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl"
              >
                <ActivityTabButton value="incoming" label="incoming" />
                <ActivityTabButton value="sent" label="sent" />
                <ActivityTabButton value="mutual" label="mutual" />
                <ActivityTabButton value="views" label="views" />
              </TabsList>
          </div>
        </AppPageHeader>

        {composeChooserOpen ? (
          <ComposeChoiceOverlay
            onClose={() => setComposeChooserOpen(false)}
            onStartDirect={() => {
              setComposeChooserOpen(false);
              setDirectComposerOpen(true);
            }}
            onStartGroup={openGroupComposer}
          />
        ) : null}

        {directComposerOpen ? (
          <MutualDirectOverlay
            mutuals={messageableMutuals}
            onClose={() => setDirectComposerOpen(false)}
            onMessage={openMessage}
            onOpenProfile={openProfile}
          />
        ) : null}

        <main className="mx-auto w-full max-w-2xl px-4 pt-2">
              {error ? (
                <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {loading ? (
                <LoadingCardSkeletons label="Loading cruush activity" />
              ) : null}

              {!loading && activity ? (
                <>
                  <TabsContent value="incoming" className="mt-0 space-y-4">
                    <UpgradeBanner count={lockedIncomingCount} label="have a cruush on you" surface="activity_incoming" onUpgrade={() => navigate(buildCruushPlusStorePath('activity_incoming', 'full_activity'))} />
                    <ActivitySurface empty={activity.incoming.length === 0} emptyText="No incoming cruushes yet.">
                      {activity.incoming.map((item) => (
                        <IncomingRow
                          key={item.id}
                          item={item}
                          distance={distanceForItem(item)}
                          sentCruush={Boolean(item.user && sentUserIds.has(item.user.id))}
                          pendingCruush={Boolean(item.user && pendingCruushUserIds.has(item.user.id))}
                          pinActionable={Boolean(item.user && validPinUserIds.has(item.user.id))}
                          onCruushAction={handleIncomingAction}
                          onOpenProfile={openProfile}
                          onMessage={openMessage}
                          onOpenMap={openMutualOnMap}
                          onDismiss={handleDismissIncoming}
                          dismissing={Boolean(item.user && clearingUserIds.has(item.user.id))}
                        />
                      ))}
                    </ActivitySurface>
                  </TabsContent>

                  <TabsContent value="sent" className="mt-0">
                    <ActivitySurface empty={activity.sent.length === 0} emptyText="No sent cruushes yet.">
                      {activity.sent.map((item) => (
                        <SentRow
                          key={item.id}
                          item={item}
                          distance={distanceForItem(item)}
                          pendingRevoke={Boolean(item.user && pendingRevokeUserIds.has(item.user.id))}
                          pinActionable={Boolean(item.user && validPinUserIds.has(item.user.id))}
                          onOpenProfile={openProfile}
                          onRevoke={handleRevokeSent}
                          onMessage={openMessage}
                          onOpenMap={openMutualOnMap}
                        />
                      ))}
                    </ActivitySurface>
                  </TabsContent>

                  <TabsContent value="mutual" className="mt-0">
                    <ActivitySurface empty={activity.mutual.length === 0} emptyText="No cruushes yet.">
                      {activity.mutual.map((item) => (
                        <MutualRow
                          key={item.id}
                          item={item}
                          distance={distanceForItem(item)}
                          pendingRevoke={pendingRevokeUserIds.has(item.user.id)}
                          pinActionable={validPinUserIds.has(item.user.id)}
                          onRevoke={() => void handleRevokeMutual(item.user)}
                          onOpenMap={openMutualOnMap}
                          onMessage={openMessage}
                          onOpenProfile={openProfile}
                        />
                      ))}
                    </ActivitySurface>
                  </TabsContent>

                  <TabsContent value="views" className="mt-0 space-y-4">
                    <UpgradeBanner count={lockedViewsCount} label="viewed your profile" surface="activity_views" onUpgrade={() => navigate(buildCruushPlusStorePath('activity_views', 'full_activity'))} />
                    <ActivitySurface empty={activity.views.length === 0} emptyText="No profile views yet.">
                      {activity.views.map((item) => (
                        <ViewRow
                          key={item.id}
                          item={item}
                          distance={distanceForItem(item)}
                          actionState={viewActionState(item)}
                          pinActionable={Boolean(item.user && validPinUserIds.has(item.user.id))}
                          onCruush={handleViewAction}
                          onOpenProfile={openProfile}
                          onMessage={openMessage}
                          onOpenMap={openMutualOnMap}
                          onRemove={handleRemoveView}
                          removing={Boolean(item.user && clearingUserIds.has(item.user.id))}
                        />
                      ))}
                    </ActivitySurface>
                  </TabsContent>
                </>
              ) : null}
        </main>
      </Tabs>
    </div>
  );
}

function ActivityTabButton({
  value,
  label,
}: {
  value: ActivityTab;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-10 min-w-0 rounded-md px-0.5 text-sm text-white/72 sm:px-2"
    >
      <span className="block min-w-0 truncate">{label}</span>
    </TabsTrigger>
  );
}

function ActivitySurface({
  children,
  empty,
  emptyText,
}: {
  children: ReactNode;
  empty: boolean;
  emptyText: string;
}) {
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-card/60 px-5 py-10 text-center text-sm text-white/58">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {children}
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
    <div className="scrollbar-hide fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background/95 px-4 py-6 text-white backdrop-blur-md">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/52">new chat</p>
            <h3 className="text-2xl">Start a conversation</h3>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close chat options" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-lg border border-white/10 bg-card/80 p-4 text-left transition hover:bg-white/8"
            onClick={onStartDirect}
          >
            <span className="block text-base text-white">Start chat with mutual</span>
            <span className="mt-1 block text-sm text-white/58">Pick one mutual and open a direct chat.</span>
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-white/10 bg-card/80 p-4 text-left transition hover:bg-white/8"
            onClick={onStartGroup}
          >
            <span className="block text-base text-white">Create group message</span>
            <span className="mt-1 block text-sm text-white/58">Choose cruushes for a group thread.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MutualDirectOverlay({
  mutuals,
  onClose,
  onMessage,
  onOpenProfile,
}: {
  mutuals: MutualCruushActivityItem[];
  onClose: () => void;
  onMessage: (userId: string) => void;
  onOpenProfile: (userId: string, state?: { distance?: string; lastActive?: string }) => void;
}) {
  const distancePreferences = useDistancePreferences();
  return (
    <div className="fixed inset-0 z-40 bg-background/95 px-4 py-6 text-white backdrop-blur-md">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/52">mutual chat</p>
            <h3 className="text-2xl">Choose a mutual</h3>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close mutual picker" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {mutuals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/12 bg-card/60 p-5 text-sm text-white/58">
            No cruushes available.
          </div>
        ) : (
          <div className="space-y-2">
            {mutuals.map((item) => (
              <CruushesProfileCard
                key={item.user.id}
                user={item.user}
                metadata={<span className="text-xs text-white/62">{activityDistanceLabel(item, distancePreferences.mode)}</span>}
                mutual
                onOpenProfile={() => onOpenProfile(item.user.id)}
                onSelect={() => onMessage(item.user.id)}
                selectLabel={`Message ${item.user.name}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
