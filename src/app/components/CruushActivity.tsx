import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Lock,
  Plus,
  X,
} from 'lucide-react';
import HeartPhoto from './HeartPhoto';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { getMyCruushActivity, sendCruush, type CruushActivity, type CruushLockableActivityItem, type MutualCruushActivityItem, type ProfileViewActivityItem } from '../lib/cruushApi';
import { DEBUG_CRUUSH_PLUS_EVENT } from '../lib/debugApi';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';
import { addCruushChangedListener } from '../lib/cruushEvents';
import { handleCruushSendSuccess, notifyCruushSendError } from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';

type ActivityTab = 'incoming' | 'sent' | 'mutual' | 'views';

const activityHeartClassName = 'w-16 shrink-0';

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
    <span className="rounded-md border border-primary/20 bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-primary">
      {children}
    </span>
  );
}

function LockedHeart({ label = 'Locked profile preview' }: { label?: string }) {
  return (
    <div className={`relative ${activityHeartClassName}`}>
      <HeartPhoto
        className="w-16 blur-[2px]"
        label={label}
        masked
        theme="mutual"
        fallback={<CruushIcon name="cruush" className="h-6 w-6 opacity-20" />}
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

  return (
    <HeartPhoto
      className={activityHeartClassName}
      label={`${item.user.name} preview`}
      masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit)}
      photo={item.user.photo}
      userId={item.user.id}
      theme={'mutual' in item && item.mutual ? 'mutual' : 'nearby'}
      onClick={onOpenProfile ? () => onOpenProfile(item.user!.id) : undefined}
      fallback={<CruushIcon name="cruush" className="h-6 w-6 opacity-25" />}
    />
  );
}

function UpgradeBanner({
  count,
  label,
  onUpgrade,
}: {
  count: number;
  label: string;
  onUpgrade: () => void;
}) {
  if (count <= 0) {
    return null;
  }

  const resolvedLabel = count === 1 && label.startsWith('have ')
    ? `has ${label.slice('have '.length)}`
    : label;

  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/18 bg-primary/10 px-4 py-4">
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
          onClick={onUpgrade}
        >
          <CruushPlusWord />
        </Button>
      </div>
    </div>
  );
}

function IncomingRow({
  item,
  onCruushBack,
  pendingCruush = false,
  onOpenProfile,
}: {
  item: CruushLockableActivityItem;
  onCruushBack: (item: CruushLockableActivityItem) => void;
  pendingCruush?: boolean;
  onOpenProfile: (userId: string) => void;
}) {
  const unlocked = !item.locked && item.user;

  return (
    <div className="flex items-center gap-4 border-b border-white/8 py-3 last:border-b-0">
      <PersonHeart item={item} fallbackLabel="Locked incoming cruush" onOpenProfile={onOpenProfile} />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        disabled={!unlocked}
        onClick={() => unlocked && onOpenProfile(item.user!.id)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base text-white">{unlocked ? item.user.name : 'Someone new'}</p>
          {unlocked ? <CruushBadge badges={item.user.badges} compact /> : null}
          {item.mutual ? <ActivityBadge>Mutual</ActivityBadge> : null}
        </div>
        <p className="mt-1 text-sm text-white/64">
          {unlocked ? `${item.user.pronouns || 'Ask me'} - ${formatRelativeTime(item.createdAt)}` : `Has a cruush on you - ${formatRelativeTime(item.createdAt)}`}
        </p>
        {item.locked ? (
          <p className="mt-1 text-xs text-primary">Upgrade to view</p>
        ) : null}
      </button>
      {unlocked ? (
        <div className="flex gap-2">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className={[
              'h-11 w-11 rounded-full text-white',
              item.mutual || pendingCruush
                ? 'bg-white/8 opacity-65 grayscale hover:bg-white/8'
                : 'bg-white/10 hover:bg-white/14',
            ].join(' ')}
            aria-label={item.mutual ? `Already mutual with ${item.user.name}` : pendingCruush ? `sending cruush to ${item.user.name}` : `cruush ${item.user.name} back`}
            disabled={item.mutual || pendingCruush}
            onClick={() => onCruushBack(item)}
          >
            <CruushIcon name="cruush" className={`h-6 w-6 ${item.mutual || pendingCruush ? 'opacity-45' : ''}`} variant={item.mutual || pendingCruush ? 'white' : 'colored'} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SentRow({ item, onOpenProfile }: { item: CruushLockableActivityItem; onOpenProfile: (userId: string) => void }) {
  const dlModeActive = useDlMode();
  if (!item.user) {
    return null;
  }

  return (
    <button
      type="button"
      className="flex w-full items-center gap-4 border-b border-white/8 py-3 text-left last:border-b-0"
      onClick={() => onOpenProfile(item.user!.id)}
    >
      <HeartPhoto
        className={activityHeartClassName}
        label={`${item.user.name} preview`}
        masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit)}
        photo={item.user.photo}
        userId={item.user.id}
        theme={item.mutual ? 'mutual' : 'nearby'}
        fallback={<CruushIcon name="cruush" className="h-6 w-6 opacity-25" />}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base text-white">{item.user.name}</p>
          <CruushBadge badges={item.user.badges} compact />
          <ActivityBadge>{item.mutual ? 'Mutual' : 'Pending'}</ActivityBadge>
        </div>
        <p className="mt-1 text-sm text-white/62">{item.user.pronouns || 'Ask me'} - {formatRelativeTime(item.createdAt)}</p>
      </div>
      <span className="rounded-lg border border-primary/35 px-3 py-1 text-sm text-primary">
        {item.mutual ? 'mutual' : 'pending'}
      </span>
    </button>
  );
}

function MutualRow({
  item,
  onOpenMap,
  onMessage,
  onOpenProfile,
}: {
  item: MutualCruushActivityItem;
  onOpenMap: (userId: string) => void;
  onMessage: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const dlModeActive = useDlMode();
  return (
    <div className="flex items-center gap-4 border-b border-white/8 py-3 last:border-b-0">
      <button type="button" className={activityHeartClassName} onClick={() => onOpenProfile(item.user.id)}>
        <HeartPhoto
          className={activityHeartClassName}
          label={`${item.user.name} preview`}
          masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit)}
          photo={item.user.photo}
          userId={item.user.id}
          theme="mutual"
          fallback={<CruushIcon name="cruush" className="h-6 w-6 opacity-30" />}
        />
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenProfile(item.user.id)}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base text-white">{item.user.name}</p>
          <CruushBadge badges={item.user.badges} compact />
          {item.canRevealPreciseLocation ? <ActivityBadge>Precise</ActivityBadge> : null}
        </div>
        <p className="mt-1 text-sm text-white/62">
          {item.mutualCrowds.length > 0 ? pluralize(item.mutualCrowds.length, 'mutual Crowd') : 'Mutual cruush'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-emerald-400">{item.distance}</span>
          <span className="text-white/52">{item.lastActive}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...item.mutualCrowds, ...item.vibes].slice(0, 3).map((tag) => (
            <ActivityBadge key={tag}>{tag}</ActivityBadge>
          ))}
        </div>
      </button>
      <div className="flex gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          disabled={!item.canMessage}
          className="h-11 w-11 rounded-full bg-primary/18 text-primary hover:bg-primary/24 disabled:opacity-45"
          aria-label={`Message ${item.user.name}`}
          onClick={() => onMessage(item.user.id)}
        >
          <CruushIcon name="messages" className="h-5 w-5" variant="colored" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-11 w-11 rounded-full bg-primary/18 text-primary hover:bg-primary/24"
          aria-label={`Open ${item.user.name} on map`}
          onClick={() => onOpenMap(item.user.id)}
        >
          <CruushIcon name="map" className="h-5 w-5" variant="colored" />
        </Button>
      </div>
    </div>
  );
}

function ViewRow({ item, onOpenProfile }: { item: ProfileViewActivityItem; onOpenProfile: (userId: string) => void }) {
  const unlocked = !item.locked && item.user;

  return (
    <div className="flex items-center gap-4 border-b border-white/8 py-3 last:border-b-0">
      <PersonHeart item={item} fallbackLabel="Locked profile view" onOpenProfile={onOpenProfile} />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        disabled={!unlocked}
        onClick={() => unlocked && onOpenProfile(item.user!.id)}
      >
        <p className="truncate text-base text-white">{unlocked ? item.user.name : 'Someone new'}</p>
        {unlocked ? <CruushBadge badges={item.user.badges} compact /> : null}
        <p className="mt-1 text-sm text-white/62">
          {unlocked ? `Viewed you ${formatRelativeTime(item.viewedAt)}` : `Viewed your profile - ${formatRelativeTime(item.viewedAt)}`}
        </p>
        {item.locked ? <p className="mt-1 text-xs text-primary">Upgrade to view</p> : null}
      </button>
      {unlocked ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/14"
          aria-label={`Open ${item.user.name} profile`}
          onClick={() => onOpenProfile(item.user!.id)}
        >
          <CruushIcon name="visibility" className="h-5 w-5" variant="white" />
        </Button>
      ) : null}
    </div>
  );
}

export default function CruushActivity() {
  const navigate = useNavigate();
  const [activity, setActivity] = useState<CruushActivity | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityTab>('incoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCruushUserIds, setPendingCruushUserIds] = useState<Set<string>>(() => new Set());
  const [composeChooserOpen, setComposeChooserOpen] = useState(false);
  const [directComposerOpen, setDirectComposerOpen] = useState(false);

  const fetchCruushActivity = async () => {
    setError(null);
    try {
      setActivity(await getMyCruushActivity());
    } catch (fetchError) {
      console.error('Error fetching cruush activity:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load cruush activity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCruushActivity();
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

  const openProfile = (userId: string) => navigate(`/profile/${userId}`);
  const openMutualOnMap = (userId: string) => navigate(`/map?mode=mutuals&focusUserId=${encodeURIComponent(userId)}`);
  const openMessage = (userId: string) => {
    setDirectComposerOpen(false);
    void openConversationOrInbox(navigate, userId);
  };
  const openGroupComposer = () => {
    setComposeChooserOpen(false);
    navigate('/messages?compose=group');
  };

  const messageableMutuals = (activity?.mutual ?? []).filter((item) => item.canMessage !== false);

  const lockedIncomingCount = Math.max(0, (activity?.counts.incoming ?? 0) - (activity?.incoming.filter((item) => !item.locked).length ?? 0));
  const lockedViewsCount = Math.max(0, (activity?.counts.views ?? 0) - (activity?.views.filter((item) => !item.locked).length ?? 0));

  return (
    <div className="min-h-screen bg-[#050505] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActivityTab)}>
        <header data-testid="cruush-activity-header" className="sticky top-0 z-20 border-b border-white/10 bg-black/88 px-4 pb-4 pt-4 shadow-[0_20px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <div className="mx-auto w-full max-w-2xl space-y-4">
            <div className="grid grid-cols-[84px_minmax(0,1fr)_84px] items-center gap-2">
              <div className="flex items-center justify-start">
                <Button
                  type="button"
                  size="icon"
                  className="rounded-full text-white"
                  aria-label="New cruush chat"
                  title="New cruush chat"
                  onClick={() => setComposeChooserOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-center">
                <h1 className="text-2xl text-white sm:text-3xl">Activity</h1>
              </div>
              <div className="flex items-center justify-end gap-2">
                <div data-testid="cruush-activity-bug-button-slot" ref={registerBugButtonSlot} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-white/78 hover:bg-white/10"
                  aria-label="Open cruush match settings"
                  onClick={() => navigate('/cruush/settings')}
                >
                  <CruushIcon name="settings" className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div data-testid="cruush-count-grid" className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
              {(['incoming', 'sent', 'mutual', 'views'] as ActivityTab[]).map((tab) => (
                <div key={tab} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center">
                  <p className="truncate text-[9px] uppercase tracking-[0.08em] text-white/46 sm:text-[10px]">{tab}</p>
                  <p className="truncate text-sm tabular-nums text-white">{activity?.counts[tab] ?? 0}</p>
                </div>
              ))}
            </div>

            <TabsList
              data-testid="cruush-tab-grid"
              className="grid h-auto w-full grid-cols-[repeat(4,minmax(0,1fr))] rounded-lg border border-white/10 bg-background/25 p-1 shadow-[0_20px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl"
            >
              <ActivityTabButton value="incoming" label="incoming" />
              <ActivityTabButton value="sent" label="sent" />
              <ActivityTabButton value="mutual" label="mutual" />
              <ActivityTabButton value="views" label="views" />
            </TabsList>
          </div>
        </header>

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

        <main className="mx-auto w-full max-w-2xl px-4 pt-4">
              {error ? (
                <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {loading ? (
                <div className="p-6 text-sm text-white/60">Loading cruush activity...</div>
              ) : null}

              {!loading && activity ? (
                <>
                  <TabsContent value="incoming" className="mt-0 space-y-4">
                    <UpgradeBanner count={lockedIncomingCount} label="have a cruush on you" onUpgrade={() => navigate('/rewards')} />
                    <ActivitySurface empty={activity.incoming.length === 0} emptyText="No incoming cruushes yet.">
                      {activity.incoming.map((item) => (
                        <IncomingRow
                          key={item.id}
                          item={item}
                          pendingCruush={Boolean(item.user && pendingCruushUserIds.has(item.user.id))}
                          onCruushBack={handleCruushBack}
                          onOpenProfile={openProfile}
                        />
                      ))}
                    </ActivitySurface>
                  </TabsContent>

                  <TabsContent value="sent" className="mt-0">
                    <ActivitySurface empty={activity.sent.length === 0} emptyText="No sent cruushes yet.">
                      {activity.sent.map((item) => (
                        <SentRow key={item.id} item={item} onOpenProfile={openProfile} />
                      ))}
                    </ActivitySurface>
                  </TabsContent>

                  <TabsContent value="mutual" className="mt-0">
                    <ActivitySurface empty={activity.mutual.length === 0} emptyText="No mutual cruushes yet.">
                      {activity.mutual.map((item) => (
                        <MutualRow key={item.id} item={item} onOpenMap={openMutualOnMap} onMessage={openMessage} onOpenProfile={openProfile} />
                      ))}
                    </ActivitySurface>
                  </TabsContent>

                  <TabsContent value="views" className="mt-0 space-y-4">
                    <UpgradeBanner count={lockedViewsCount} label="viewed your profile" onUpgrade={() => navigate('/rewards')} />
                    <ActivitySurface empty={activity.views.length === 0} emptyText="No profile views yet.">
                      {activity.views.map((item) => (
                        <ViewRow key={item.id} item={item} onOpenProfile={openProfile} />
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
      className="relative min-w-0 h-10 rounded-md border border-transparent bg-transparent px-2 text-sm text-white/72"
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
      <div className="rounded-lg border border-dashed border-white/10 bg-card/60 px-5 py-10 text-center text-sm text-white/58">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-white/10 bg-black/72 px-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
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
    <div className="fixed inset-0 z-40 bg-background/95 px-4 py-6 text-white backdrop-blur-md">
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
            <span className="mt-1 block text-sm text-white/58">Pick one mutual cruush and open a direct chat.</span>
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-white/10 bg-card/80 p-4 text-left transition hover:bg-white/8"
            onClick={onStartGroup}
          >
            <span className="block text-base text-white">Create group message</span>
            <span className="mt-1 block text-sm text-white/58">Choose mutual cruushes for a group thread.</span>
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
  onOpenProfile: (userId: string) => void;
}) {
  const dlModeActive = useDlMode();
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
            No mutual cruushes available.
          </div>
        ) : (
          <div className="space-y-2">
            {mutuals.map((item) => (
              <button
                key={item.user.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-card/70 p-3 text-left transition hover:bg-white/8"
                onClick={() => onMessage(item.user.id)}
              >
                <HeartPhoto
                  className="w-14 shrink-0"
                  label={`${item.user.name} avatar`}
                  masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit)}
                  photo={item.user.photo}
                  userId={item.user.id}
                  onClick={() => onOpenProfile(item.user.id)}
                  fallback={<CruushIcon name="cruush" className="h-5 w-5 opacity-25" />}
                />
                <span className="min-w-0">
                  <span className="block truncate text-white">{item.user.name}</span>
                  <span className="block text-xs text-white/52">{item.distance}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
