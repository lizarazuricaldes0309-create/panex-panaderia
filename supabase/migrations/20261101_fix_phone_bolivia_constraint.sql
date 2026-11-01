-- Corrige la expresión regular de teléfonos bolivianos.
-- La migración anterior tenía dos barras invertidas y rechazaba todos los móviles válidos.
ALTER TABLE public.panex_customer_accounts
  DROP CONSTRAINT IF EXISTS panex_customer_accounts_phone_bolivia_format;

ALTER TABLE public.panex_customer_accounts
  ADD CONSTRAINT panex_customer_accounts_phone_bolivia_format
  CHECK (phone IS NULL OR phone ~ '^\+591[67][0-9]{7}$')
  NOT VALID;
