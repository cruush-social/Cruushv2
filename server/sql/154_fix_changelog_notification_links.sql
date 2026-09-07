-- Announcements were sent with a link to /changelog, which is not a route.
-- The page is at /settings/changelog, so every one of these notifications
-- dropped the member on the map through the catch-all redirect instead of
-- opening what the announcement was about.
--
-- 415 notifications carried it. The link is corrected to the page it always
-- meant rather than the notifications being deleted: they still say something
-- worth reading.
--
-- Replay-safe: once corrected the update matches nothing.
update app_notifications
   set link_url = '/settings/changelog'
 where link_url = '/changelog';
