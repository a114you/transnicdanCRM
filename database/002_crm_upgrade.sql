-- Обновление схемы CRM: оплаты, долги, поставщики, склад, себестоимость запчастей.
-- Выполните этот файл в Supabase SQL Editor перед использованием новых разделов.

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_percent numeric(7,2) not null default 0,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists warehouse_parts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  brand text,
  supplier_id uuid references suppliers(id) on delete set null,
  quantity numeric(12,2) not null default 0,
  min_quantity numeric(12,2) not null default 0,
  purchase_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null default 'Механик',
  phone text,
  email text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table orders
  add column if not exists car_mileage numeric(12,0),
  add column if not exists payment_method text not null default 'cash',
  add column if not exists payment_entries jsonb not null default '[]'::jsonb,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists debt_amount numeric(12,2) not null default 0,
  add column if not exists debt_started_at timestamptz,
  add column if not exists payment_status text not null default 'paid';

alter table order_items
  add column if not exists mechanic_id uuid references employees(id) on delete set null,
  add column if not exists mechanic_name text,
  add column if not exists source text not null default 'manual',
  add column if not exists warehouse_part_id uuid references warehouse_parts(id) on delete set null,
  add column if not exists supplier_id uuid references suppliers(id) on delete set null,
  add column if not exists supplier_name text,
  add column if not exists cost_price numeric(12,2) not null default 0,
  add column if not exists cost_total numeric(12,2) not null default 0,
  add column if not exists profit_amount numeric(12,2) not null default 0,
  add column if not exists supplier_discount_percent numeric(7,2) not null default 0;

update orders
set
  paid_amount = case when coalesce(paid_amount, 0) = 0 then coalesce(total_amount, 0) else paid_amount end,
  debt_amount = greatest(coalesce(total_amount, 0) - case when coalesce(paid_amount, 0) = 0 then coalesce(total_amount, 0) else paid_amount end, 0),
  payment_status = case
    when greatest(coalesce(total_amount, 0) - case when coalesce(paid_amount, 0) = 0 then coalesce(total_amount, 0) else paid_amount end, 0) = 0 then 'paid'
    when case when coalesce(paid_amount, 0) = 0 then coalesce(total_amount, 0) else paid_amount end <= 0 then 'unpaid'
    else 'partial'
  end
where paid_amount = 0 and debt_amount = 0;

update orders
set payment_entries = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy-' || id::text,
    'method', case when payment_method in ('cash', 'card', 'transfer') then payment_method else 'cash' end,
    'amount', paid_amount,
    'paid_at', order_date,
    'note', 'Перенесено из старой версии'
  )
)
where coalesce(jsonb_array_length(payment_entries), 0) = 0
  and coalesce(paid_amount, 0) > 0;

update order_items
set
  cost_price = coalesce(cost_price, 0),
  total_price = coalesce(total_price, quantity * selling_price),
  cost_total = coalesce(cost_total, quantity * coalesce(cost_price, 0)),
  profit_amount = coalesce(profit_amount, coalesce(total_price, quantity * selling_price) - quantity * coalesce(cost_price, 0));

create index if not exists idx_suppliers_name on suppliers(name);
create index if not exists idx_warehouse_parts_name on warehouse_parts(name);
create index if not exists idx_warehouse_parts_code on warehouse_parts(code);
create index if not exists idx_employees_full_name on employees(full_name);
create index if not exists idx_employees_active on employees(active);
create index if not exists idx_orders_payment_status on orders(payment_status);
create index if not exists idx_order_items_mechanic_id on order_items(mechanic_id);
create index if not exists idx_order_items_warehouse_part_id on order_items(warehouse_part_id);

alter table employees enable row level security;

drop policy if exists "Allow all" on employees;
create policy "Allow all" on employees for all using (true) with check (true);

-- ============================================================
-- CRM LOGIN USERS
-- Выполните один раз. Пользователей создает только владелец через SQL.
-- Пароли хранятся только как pgcrypto hash, приложение не читает password_hash.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists crm_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null default 'user',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists idx_crm_users_username on crm_users (lower(username));
create index if not exists idx_crm_users_active on crm_users (active);

alter table crm_users enable row level security;

drop policy if exists "crm_users_no_direct_select" on crm_users;
create policy "crm_users_no_direct_select"
on crm_users for select
using (false);

drop policy if exists "crm_users_no_direct_write" on crm_users;
create policy "crm_users_no_direct_write"
on crm_users for all
using (false)
with check (false);

create or replace function verify_crm_user(p_username text, p_password text)
returns table (id uuid, username text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_username, '')) < 2
    or length(coalesce(p_username, '')) > 80
    or length(coalesce(p_password, '')) < 1
    or length(coalesce(p_password, '')) > 256 then
    return;
  end if;

  update crm_users u
  set last_login_at = now(), updated_at = now()
  where lower(u.username) = lower(trim(p_username))
    and u.active = true
    and u.password_hash = extensions.crypt(p_password, u.password_hash);

  return query
  select u.id, u.username, u.role
  from crm_users u
  where lower(u.username) = lower(trim(p_username))
    and u.active = true
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
  limit 1;
end;
$$;

revoke all on function verify_crm_user(text, text) from public;
grant execute on function verify_crm_user(text, text) to anon, authenticated;

-- Создание пользователя вручную:
-- insert into crm_users (username, password_hash, role)
-- values ('admin', extensions.crypt('ЗАМЕНИТЕ_НА_СИЛЬНЫЙ_ПАРОЛЬ', extensions.gen_salt('bf', 12)), 'admin');
