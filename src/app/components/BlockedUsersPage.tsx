import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from '../lib/toast';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import AppPageHeader from './AppPageHeader';
import { getBlockedUsers, unblockUser, type BlockedUser } from '../lib/blockApi';
import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';

function formatBlockedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Blocked';
  }

  return `Blocked ${date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export default function BlockedUsersPage() {
  const navigate = useNavigate();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);
  const dlModeActive = useDlMode();

  useEffect(() => {
    let active = true;

    setLoading(true);
    getBlockedUsers()
      .then((data) => {
        if (!active) {
          return;
        }

        setBlockedUsers(Array.isArray(data.blockedUsers) ? data.blockedUsers : []);
        setError(null);
      })
      .catch((loadError) => {
        console.error('Error loading blocked users:', loadError);
        if (active) {
          setError('Unable to load blocked users.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleUnblock = async (blockedUser: BlockedUser) => {
    setUnblockingUserId(blockedUser.userId);

    try {
      await unblockUser(blockedUser.userId);
      setBlockedUsers((currentUsers) => currentUsers.filter((user) => user.userId !== blockedUser.userId));
      toast.success(`${blockedUser.displayName || 'User'} unblocked.`);
    } catch (unblockError) {
      console.error('Error unblocking user:', unblockError);
      toast.error('Unable to unblock this user right now.');
    } finally {
      setUnblockingUserId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppPageHeader
        title="Blocked users"
        onBack={() => navigate(-1)}
        backLabel="Back to settings"
        bugButtonTestId="blocked-users-page-bug-button-slot"
      />

      <main className="mx-auto max-w-2xl space-y-3 p-4">
        {loading ? (
          <LoadingCardSkeletons label="Loading blocked users" />
        ) : null}

        {!loading && error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!loading && !error && blockedUsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">
            You have not blocked anyone.
          </div>
        ) : null}

        {!loading && !error && blockedUsers.map((blockedUser) => (
          <div
            key={blockedUser.userId}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/80 p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <HeartPhoto
                className="w-12 shrink-0"
                label={`${blockedUser.displayName} avatar`}
                masked={shouldMaskPhoto(dlModeActive, blockedUser.photoExplicit)}
                photo={blockedUser.photo}
                outOfSight={blockedUser.outOfSight === true}
                userId={blockedUser.userId}
                onClick={() => navigate(`/profile/${blockedUser.userId}`)}
                fallback={<CruushIcon name="profile" className="size-4 opacity-75" />}
              />
              <div className="min-w-0">
                <p className="truncate">{blockedUser.displayName || 'cruush user'}</p>
                <p className="text-xs text-muted-foreground">{formatBlockedDate(blockedUser.createdAt)}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unblockingUserId === blockedUser.userId}
              onClick={() => {
                void handleUnblock(blockedUser);
              }}
            >
              {unblockingUserId === blockedUser.userId ? 'Unblocking...' : 'Unblock'}
            </Button>
          </div>
        ))}
      </main>
    </div>
  );
}
