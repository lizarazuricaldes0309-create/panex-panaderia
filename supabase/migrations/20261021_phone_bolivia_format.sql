-- Panex: los teléfonos de clientes se guardan separados y normalizados.
-- NOT VALID permite conservar registros antiguos mientras aplica la regla a los nuevos.
ALTER TABLE public.panex_customer_accounts
  DROP CONSTRAINT IF EXISTS panex_customer_accounts_phone_bolivia_format;

ALTER TABLE public.panex_customer_accounts
  ADD CONSTRAINT panex_customer_accounts_phone_bolivia_format
  CHECK (phone IS NULL OR phone ~ '^\\+591[67][0-9]{7}$')
  NOT VALID;
