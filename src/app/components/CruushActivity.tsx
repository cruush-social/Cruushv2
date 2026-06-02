import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Eye,
  Heart,
  HeartHandshake,
  List,
  Lock,
  Map,
  MapPin,
  MessageCircle,
  Send,
  Settings,
  Sparkles,
} from 'lucide-react';
import HeartPhoto from './HeartPhoto';
import MapView, { type MapMarker } from './MapView';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { getMyCruushActivity, sendCruush, type CruushActivity, type CruushLockableActivityItem, type MutualCruushActivityItem, type ProfileViewActivityItem } from '../lib/cruushApi';
import { openConversationOrInbox } from '../lib/openConversation';
import cruushLogo from '../assets/brand/cruush-logo.png';

type ActivityTab = 'incoming' | 'sent' | 'mutual' | 'views';
type MutualMode = 'list' | 'map';

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
    <span className="rounded-full border border-primary/20 bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-primary">
      {children}
    </span>
  );
}

function LockedHeart({ label = 'Locked profile preview' }: { label?: string }) {
  return (
    <div className="relative w-20 shrink-0">
      <HeartPhoto
        className="w-20 blur-[2px]"
        label={label}
        fallback={<Heart className="h-7 w-7 text-white/18" />}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/58 text-white">
          <Lock className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function PersonHeart({ item, fallbackLabel }: { item: CruushLockableActivityItem | ProfileViewActivityItem; fallbackLabel: string }) {
  if (item.locked || !item.user) {
    return <LockedHeart label={fallbackLabel} />;
  }

  return (
    <HeartPhoto
      className="w-20 shrink-0"
      label={`${item.user.name} preview`}
      photo={item.user.photo}
      fallback={<Heart className="h-7 w-7 text-white/22" />}
    />
  );
}

function UpgradeBanner({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
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
          <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm text-white">{pluralize(count, 'more person', 'more people')} {resolvedLabel}</p>
            <p className="mt-1 text-xs text-white/68">Upgrade to cruush+ to see them.</p>
          </div>
        </div>
        <Button
          type="button"
          className="h-10 shrink-0 rounded-lg px-4 text-white"
          style={{ background: 'var(--cruush-gradient)' }}
        >
          cruush+
        </Button>
      </div>
    </div>
  );
}

function IncomingRow({
  item,
  onCruushBack,
  onOpenProfile,
}: {
  item: CruushLockableActivityItem;
  onCruushBack: (item: CruushLockableActivityItem) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const unlocked = !item.locked && item.user;

  return (
    <div className="flex items-center gap-4 border-b border-white/8 py-3 last:border-b-0">
      <PersonHeart item={item} fallbackLabel="Locked incoming cruush" />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        disabled={!unlocked}
        onClick={() => unlocked && onOpenProfile(item.user!.id)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base text-white">{unlocked ? item.user.name : 'Someone new'}</p>
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
            className="h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/14"
            aria-label={`Cruush ${item.user.name} back`}
            onClick={() => onCruushBack(item)}
          >
            <Heart className="h-5 w-5 fill-current text-primary" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SentRow({ item, onOpenProfile }: { item: CruushLockableActivityItem; onOpenProfile: (userId: string) => void }) {
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
        className="w-16 shrink-0"
        label={`${item.user.name} preview`}
        photo={item.user.photo}
        fallback={<Heart className="h-6 w-6 text-white/22" />}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base text-white">{item.user.name}</p>
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
  onMessage,
  onOpenProfile,
}: {
  item: MutualCruushActivityItem;
  onMessage: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-white/8 py-3 last:border-b-0">
      <button type="button" className="shrink-0" onClick={() => onOpenProfile(item.user.id)}>
        <HeartPhoto
          className="w-20"
          label={`${item.user.name} preview`}
          photo={item.user.photo}
          fallback={<HeartHandshake className="h-7 w-7 text-white/24" />}
        />
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenProfile(item.user.id)}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base text-white">{item.user.name}</p>
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
          <MessageCircle className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-11 w-11 rounded-full bg-primary/18 text-primary hover:bg-primary/24"
          aria-label={`Open ${item.user.name} on map`}
          onClick={() => onOpenProfile(item.user.id)}
        >
          <MapPin className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

function ViewRow({ item, onOpenProfile }: { item: ProfileViewActivityItem; onOpenProfile: (userId: string) => void }) {
  const unlocked = !item.locked && item.user;

  return (
    <div className="flex items-center gap-4 border-b border-white/8 py-3 last:border-b-0">
      <PersonHeart item={item} fallbackLabel="Locked profile view" />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        disabled={!unlocked}
        onClick={() => unlocked && onOpenProfile(item.user!.id)}
      >
        <p className="truncate text-base text-white">{unlocked ? item.user.name : 'Someone new'}</p>
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
          <Eye className="h-5 w-5" />
        </Button>
      ) : null}
    </div>
  );
}

export default function CruushActivity() {
  const navigate = useNavigate();
  const [activity, setActivity] = useState<CruushActivity | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityTab>('incoming');
  const [mutualMode, setMutualMode] = useState<MutualMode>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleCruushBack = async (item: CruushLockableActivityItem) => {
    if (!item.user) {
      return;
    }

    try {
      await sendCruush(item.user.id, {
        name: item.user.name,
        pronouns: item.user.pronouns,
        photo: item.user.photo,
      });
      await fetchCruushActivity();
    } catch (cruushError) {
      console.error('Error sending cruush:', cruushError);
      setError(cruushError instanceof Error ? cruushError.message : 'Failed to send cruush.');
    }
  };

  const openProfile = (userId: string) => navigate(`/profile/${userId}`);
  const openMessage = (userId: string) => {
    void openConversationOrInbox(navigate, userId);
  };

  const mutualMarkers = useMemo<MapMarker[]>(() => {
    return (activity?.mutual ?? [])
      .filter((item) => item.coordinates)
      .map((item) => ({
        id: item.user.id,
        displayName: item.user.name,
        approximateLatitude: item.coordinates!.lat,
        approximateLongitude: item.coordinates!.lng,
        lastActiveLabel: item.lastActive,
        photo: item.user.photo,
        relationship: {
          kind: 'mutual_cruush',
          precision: item.coordinates!.precision,
          canMessage: item.canMessage,
        },
      }));
  }, [activity?.mutual]);

  const lockedIncomingCount = Math.max(0, (activity?.counts.incoming ?? 0) - (activity?.incoming.filter((item) => !item.locked).length ?? 0));
  const lockedViewsCount = Math.max(0, (activity?.counts.views ?? 0) - (activity?.views.filter((item) => !item.locked).length ?? 0));

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-background/92 px-4 pb-3 pt-4 backdrop-blur-md">
        <div className="mx-auto max-w-3xl">
          <div className="grid grid-cols-[44px_1fr_44px] items-center">
            <div />
            <div className="flex justify-center">
              <img alt="cruush" className="h-14 w-auto object-contain" src={cruushLogo} draggable={false} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-white/78 hover:bg-white/10"
              aria-label="Open settings"
              onClick={() => navigate('/settings')}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-2">
            <h1 className="text-xl text-white">your cruushes</h1>
            <p className="text-xs text-white/58">relationships, interest & activity</p>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActivityTab)} className="mt-4">
            <TabsList className="grid h-auto w-full grid-cols-4 rounded-none border-b border-white/10 bg-transparent p-0">
              <ActivityTabButton value="incoming" icon={Heart} label="incoming" count={activity?.counts.incoming ?? 0} />
              <ActivityTabButton value="sent" icon={Send} label="sent" count={activity?.counts.sent ?? 0} />
              <ActivityTabButton value="mutual" icon={HeartHandshake} label="mutual" count={activity?.counts.mutual ?? 0} />
              <ActivityTabButton value="views" icon={Eye} label="views" count={activity?.counts.views ?? 0} />
            </TabsList>

            <div className="mx-auto max-w-3xl pt-4">
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
                    <UpgradeBanner count={lockedIncomingCount} label="have a cruush on you" />
                    <ActivitySurface empty={activity.incoming.length === 0} emptyText="No incoming cruushes yet.">
                      {activity.incoming.map((item) => (
                        <IncomingRow key={item.id} item={item} onCruushBack={handleCruushBack} onOpenProfile={openProfile} />
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

                  <TabsContent value="mutual" className="mt-0 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg text-white">your mutual cruushes</h2>
                        <p className="text-sm text-white/58">People you are mutually into.</p>
                      </div>
                      <div className="flex rounded-xl border border-white/10 bg-white/[0.035] p-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={mutualMode === 'list' ? 'secondary' : 'ghost'}
                          className="h-9 rounded-lg px-3"
                          onClick={() => setMutualMode('list')}
                        >
                          <List className="mr-2 h-4 w-4" />
                          List
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={mutualMode === 'map' ? 'secondary' : 'ghost'}
                          className="h-9 rounded-lg px-3"
                          onClick={() => setMutualMode('map')}
                        >
                          <Map className="mr-2 h-4 w-4" />
                          Map
                        </Button>
                      </div>
                    </div>

                    {mutualMode === 'list' ? (
                      <ActivitySurface empty={activity.mutual.length === 0} emptyText="No mutual cruushes yet.">
                        {activity.mutual.map((item) => (
                          <MutualRow key={item.id} item={item} onMessage={openMessage} onOpenProfile={openProfile} />
                        ))}
                      </ActivitySurface>
                    ) : (
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
                        <div className="h-[430px] min-h-[430px]">
                          <MapView
                            markers={mutualMarkers}
                            onPinClick={(marker) => openProfile(marker.id)}
                            onMapClick={() => {}}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-2xl border border-primary/14 bg-primary/12 px-4 py-4 text-left"
                      onClick={() => navigate('/map?mode=mutuals')}
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/22 text-primary">
                          <MapPin className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-base text-primary">See mutual cruushes on the map</span>
                          <span className="mt-1 block text-sm text-white/64">Opens map with mutual cruushes only.</span>
                        </span>
                      </span>
                      <ArrowRight className="h-5 w-5 text-primary" />
                    </button>
                  </TabsContent>

                  <TabsContent value="views" className="mt-0 space-y-4">
                    <UpgradeBanner count={lockedViewsCount} label="viewed your profile" />
                    <ActivitySurface empty={activity.views.length === 0} emptyText="No profile views yet.">
                      {activity.views.map((item) => (
                        <ViewRow key={item.id} item={item} onOpenProfile={openProfile} />
                      ))}
                    </ActivitySurface>
                  </TabsContent>
                </>
              ) : null}
            </div>
          </Tabs>
        </div>
      </header>
    </div>
  );
}

function ActivityTabButton({
  value,
  icon: Icon,
  label,
  count,
}: {
  value: ActivityTab;
  icon: typeof Heart;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className="relative min-h-[4.5rem] rounded-none border-b-2 border-transparent bg-transparent text-white/64 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
    >
      <span className="flex flex-col items-center gap-1">
        <span className="relative">
          <Icon className="h-6 w-6" />
          {count > 0 ? (
            <span className="absolute -right-3 -top-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-white">
              {count}
            </span>
          ) : null}
        </span>
        <span className="text-xs">{label}</span>
      </span>
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
    <div className="rounded-2xl border border-white/10 bg-card/70 px-4">
      {children}
    </div>
  );
}
