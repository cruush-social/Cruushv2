alter table referrals
  add column if not exists signup_privacy_ciphertext text,
  add column if not exists signup_privacy_nonce text,
  add column if not exists signup_privacy_auth_tag text,
  add column if not exists signup_privacy_key_version text not null default 'v1';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'referrals_signup_privacy_encrypted_check'
  ) then
    alter table referrals
      add constraint referrals_signup_privacy_encrypted_check
      check (
        (
          signup_privacy_ciphertext is null
          and signup_privacy_nonce is null
          and signup_privacy_auth_tag is null
        )
        or (
          signup_privacy_ciphertext is not null
          and signup_privacy_nonce is not null
          and signup_privacy_auth_tag is not null
        )
      );
  end if;
end $$;
