-- Panex phone registration and SMS verification support.
ALTER TABLE public.panex_customer_accounts
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.panex_customer_accounts
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS panex_customer_accounts_phone_unique
  ON public.panex_customer_accounts (phone)
  WHERE phone IS NOT NULL;
