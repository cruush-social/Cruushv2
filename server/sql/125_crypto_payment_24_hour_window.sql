-- Allow new orders 24 hours for payment-provider delays before on-chain arrival.
-- Existing orders retain their published deadlines; no rows are rewritten.
alter table crypto_payment_intents
  alter column expires_at set default (now() + interval '1440 minutes');
