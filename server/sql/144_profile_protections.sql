-- One Protections field replaces the separate Condoms, PrEP, DoxyPEP, COVID
-- vaccine and Mpox vaccine columns. The old columns are left in place: this
-- migration only adds and fills the new one, so nothing a member entered is
-- destroyed and the change can be undone by ignoring the new column.
--
-- Birth control and the Masks health preference live inside the encrypted
-- profile blob, which SQL cannot read. The server folds those in when it
-- decrypts a profile, so they are not attempted here.
alter table profiles add column if not exists protections text[] not null default '{}';

update profiles
set protections = (
  select coalesce(array_agg(distinct value order by value), '{}')
  from (
    select 'Condoms' as value where 'always' = any(condoms) or 'sometimes' = any(condoms) or 'discuss' = any(condoms)
    union all
    select 'PrEP' where 'yes' = any(prep)
    union all
    select 'DoxyPEP' where 'yes' = any(doxypep)
    union all
    select 'COVID vaccine' where 'yes' = any(covid_vaccine) or 'partial' = any(covid_vaccine)
    union all
    select 'Mpox vaccine' where 'yes' = any(mpox_vaccine) or 'partial' = any(mpox_vaccine)
  ) as carried
)
where protections = '{}'
  and (condoms <> '{}' or prep <> '{}' or doxypep <> '{}' or covid_vaccine <> '{}' or mpox_vaccine <> '{}');
