import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    if (!clubId) {
      setError('Club not found.');
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    void getClub(clubId)
      .then((item) => {
        if (!active) return;
        if (item.conversationId) {
          navigate(`/chat/${item.conversationId}`, { replace: true });
          return;
        }
        setClub(item);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Club could not load.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [clubId, navigate]);

  const join = async () => {
    if (!clubId || !club || club.joinRequestStatus !== 'none' || requesting) return;
    setRequesting(true);
    setError(null);
    try {
      const result = await requestClubJoin(clubId);
      setClub((current) => current ? { ...current, joinRequestStatus: result.joinRequestStatus } : current);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Join request could not be sent.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppPageHeader
        backLabel="Back to Clubs"
        bugButtonTestId="club-detail-bug-button-slot"
        onBack={() => navigate('/messages?tab=clubs')}
        title={club?.title ?? 'Clubs'}
      />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {loading ? <LoadingCardSkeletons count={2} label="Loading Club" /> : null}
        {error ? <p className="mb-4 text-sm text-destructive" role="alert">{error}</p> : null}
        {club ? (
          <Card className="gap-5 border-white/10 bg-card/70 p-5">
            {club.summary ? <p className="text-sm leading-relaxed text-muted-foreground">{club.summary}</p> : null}
            <p className="text-sm text-muted-foreground">{club.memberCount} {club.memberCount === 1 ? 'member' : 'members'}</p>
            <div className="flex flex-wrap gap-2">
              {club.tags.map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setShareOpen(true)} type="button" variant="outline">Share Club</Button>
              <Button disabled={club.joinRequestStatus === 'pending' || requesting} onClick={() => void join()} type="button">
                {club.joinRequestStatus === 'pending' ? 'Request sent' : 'Request to join'}
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
