-- September 12: finish the clearly named commercial-store cleanup and remove
-- airport terminals, lounges and duplicate airport listings.  A terminal,
-- lounge, chapel or other feature inside an airport is not its own Spot.
-- Preserve every original row in the recovery table.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive',
       case
         when p.id in (
           '8475b80c-5ced-5e28-a97b-9ebcb1a496a9',
           '77055602-b658-5a65-ba63-d19e9627fe4f',
           '4e4f31d6-a442-54dd-ac93-e0ea645b0a2d',
           '4bf63794-dffc-5c35-979b-51baa639edc5',
           '1b9afacf-064f-5c83-8055-d70ca57862a9',
           '249d3e30-29e8-57b0-9aa1-9c020ae9c27b',
           '02baf7aa-bdad-593e-973e-d514c2ea782f',
           '6e6dfa76-1f86-517a-9592-0fedcbc83c62',
           '5d4228a1-dea5-5cc8-824f-b176b6d9d1e1',
           '7c1177ee-2a66-5cff-b794-a9494bdba3ff',
           '5b864454-103b-546c-8a7a-38f5d19a2e4b',
           'dedfe7e5-2d68-5bcb-a035-dc94440f4308',
           'da4c1845-6246-5b16-a84b-4f780a944516',
           'a8d3914e-df70-5cb0-a885-3e2be41e458a',
           'eefeb950-ad8e-59a0-9ea8-de7e6a94c319',
           '72a2c06e-065f-5557-902e-0853f2d2e3fa',
           'c3fe773f-1c8b-59a7-90ef-7ccf36812418',
           'ae8d90af-26a1-5307-b19f-e1a0db7d2b8f',
           'eafedda4-2fd6-50f9-ae78-96baf8de8e56',
           '357a3388-e58d-43b5-aaa9-4ab455ae4784',
           '56b170fd-41e4-5f75-baad-e6d50c0aefbd',
           '98e2dfa2-5f1f-532f-a22f-0f581531d851',
           '0460f43a-0f70-52c7-990e-9e299adc9660',
           '63a02d47-9bea-5dbb-98c4-64be86873fe3',
           '3beec94a-6725-51aa-be26-19000820a40a'
         ) then 'Airport terminal, lounge, chapel or duplicate airport listing archived; retain one parent airport Spot'
         else 'Retail store or commercial service archived; reintroduction requires aggregated user evidence'
       end
from places p
where p.status = 'published'
  and (
    p.id in (
      '8475b80c-5ced-5e28-a97b-9ebcb1a496a9',
      '77055602-b658-5a65-ba63-d19e9627fe4f',
      '4e4f31d6-a442-54dd-ac93-e0ea645b0a2d',
      '4bf63794-dffc-5c35-979b-51baa639edc5',
      '1b9afacf-064f-5c83-8055-d70ca57862a9',
      '249d3e30-29e8-57b0-9aa1-9c020ae9c27b',
      '02baf7aa-bdad-593e-973e-d514c2ea782f',
      '6e6dfa76-1f86-517a-9592-0fedcbc83c62',
      '5d4228a1-dea5-5cc8-824f-b176b6d9d1e1',
      '7c1177ee-2a66-5cff-b794-a9494bdba3ff',
      '5b864454-103b-546c-8a7a-38f5d19a2e4b',
      'dedfe7e5-2d68-5bcb-a035-dc94440f4308',
      'da4c1845-6246-5b16-a84b-4f780a944516',
      'a8d3914e-df70-5cb0-a885-3e2be41e458a',
      'eefeb950-ad8e-59a0-9ea8-de7e6a94c319',
      '72a2c06e-065f-5557-902e-0853f2d2e3fa',
      'c3fe773f-1c8b-59a7-90ef-7ccf36812418',
      'ae8d90af-26a1-5307-b19f-e1a0db7d2b8f',
      'eafedda4-2fd6-50f9-ae78-96baf8de8e56',
      '357a3388-e58d-43b5-aaa9-4ab455ae4784',
      '56b170fd-41e4-5f75-baad-e6d50c0aefbd',
      '98e2dfa2-5f1f-532f-a22f-0f581531d851',
      '0460f43a-0f70-52c7-990e-9e299adc9660',
      '63a02d47-9bea-5dbb-98c4-64be86873fe3',
      '3beec94a-6725-51aa-be26-19000820a40a'
    )
    or (
      p.facility_type = 'other'
      and p.name ~* '\m(store|storage|laundry|laundromat|charging station|superchargers?|gas station|carwash|smoke shoppe?|giant|mcdonalds|travel plaza|mall|shopping)\M'
    )
  )
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
