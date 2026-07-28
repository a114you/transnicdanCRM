-- ============================================================
-- Company settings (singleton) and Referral program
-- Выполните этот файл в Supabase SQL Editor после применения 002_crm_upgrade.sql
-- ============================================================

-- ============================================================
-- Реквизиты компании для шапки PDF / Excel актов
-- Одна строка (id = 1). Изменяется в Настройки → Компания.
-- ============================================================

create table if not exists company_settings (
  id int primary key default 1,
  legal_name text not null default 'S.C. "MONTATORUL" SRL',
  address_line_1 text not null default 'MD 2002, mun. Chisinau,',
  address_line_2 text not null default 'str. Muncesti, 191/1',
  phones text not null default 'Tel.: 0 792-000-94, 0 792-000-95, 0 792-000-97',
  fax text not null default 'Fax: / 022/ 63-80-37',
  fiscal_code text not null default 'c.f. 1003600038304, TVA 0300672',
  iban text not null default 'IBAN:MD87EC000000022242716485',
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1)
);

insert into company_settings (id) values (1) on conflict (id) do nothing;

alter table company_settings enable row level security;

drop policy if exists "allow_all_company_settings" on company_settings;
create policy "allow_all_company_settings" on company_settings
  for all
  using (true)
  with check (true);

-- ============================================================
-- Рефереры — партнёры/знакомые, приводящие клиентов
-- Вознаграждение: фикс (MDL) или процент только от работ
-- ============================================================

create table if not exists referrers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  reward_type text not null default 'fixed' check (reward_type in ('fixed', 'percent')),
  reward_fixed numeric(12,2) not null default 0,
  reward_percent numeric(5,2) not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_referrers_active on referrers(active);
create index if not exists idx_referrers_full_name on referrers(full_name);

alter table referrers enable row level security;

drop policy if exists "allow_all_referrers" on referrers;
create policy "allow_all_referrers" on referrers
  for all
  using (true)
  with check (true);

-- ============================================================
-- Связь заказа с реферером + снимок вознаграждения
-- (вычисляется при сохранении заказа, чтобы отчёты не зависели
--  от последующих изменений условий у реферера)
-- ============================================================

alter table orders
  add column if not exists referrer_id uuid references referrers(id) on delete set null,
  add column if not exists referrer_name text,
  add column if not exists referrer_reward numeric(12,2) not null default 0,
  add column if not exists referrer_reward_works numeric(12,2) not null default 0;

create index if not exists idx_orders_referrer_id on orders(referrer_id);