import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getClub, requestClubJoin, type ClubDetailRecord } from '../lib/clubsApi';
import AppPageHeader from './AppPageHeader';
import InAppShareDialog from './InAppShareDialog';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

export default function ClubDetail() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState<ClubDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const routeGeneration = useRef(0);

  useEffect(() => {
    const generation = ++routeGeneration.current;
    setClub(null);
    setRequesting(false);
    if (!clubId) {
      setError('Coven not found.');
      setLoading(false);
      return () => { routeGeneration.current += 1; };
    }

    setLoading(true);
    setError(null);
    void getClub(clubId)
      .then((item) => {
        if (routeGeneration.current !== generation) return;
        if (item.conversationId) {
          navigate(`/chat/${item.conversationId}`, { replace: true });
          return;
        }
        setClub(item);
      })
      .catch((loadError) => {
        if (routeGeneration.current === generation) setError(loadError instanceof Error ? loadError.message : 'Coven could not load.');
      })
      .finally(() => {
        if (routeGeneration.current === generation) setLoading(false);
      });

    return () => { routeGeneration.current += 1; };
  }, [clubId, navigate]);

  const join = async () => {
    if (!clubId || !club || club.id !== clubId || loading || club.joinRequestStatus !== 'none' || requesting) return;
    const generation = routeGeneration.current;
    setRequesting(true);
    setError(null);
    try {
      const result = await requestClubJoin(clubId);
      if (routeGeneration.current !== generation) return;
      if (result.joinRequestStatus === 'member') {
        navigate(`/chat/${result.conversationId}`, { replace: true });
        return;
      }
      setClub((current) => current ? { ...current, joinRequestStatus: result.joinRequestStatus } : current);
    } catch (joinError) {
      if (routeGeneration.current === generation) setError(joinError instanceof Error ? joinError.message : 'Join request could not be sent.');
    } finally {
      if (routeGeneration.current === generation) setRequesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppPageHeader
        backLabel="Back to Covens"
        bugButtonTestId="club-detail-bug-button-slot"
        onBack={() => navigate('/messages?tab=clubs')}
        title={club?.title ?? 'Covens'}
      />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {loading ? <LoadingCardSkeletons count={2} label="Loading Coven" /> : null}
        {error ? <p className="mb-4 text-sm text-destructive" role="alert">{error}</p> : null}
        {club ? (
          <Card className="gap-5 border-white/10 bg-card/70 p-5">
            {club.summary ? <p className="text-sm leading-relaxed text-muted-foreground">{club.summary}</p> : null}
            <p className="text-sm text-muted-foreground">{club.memberCount} {club.memberCount === 1 ? 'member' : 'members'}</p>
            <div className="flex flex-wrap gap-2">
              {club.tags.map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setShareOpen(true)} type="button" variant="outline">Share Coven</Button>
              <Button disabled={club.joinRequestStatus === 'pending' || requesting} onClick={() => void join()} type="button">
                {club.joinRequestStatus === 'pending' ? 'Request sent' : club.requiresJoinApproval === false ? 'Join Coven' : 'Request to join'}
              </Button>
            </div>
          </Card>
        ) : null}
      </main>
      {club ? (
        <InAppShareDialog
          onOpenChange={setShareOpen}
          open={shareOpen}
          share={{ kind: 'club', id: club.id, label: club.title }}
        />
      ) : null}
    </div>
  );
}
