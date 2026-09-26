-- Keep historical grants valid while making the new server catalogue prices
-- authoritative for every order created after this release.
alter table ping_pack_purchases
  drop constraint if exists ping_pack_purchases_catalog_check;

alter table ping_pack_purchases
  add constraint ping_pack_purchases_catalog_check check (
    (pack_id = 'ping_3' and ping_count = 3 and amount_cents in (299, 999))
    or (pack_id = 'ping_10' and ping_count = 10 and amount_cents in (799, 2499))
    or (pack_id = 'ping_25' and ping_count = 25 and amount_cents in (1499, 4999))
  );
