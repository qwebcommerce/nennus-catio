-- شغّل هذا السكربت في Supabase → SQL Editor (أو Migration) لإنشاء الجداول المتوقعة من مزامنة POS
-- يمكنك تعديل الأسماء ثم تعديل supabaseSyncService.js ليطابقها

create extension if not exists "pgcrypto";

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  created_at timestamptz default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  created_at timestamptz default now()
);

-- فروع في Supabase (للمخزون) — انسخ id الفرع إلى Branch.supabaseId في التطبيق المحلي
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  code text unique,
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text,
  barcode text,
  name text not null,
  name_en text,
  description text,
  price numeric not null default 0,
  cost numeric,
  pet_type text default 'OTHER',
  -- مثال عام: https://cdn.example.com/products/<uuid>.webp
  image_url text, -- رابط https كامل أو مسار نسبي + PUBLIC_IMAGE_BASE_URL / SUPABASE_PUBLIC_IMAGE_PREFIX في server/.env
  brand_id uuid references public.brands (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  updated_at timestamptz default now()
);

create index if not exists idx_products_brand on public.products (brand_id);
create index if not exists idx_products_category on public.products (category_id);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  quantity int not null default 0,
  min_stock_level int not null default 5,
  unique (product_id, branch_id)
);

-- RLS: عطّل للتطوير أو أضف سياسات مناسبة — وإلا قد يمنع anon القراءة
alter table public.brands disable row level security;
alter table public.categories disable row level security;
alter table public.branches disable row level security;
alter table public.products disable row level security;
alter table public.inventory disable row level security;
