import { useDlMode, shouldMaskPhoto, getNsfwPhotoRestriction } from '../lib/dlMode';
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import HeartPhoto from './HeartPhoto';
import UserActivityCapsule from './UserActivityCapsule';
import {
  createInAppShareMessage,
  createMessage,
  getConversations,
  openDirectConversation,
  type ConversationThread,
  type InAppShare,
} from '../lib/messagesApi';
import { getMyCruushActivity, type MutualCruushActivityItem } from '../lib/cruushApi';

type InAppShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  share: InAppShare;
};

export default function InAppShareDialog({ open, onOpenChange, share }: InAppShareDialogProps) {
  const dlModeActive = useDlMode();
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mutuals, setMutuals] = useState<MutualCruushActivityItem[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [mutualSearch, setMutualSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setStatus(null);
    setSelectedUserIds([]);
    setMutualSearch('');
    const loadRecipients = share.kind === 'club'
      ? Promise.all([getMyCruushActivity(), getConversations()]).then(([activity, items]) => {
          setMutuals((activity.mutual ?? []).filter((item) => item.canMessage !== false));
          setConversations(items.filter((item) => item.kind === 'group'
            && item.closed !== true
            && item.clubId !== share.id));
        })
      : getConversations().then((items) => {
          setConversations(items.filter((item) => item.kind === 'dm' && item.canMessage !== false));
        });
    void loadRecipients
      .catch(() => setStatus('Chats could not load.'))
      .finally(() => setLoading(false));
  }, [open, share.id, share.kind]);

  const send = async (conversation: ConversationThread) => {
    if (sendingId) return;
    setSendingId(conversation.id);
    setStatus(null);
    try {
      await createMessage(conversation.id, createInAppShareMessage(share));
      setStatus(`Sent to ${conversation.user.name}.`);
    } catch {
      setStatus(`Could not send to ${conversation.user.name}.`);
    } finally {
      setSendingId(null);
    }
  };

  const sendClub = async () => {
    if (sendingId || selectedUserIds.length === 0) return;
    setSendingId('club');
    setStatus(null);
    try {
      for (const userId of selectedUserIds) {
        const conversation = await openDirectConversation(userId);
        await createMessage(conversation.id, createInAppShareMessage(share));
      }
      setStatus('Club sent.');
    } catch {
      setStatus('Club could not be sent.');
    } finally {
      setSendingId(null);
    }
  };

  const filteredMutuals = mutuals.filter((item) => {
    const query = mutualSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.user.name, item.user.pronouns, ...(item.vibes ?? []), ...(item.mutualCrowds ?? [])]
      .some((value) => value.toLowerCase().includes(query));
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto border-white/10 bg-background/98 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send in cruush</DialogTitle>
          <DialogDescription>{share.label}</DialogDescription>
        </DialogHeader>
        {status ? <p className="text-sm text-white/65" role="status">{status}</p> : null}
        {loading ? <p className="py-6 text-center text-sm text-white/55">Loading chats...</p> : null}
        {share.kind === 'club' ? (
          <>
            <input
              aria-label="Search cruushes"
              className="h-11 w-full rounded-lg border border-white/10 bg-background/25 px-3 text-sm text-white outline-none placeholder:text-white/46"
              onChange={(event) => setMutualSearch(event.target.value)}
              placeholder="Search cruushes"
              value={mutualSearch}
            />
            {!loading && mutuals.length === 0 && conversations.length === 0 ? <p className="py-6 text-center text-sm text-white/55">No available chats yet.</p> : null}
            <div className="space-y-2">
              {filteredMutuals.map((item) => {
                const selected = selectedUserIds.includes(item.user.id);
                return (
                  <UserActivityCapsule
                    className="rounded-3xl p-3"
                    heart={<HeartPhoto className="w-16" label={`${item.user.name} avatar`} restriction={getNsfwPhotoRestriction(item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: true })} masked={shouldMaskPhoto(dlModeActive, item.user.photoExplicit, { ...item.user.photoRelationship, isMutualCruush: true })} photo={item.user.photo} theme="mutual" userId={item.user.id} />}
                    key={item.user.id}
                    mutual
                    name={item.user.name}
                    onSelect={() => setSelectedUserIds((current) => current.includes(item.user.id)
                      ? current.filter((id) => id !== item.user.id)
                      : [...current, item.user.id])}
                    pronouns={item.user.pronouns}
                    selectLabel={`${selected ? 'Remove' : 'Select'} ${item.user.name}`}
                    selected={selected}
                    testId="share-recipient-profile-card"
                  />
                );
              })}
            </div>
            {conversations.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-white/65">Group chats</p>
                {conversations.map((conversation) => (
                  <UserActivityCapsule
                    actions={<Send className="h-4 w-4 shrink-0" />}
                    className="rounded-3xl p-3"
                    heart={<HeartPhoto className="w-16" label={`${conversation.user.name} avatar`} photo={conversation.user.photo} theme="mutual" userId={conversation.user.id} />}
                    key={conversation.id}
                    mutual
                    name={conversation.user.name}
                    onSelect={() => void send(conversation)}
                    pronouns={conversation.clubId ? 'Club' : 'Group'}
                    selectLabel={`Send to ${conversation.user.name}`}
                    selected={sendingId === conversation.id}
                    testId="share-recipient-profile-card"
                  />
                ))}
              </div>
            ) : null}
            <button
              className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={selectedUserIds.length === 0 || sendingId === 'club'}
              onClick={() => void sendClub()}
              type="button"
            >
              Send Club
            </button>
          </>
        ) : (
          <>
          {!loading && conversations.length === 0 ? <p className="py-6 text-center text-sm text-white/55">No available chats yet.</p> : null}
          <div className="space-y-2">
          {conversations.map((conversation) => (
            <UserActivityCapsule
              actions={<Send className="h-4 w-4 shrink-0" />}
              className="rounded-3xl p-3"
              heart={<HeartPhoto className="w-16" label={`${conversation.user.name} avatar`} restriction={getNsfwPhotoRestriction(conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })} masked={shouldMaskPhoto(dlModeActive, conversation.user.photoExplicit, { ...conversation.user.photoRelationship, isMutualCruush: conversation.mutual === true })} photo={conversation.user.photo} theme={conversation.mutual ? 'mutual' : 'nearby'} userId={conversation.user.id} />}
              key={conversation.id}
              mutual={conversation.mutual === true}
              name={conversation.user.name}
              onSelect={() => void send(conversation)}
              pronouns={conversation.user.pronouns}
              selectLabel={`Send to ${conversation.user.name}`}
              selected={sendingId === conversation.id}
              testId="share-recipient-profile-card"
            />
          ))}
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
