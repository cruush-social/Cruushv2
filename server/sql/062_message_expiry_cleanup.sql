create index if not exists idx_messages_expires_at
  on messages (expires_at asc)
  where expires_at is not null;

create index if not exists idx_message_media_attachments_message
  on message_media_attachments (message_id);
