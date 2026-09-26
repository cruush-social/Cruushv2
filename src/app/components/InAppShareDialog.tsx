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
  type ConversationThread,
  type InAppShare,
} from '../lib/messagesApi';

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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setStatus(null);
    void getConversations()
      .then((items) => setConversations(items.filter((item) => item.kind === 'dm' && item.canMessage !== false)))
      .catch(() => setStatus('Chats could not load.'))
      .finally(() => setLoading(false));
  }, [open]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto border-white/10 bg-background/98 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send in cruush</DialogTitle>
          <DialogDescription>{share.label}</DialogDescription>
        </DialogHeader>
        {status ? <p className="text-sm text-white/65" role="status">{status}</p> : null}
        {loading ? <p className="py-6 text-center text-sm text-white/55">Loading chats...</p> : null}
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
      </DialogContent>
    </Dialog>
  );
}
