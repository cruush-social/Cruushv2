alter table profiles
  add column if not exists pubic_hair text[] not null default '{}',
  add column if not exists facial_hair text[] not null default '{}';

update profiles
set body_hair = case lower(coalesce(body_hair[1], ''))
  when 'natural' then array['Varies']::text[]
  when 'trimmed' then array['Mixed']::text[]
  when 'shaved' then array['Smooth']::text[]
  else body_hair
end
where lower(coalesce(body_hair[1], '')) in ('natural', 'trimmed', 'shaved');
