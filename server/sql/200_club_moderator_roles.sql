alter table conversation_members
  drop constraint if exists conversation_members_role_check;

alter table conversation_members
  add constraint conversation_members_role_check
  check (role in ('owner', 'admin', 'moderator', 'member'));
