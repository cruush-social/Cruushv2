import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import CruushesProfileCard from './CruushesProfileCard';
import ProfileActionTrio from './ProfileActionTrio';
import AppPageHeader from './AppPageHeader';
import {
  createInAppShareMessage,
  createMessage,
  getConversations,
  openDirectConversation,
  type ConversationThread,
  type InAppShare,
} from '../lib/messagesApi';
import { getMyCruushActivity, type MutualCruushActivityItem } from '../lib/cruushApi';
import { openConversationOrInbox } from '../lib/openConversation';

type InAppShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  share: InAppShare;
};

function sortByMostRecent(conversations: ConversationThread[]) {
  return [...conversations].sort((left, right) => (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  ));
}

export default function InAppShareDialog({ open, onOpenChange, share }: InAppShareDialogProps) {
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mutuals, setMutuals] = useState<MutualCruushActivityItem[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [mutualSearch, setMutualSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setStatus(null);
    setSelectedUserIds([]);
    setMutualSearch('');
    const loadRecipients = share.kind === 'club'
      ? Promise.all([getMyCruushActivity(), getConversations()]).then(([activity, items]) => {
          setMutuals((activity.mutual ?? []).filter((item) => item.canMessage !== false));
          setConversations(sortByMostRecent(items.filter((item) => item.kind === 'group'
            && item.closed !== true
            && item.clubId !== share.id)));
        })
      : getConversations().then((items) => {
          setConversations(sortByMostRecent(items.filter((item) => (
            item.canMessage !== false
            && item.closed !== true
            && (item.kind === 'dm' || item.kind === 'group')
          ))));
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

  const openRecipientConversation = async (conversation: ConversationThread) => {
    if (sendingId) return;
    setSendingId(conversation.id);
    onOpenChange(false);
    try {
      if (conversation.kind === 'dm') {
        await openConversationOrInbox(navigate, conversation.user.id);
      } else {
        navigate(`/chat/${conversation.id}`);
      }
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

  const toggleClubRecipient = (userId: string) => {
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!block max-h-[80dvh] overflow-y-auto border-white/10 bg-background/98 p-0 sm:top-6 sm:max-w-md sm:translate-y-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Send in cruush</DialogTitle>
          <DialogDescription>{share.label}</DialogDescription>
        </DialogHeader>
        <AppPageHeader
          bugButtonTestId="send-in-cruush-bug-button-slot"
          onBack={() => onOpenChange(false)}
          onClose={() => onOpenChange(false)}
          title="Send in cruush"
        />
        <div className="space-y-4 p-4">
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
                  <CruushesProfileCard
                    key={item.user.id}
                    user={{ ...item.user, vibes: item.user.vibes ?? item.vibes }}
                    onOpenProfile={() => navigate(`/profile/${item.user.id}`)}
                    metadata={(
                      <button
                        type="button"
                        className="flex min-w-0 flex-col gap-0.5 text-left text-xs leading-snug text-white/62"
                        onClick={() => navigate(`/profile/${item.user.id}`)}
                      >
                        <span className="flex h-11 w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden text-xs leading-snug text-white/62 sm:text-sm">
                          <span className="block min-w-0 truncate">{item.lastActive}</span>
                          <span className="block min-w-0 truncate">{item.distance}</span>
                        </span>
                      </button>
                    )}
                    mutual
                    actions={(
                      <ProfileActionTrio
                        className="!gap-1 [&>button]:!size-9 [&>button]:!p-1.5 [&>button>img]:!size-5 [&>button>svg]:!size-5"
                        size="sm"
                        userName={item.user.name}
                        cruushState="mutual"
                        cruushTone="dark"
                        cruushDisabled
                        onCruush={() => undefined}
                        canMessage={item.canMessage}
                        onMessage={() => toggleClubRecipient(item.user.id)}
                        canCenterPin={item.canRevealPreciseLocation === true
                          && item.coordinates?.precision === 'precise'
                          && (item.displayExpiresAtMs == null || item.displayExpiresAtMs > Date.now())}
                        onCenterPin={() => navigate(`/map?mode=mutuals&focusUserId=${encodeURIComponent(item.user.id)}`)}
                      />
                    )}
                    sharesCrowd={(item.mutualCrowds?.length ?? 0) > 0}
                    onSelect={() => toggleClubRecipient(item.user.id)}
                    selectLabel={`${selected ? 'Remove' : 'Select'} ${item.user.name}`}
                    selected={selected}
                    testId="share-recipient-profile-card"
                    wrapVibes
                  />
                );
              })}
            </div>
            {conversations.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-white/65">Recent chats</p>
                {conversations.map((conversation) => (
                  <CruushesProfileCard
                    key={conversation.id}
                    metadata={(
                      <span className="flex h-11 w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden text-xs leading-snug text-white/62 sm:text-sm">
                        <span className="block min-w-0 truncate">{conversation.user.lastActive}</span>
                        <span className="block min-w-0 truncate">{conversation.distance}</span>
                      </span>
                    )}
                    actions={(
                      <ProfileActionTrio
                        className="!gap-1 [&>button]:!size-9 [&>button]:!p-1.5 [&>button>img]:!size-5 [&>button>svg]:!size-5"
                        size="sm"
                        userName={conversation.user.name}
                        cruushState="mutual"
                        cruushTone="dark"
                        cruushDisabled
                        onCruush={() => undefined}
                        canCenterPin={false}
                        onCenterPin={() => undefined}
                        canMessage
                        onMessage={() => void send(conversation)}
                      />
                    )}
                    mutual
                    user={conversation.user}
                    onSelect={() => void send(conversation)}
                    selectLabel={`Send to ${conversation.user.name}`}
                    selected={sendingId === conversation.id}
                    testId="share-recipient-profile-card"
                    wrapVibes
                  />
                ))}
              </div>
            ) : null}
            <button
              className="h-11 w-full rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={selectedUserIds.length === 0 || sendingId === 'club'}
              onClick={() => void sendClub()}
              style={{ background: 'var(--cruush-gradient)' }}
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
            <CruushesProfileCard
              key={conversation.id}
              metadata={(
                <span className="flex h-11 w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden text-xs leading-snug text-white/62 sm:text-sm">
                  <span className="block min-w-0 truncate">{conversation.user.lastActive}</span>
                  <span className="block min-w-0 truncate">{conversation.distance}</span>
                </span>
              )}
              actions={(
                <ProfileActionTrio
                  className="!gap-1 [&>button]:!size-9 [&>button]:!p-1.5 [&>button>img]:!size-5 [&>button>svg]:!size-5"
                  size="sm"
                  userName={conversation.user.name}
                  cruushState={conversation.mutual === true ? 'mutual' : 'sent'}
                  cruushTone="dark"
                  cruushDisabled
                  onCruush={() => undefined}
                  canCenterPin={false}
                  onCenterPin={() => undefined}
                  canMessage={conversation.canMessage !== false}
                  onMessage={() => void (share.kind === 'profile'
                    ? openRecipientConversation(conversation)
                    : send(conversation))}
                />
              )}
              mutual={conversation.mutual === true}
              user={conversation.user}
              onSelect={() => void (share.kind === 'profile'
                ? openRecipientConversation(conversation)
                : send(conversation))}
              selectLabel={share.kind === 'profile'
                ? conversation.kind === 'dm'
                  ? `Open messages with ${conversation.user.name}`
                  : `Open ${conversation.user.name} chat`
                : `Send to ${conversation.user.name}`}
              selected={sendingId === conversation.id}
              testId="share-recipient-profile-card"
              wrapVibes
            />
          ))}
          </div>
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
