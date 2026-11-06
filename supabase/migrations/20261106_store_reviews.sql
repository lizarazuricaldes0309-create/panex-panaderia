-- Opiniones generales sobre la experiencia en la tienda Panex.
-- Es independiente de public.reviews, que continúa reservado para productos.
create table if not exists public.panex_store_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.panex_customer_accounts(id) on delete cascade,
  customer_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(trim(comment)) between 8 and 500),
  status text not null default 'aprobada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists panex_store_reviews_created_at_idx
  on public.panex_store_reviews (created_at desc);

alter table public.panex_store_reviews enable row level security;
