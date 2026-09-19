-- Panex compatibility migration: additive only.
-- No existing table, column, policy, or row is dropped.

create table if not exists public.panex_manus_users (
  id uuid primary key default gen_random_uuid(),
  open_id text not null unique,
  name text,
  email text,
  login_method text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_signed_in timestamptz not null default now()
);

alter table public.orders add column if not exists delivery_address text;
alter table public.orders add column if not exists notes text;
alter table public.products add column if not exists slug text;
alter table public.products add column if not exists unit text;
alter table public.products add column if not exists is_featured boolean not null default false;
alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.reviews add column if not exists product_id uuid;
alter table public.reviews add column if not exists status text not null default 'aprobada';
alter table public.reviews add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_reviews_order_id on public.reviews(order_id);
create index if not exists idx_reviews_user_id on public.reviews(user_id);
create index if not exists idx_reviews_product_id on public.reviews(product_id);

create table if not exists public.panex_customer_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  password_hash text not null,
  email_verified boolean not null default false,
  verification_code_hash text,
  verification_expires_at timestamptz,
  verification_attempts integer not null default 0,
  loyalty_points integer not null default 0,
  welcome_coupon_code text unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.panex_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.panex_customer_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_panex_customer_sessions_account_id on public.panex_customer_sessions(account_id);
create index if not exists idx_panex_customer_sessions_expires_at on public.panex_customer_sessions(expires_at);

alter table public.panex_manus_users enable row level security;
alter table public.panex_customer_accounts enable row level security;
alter table public.panex_customer_sessions enable row level security;
