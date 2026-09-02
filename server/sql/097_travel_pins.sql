-- Mile High Club. A member away from home drops a pin where they are visiting and
-- the map shows them there. The pin can only be moved every few hours, which is
-- what stops it being swept across a city to farm strangers.
create table if not exists user_travel_pins (
  user_id uuid primary key references profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  label text not null default '',
  set_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_travel_pins_latitude_check check (latitude >= -90 and latitude <= 90),
  constraint user_travel_pins_longitude_check check (longitude >= -180 and longitude <= 180)
);

create index if not exists user_travel_pins_set_at_idx on user_travel_pins (set_at desc);
