create table if not exists user_notice_dismissals (
  user_id uuid not null references app_users(id) on delete cascade,
  notice_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, notice_key),
  constraint user_notice_dismissals_notice_key_check
    check (notice_key ~ '^[a-z0-9:_-]{3,120}$')
);

create index if not exists user_notice_dismissals_user_idx
  on user_notice_dismissals(user_id, dismissed_at desc);

insert into user_notice_dismissals (user_id, notice_key)
select id, 'cruush:map-controls-intro-seen'
from app_users
union all
select id, 'cruush:alpha-bug-tip-seen'
from app_users
union all
select id, 'cruush:dl-mode-default-notice-seen'
from app_users
union all
select id, 'cruush:beta-launch-plus-offer-seen:' || id::text
from app_users
on conflict (user_id, notice_key) do nothing;
