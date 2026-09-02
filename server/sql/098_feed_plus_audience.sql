alter table posts
  add column if not exists audience text not null default 'public';

update posts post
set audience = 'crowd'
where exists (
  select 1
  from feed_post_crowd_targets target
  where target.post_id = post.id
);

alter table posts
  drop constraint if exists posts_audience_check;

alter table posts
  add constraint posts_audience_check
  check (audience in ('public', 'mutuals', 'crowd'));

create index if not exists posts_audience_created_at_idx
  on posts (audience, created_at desc);
