import { useAccountPreference } from '../lib/accountPreferences';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { ConversationThread } from '../lib/messagesApi';
import { deleteClub, getClubs, type ClubDirectoryRecord } from '../lib/clubsApi';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import HeartPhoto from './HeartPhoto';
import { CruushIcon } from './CruushIconImage';
import UserActivityCapsule from './UserActivityCapsule';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

function formatRelativeTime(isoTimestamp: string) {
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

type ClubView = 'mine' | 'browse';

type ClubDirectoryPanelProps = {
  query: string;
  conversations: ConversationThread[];
  onOpenConversation: (conversationId: string) => void;
  onClubDeleted: (conversationId: string | null) => void;
};

export default function ClubDirectoryPanel({
  query,
  conversations,
  onOpenConversation,
  onClubDeleted,
}: ClubDirectoryPanelProps) {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubDirectoryRecord[]>([]);
  const [view, setView] = useAccountPreference<ClubView>('clubs.view', 'mine');
  const [browseSort, setBrowseSort] = useAccountPreference<'recent' | 'nearby'>('clubs.sort', 'recent');
  const [loading, setLoading] = useState(false);
  const [deletingClubId, setDeletingClubId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);
    void getClubs(query, view === 'browse' ? browseSort : 'recent')
      .then((items) => {
        if (active) setClubs(items);
      })
      .catch((loadError) => {
        if (active) {
          setClubs([]);
          setError(loadError instanceof Error ? loadError.message : 'Covens could not load.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [browseSort, query, view]);

  const conversationsById = useMemo(() => new Map(
    conversations
      .filter((conversation) => conversation.clubId)
      .map((conversation) => [conversation.id, conversation]),
  ), [conversations]);
  const myClubs = clubs.filter((club) => Boolean(club.conversationId));
  const visibleClubs = view === 'mine' ? myClubs : clubs;

  const openClub = (club: ClubDirectoryRecord) => {
    if (club.conversationId) {
      onOpenConversation(club.conversationId);
      return;
    }

    navigate(`/clubs/${club.id}`);
  };

  const handleDeleteClub = async (club: ClubDirectoryRecord) => {
    if (deletingClubId || !['owner', 'admin'].includes(club.currentUserRole ?? '')) return;
    if (!window.confirm(`Delete ${club.title} Coven for everyone? This removes the Coven and its messages for all members.`)) return;

    setDeletingClubId(club.id);
    setError(null);
    try {
      await deleteClub(club.id);
      setClubs((current) => current.filter((item) => item.id !== club.id));
      onClubDeleted(club.conversationId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete Coven.');
    } finally {
      setDeletingClubId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div
        aria-label="Coven views"
        className="grid h-auto w-full grid-cols-2 rounded-lg border border-white/10 bg-background/25 p-1"
        role="tablist"
      >
        {([
          ['mine', 'My Covens'],
          ['browse', 'Browse Covens'],
        ] as const).map(([value, label]) => (
          <button
            aria-selected={view === value}
            className="h-10 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-white/72 transition-[background-color,box-shadow] hover:bg-white/[0.08] data-[state=active]:bg-white/[0.10]"
            data-state={view === value ? 'active' : 'inactive'}
            key={value}
            onClick={() => setView(value)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'browse' ? (
        <div className="space-y-3">
          <Select value={browseSort} onValueChange={(value) => setBrowseSort(value as 'recent' | 'nearby')}>
            <SelectTrigger aria-label="Sort Browse Covens" className="h-11 w-full rounded-2xl border-white/12 bg-card/82 px-4 text-sm text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" className="rounded-2xl border-white/12 bg-card/95 p-1 text-foreground">
              <SelectItem value="recent">Recently active</SelectItem>
              <SelectItem value="nearby">Near me</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading Covens...</p> : null}
      {error ? <p className="py-8 text-center text-sm text-destructive" role="alert">{error}</p> : null}
      {!loading && !error && visibleClubs.length === 0 ? (
        <Card className="gap-0 border-white/10 bg-card/70 p-8 text-center">
          <p className="text-muted-foreground">{view === 'mine' ? "You haven't joined any Covens." : 'No Covens found.'}</p>
        </Card>
      ) : null}
      {visibleClubs.map((club) => {
        const conversation = club.conversationId ? conversationsById.get(club.conversationId) : undefined;
        const pendingRequests = club.pendingJoinRequestCount ?? 0;
        const memberLabel = `${club.memberCount} ${club.memberCount === 1 ? 'member' : 'members'}`;
        const lastMessage = conversation?.lastMessage?.trim();
        const visibleLastMessage = lastMessage?.toLowerCase() === '[encrypted]' ? null : lastMessage;
        const canDelete = ['owner', 'admin'].includes(club.currentUserRole ?? '');

        return (
          <UserActivityCapsule
            key={club.id}
            testId="club-directory-card"
            heart={(
              <HeartPhoto
                className="w-20 shrink-0"
                label={`${club.title} Coven`}
                masked={false}
                hideDefaultMark
                onClick={() => openClub(club)}
                photo={null}
                theme={club.conversationId ? 'mutual' : 'nearby'}
                userId={club.id}
                fallback={<CruushIcon name="messages" className="size-7 opacity-80" />}
              />
            )}
            name={club.title}
            onOpenIdentity={() => openClub(club)}
            identityAdornment={pendingRequests > 0 ? (
              <Badge variant="outline" className="border-primary/45 bg-primary/10 text-primary">
                {pendingRequests} new {pendingRequests === 1 ? 'request' : 'requests'}
              </Badge>
            ) : null}
            metadata={(
              <button type="button" className="flex h-11 min-w-0 flex-col justify-center gap-0.5 text-left text-xs leading-snug text-white/62 sm:text-sm" onClick={(event) => { event.stopPropagation(); openClub(club); }}>
                <span className="truncate">{formatRelativeTime(conversation?.updatedAt ?? club.lastActiveAt)}</span>
                <span className="truncate">{memberLabel}</span>
              </button>
            )}
            actions={(
              <Button
                aria-label={`Open ${club.title} Coven`}
                className="cruush-action-sheen size-10 shrink-0 rounded-full border-0 text-white hover:brightness-110"
                onClick={(event) => { event.stopPropagation(); openClub(club); }}
                size="icon"
                style={{ background: 'var(--cruush-gradient)' }}
                type="button"
                variant="secondary"
              >
                {club.conversationId
                  ? <CruushIcon name="send" className="h-6 w-6" variant="white" />
                  : <ChevronRight className="h-6 w-6" />}
              </Button>
            )}
            cornerBadge={canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${club.title} Coven for everyone`}
                title={`Delete ${club.title} Coven for everyone`}
                disabled={deletingClubId === club.id}
                onClick={(event) => { event.stopPropagation(); void handleDeleteClub(club); }}
                className="size-8 text-white/55 hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
            mutual={Boolean(club.conversationId)}
            onSelect={() => openClub(club)}
            selectLabel={`Open ${club.title} Coven`}
            content={(
              <div className="space-y-1.5">
                {club.summary ? <p className="line-clamp-2 text-sm text-muted-foreground">{club.summary}</p> : null}
                {visibleLastMessage ? <p className="truncate text-base text-white/72">{visibleLastMessage}</p> : null}
              </div>
            )}
            cornerAction={(
              <>
                <div className="mr-auto flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1 text-sm text-white/62">
                  {club.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                </div>
              </>
            )}
          />
        );
      })}
    </div>
  );
}
