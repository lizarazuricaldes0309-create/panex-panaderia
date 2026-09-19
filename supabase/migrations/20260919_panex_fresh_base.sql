-- PANEX-FINAL: esquema base limpio para Supabase/PostgreSQL.
create extension if not exists pgcrypto;

create table if not exists public.panex_manus_users (
  id uuid primary key default gen_random_uuid(), open_id text not null unique,
  name text, email text, login_method text, role text not null default 'user',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_signed_in timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  description text, sort_order integer not null default 0
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique,
  description text, category_id uuid references public.categories(id), price numeric(10,2) not null,
  unit text, image_url text, is_featured boolean not null default false,
  stock integer not null default 100, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), user_id uuid, customer_name text not null,
  customer_phone text, delivery_address text, notes text, items jsonb not null,
  total numeric(10,2) not null, payment_method text, status text not null default 'pendiente',
  whatsapp_sent boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists public.panex_customer_accounts (
  id uuid primary key default gen_random_uuid(), name text not null, email text not null unique,
  phone text, password_hash text not null, email_verified boolean not null default false,
  verification_code_hash text, verification_expires_at timestamptz,
  verification_attempts integer not null default 0, loyalty_points integer not null default 0,
  welcome_coupon_code text unique, created_at timestamptz not null default now(), last_login_at timestamptz
);

create table if not exists public.panex_customer_sessions (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.panex_customer_accounts(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(), user_id uuid, customer_name text not null,
  order_id uuid references public.orders(id), product_id uuid references public.products(id),
  rating integer not null check (rating between 1 and 5), comment text,
  status text not null default 'aprobada', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_reviews_product_id on public.reviews(product_id);
create index if not exists idx_customer_sessions_account_id on public.panex_customer_sessions(account_id);

insert into public.categories (name, slug, description, sort_order) values
  ('Panes','panes','Panes artesanales de fermentación lenta.',1),
  ('Bollería','bolleria','Bollería de mantequilla y masas dulces.',2),
  ('Pastelería','pasteleria','Pasteles y postres para celebrar.',3),
  ('Combos','combos','Cajas y combinaciones para compartir.',4)
on conflict (slug) do nothing;

insert into public.products (id,name,slug,description,category_id,price,unit,image_url,is_featured,is_active)
select * from (values
  ('00000000-0000-4000-8000-000000000001'::uuid,'Masa Madre Panex','masa-madre-panex','Fermentación lenta de 24 horas, corteza crujiente y miga con carácter.','panes',24,'pieza · 650 g','/manus-storage/panex-bread-sourdough.jpg',true,true),
  ('00000000-0000-4000-8000-000000000002'::uuid,'Croissant de Mantequilla','croissant-mantequilla','Capas ligeras, mantequilla real y un dorado que cruje desde el primer bocado.','bolleria',12,'pieza','/manus-storage/panex-pastry-croissant.jpg',true,true),
  ('00000000-0000-4000-8000-000000000003'::uuid,'Roll de Canela','roll-canela','Canela aromática, glaseado suave y una textura esponjosa recién horneada.','bolleria',15,'pieza','/manus-storage/panex-pastry-cinnamon.jpg',true,true),
  ('00000000-0000-4000-8000-000000000004'::uuid,'Torta de Celebración','torta-celebracion','Bizcocho de vainilla, crema ligera y frutos rojos para celebrar bonito.','pasteleria',165,'8–10 porciones','/manus-storage/panex-cake-fruit.jpg',true,true),
  ('00000000-0000-4000-8000-000000000005'::uuid,'Pan de Campo','pan-de-campo','Harina de trigo, miel y semillas tostadas en una hogaza para compartir.','panes',22,'pieza · 550 g','/manus-storage/panex-bread-seeds.jpg',false,true),
  ('00000000-0000-4000-8000-000000000006'::uuid,'Caja Brunch','caja-brunch','Dos croissants, dos rolls y una hogaza mini para empezar el día sin prisa.','combos',58,'caja para 2','/manus-storage/panex-combo-box.jpg',false,true)
) as v(id,name,slug,description,category_slug,price,unit,image_url,is_featured,is_active)
join public.categories c on c.slug=v.category_slug
on conflict (id) do nothing;

alter table public.panex_manus_users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.panex_customer_accounts enable row level security;
alter table public.panex_customer_sessions enable row level security;
alter table public.reviews enable row level security;

-- La API del servidor usa DATABASE_URL y aplica su propia autorización.
-- Estas políticas no conceden acceso público directo a tablas sensibles.
drop policy if exists "public_read_categories" on public.categories;
drop policy if exists "public_read_products" on public.products;
create policy "public_read_categories" on public.categories for select using (true);
create policy "public_read_products" on public.products for select using (is_active = true);

select table_name from information_schema.tables
where table_schema='public' and table_name in ('categories','products','orders','reviews','panex_manus_users','panex_customer_accounts','panex_customer_sessions')
order by table_name;
