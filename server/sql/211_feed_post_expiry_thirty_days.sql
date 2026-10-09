alter table posts drop constraint if exists posts_expires_in_check;
alter table posts drop constraint if exists posts_expires_in_check_v2;
alter table posts drop constraint if exists posts_expires_in_check_v3;
alter table posts drop constraint if exists posts_expires_in_check_v4;
alter table posts drop constraint if exists posts_expires_in_check_v5;
alter table posts add constraint posts_expires_in_check_v5 check (expires_in in ('30m', '1h', '3h', '6h', '12h', '24h', '2d', '3d', '5d', '7d', '8d', '9d', '10d', '11d', '12d', '13d', '14d', '15d', '16d', '17d', '18d', '19d', '20d', '21d', '22d', '23d', '24d', '25d', '26d', '27d', '28d', '29d', '30d', 'never'));
