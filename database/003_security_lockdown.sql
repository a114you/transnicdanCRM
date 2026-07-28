-- Security lockdown for AUTOSERVICE CRM.
-- Run this in Supabase SQL Editor after moving database access to trusted server routes.
-- It prevents direct reads/writes with the public anon key.

alter table if exists clients enable row level security;
alter table if exists cars enable row level security;
alter table if exists orders enable row level security;
alter table if exists order_items enable row level security;
alter table if exists suppliers enable row level security;
alter table if exists warehouse_parts enable row level security;
alter table if exists employees enable row level security;
alter table if exists crm_users enable row level security;

drop policy if exists "Allow all" on clients;
drop policy if exists "Allow all" on cars;
drop policy if exists "Allow all" on orders;
drop policy if exists "Allow all" on order_items;
drop policy if exists "Allow all" on suppliers;
drop policy if exists "Allow all" on warehouse_parts;
drop policy if exists "Allow all" on employees;

drop policy if exists "deny_direct_clients" on clients;
create policy "deny_direct_clients" on clients for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_direct_cars" on cars;
create policy "deny_direct_cars" on cars for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_direct_orders" on orders;
create policy "deny_direct_orders" on orders for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_direct_order_items" on order_items;
create policy "deny_direct_order_items" on order_items for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_direct_suppliers" on suppliers;
create policy "deny_direct_suppliers" on suppliers for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_direct_warehouse_parts" on warehouse_parts;
create policy "deny_direct_warehouse_parts" on warehouse_parts for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_direct_employees" on employees;
create policy "deny_direct_employees" on employees for all to anon, authenticated using (false) with check (false);

drop policy if exists "crm_users_no_direct_select" on crm_users;
create policy "crm_users_no_direct_select" on crm_users for select to anon, authenticated using (false);

drop policy if exists "crm_users_no_direct_write" on crm_users;
create policy "crm_users_no_direct_write" on crm_users for all to anon, authenticated using (false) with check (false);

revoke all on table clients from anon, authenticated;
revoke all on table cars from anon, authenticated;
revoke all on table orders from anon, authenticated;
revoke all on table order_items from anon, authenticated;
revoke all on table suppliers from anon, authenticated;
revoke all on table warehouse_parts from anon, authenticated;
revoke all on table employees from anon, authenticated;
revoke all on table crm_users from anon, authenticated;

grant execute on function verify_crm_user(text, text) to anon, authenticated;
