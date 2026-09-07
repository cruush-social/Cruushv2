-- ABDL is age-roleplay adjacent, and cruush does not carry age-roleplay
-- signals anywhere: not as an option, a badge, a filter, or a tag. It is gone
-- from the Scenes list, so any profile still holding it is cleared here rather
-- than keeping a value nothing can display or search.
--
-- Nothing is being taken from anyone: no profile on production held it.
--
-- Replay-safe: once the value is gone the update matches nothing.
update profiles
   set scenes = array_remove(scenes, 'ABDL')
 where 'ABDL' = any(scenes);

update profiles
   set tags = array(select t from unnest(tags) t where lower(t) <> 'abdl')
 where exists (select 1 from unnest(tags) t where lower(t) = 'abdl');
