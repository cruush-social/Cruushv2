-- One hour gives first-time senders room for identity checks and funding holds.
-- The application still writes each deadline explicitly; this is the database
-- fallback for any future trusted insert path.
alter table crypto_payment_intents
  alter column expires_at set default (now() + interval '60 minutes');
