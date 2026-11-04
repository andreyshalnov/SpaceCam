-- ═══════════════════════════════════════════════════════════════════════════
-- SpaceCam · 2026-11-04 · sc_popular_products: включить RLS
-- СТАТУС: ПОДГОТОВЛЕН, НЕ ПРИМЕНЁН — ждать подтверждения владельца.
--
-- Находка аудита 04.11 (после деплоя 980d175): у sc_popular_products RLS
-- выключена, при этом у anon полные табличные гранты (SELECT/INSERT/UPDATE/
-- DELETE, дефолт Supabase) → блок «популярные товары» на публичной главной
-- может читать И менять кто угодно без токена.
-- Все остальные публичные таблицы проверены: записи anon заблокированы
-- политиками (sc_is_admin()/владелец), открытое anon-чтение news/prices/
-- stock/warehouses/price_types — осознанный дизайн сайта, не трогаем.
-- Идемпотентен: повторный запуск ничего не ломает.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.sc_popular_products enable row level security;

-- чтение — всем (главная сайта читает блок без логина)
drop policy if exists sc_pop_select on public.sc_popular_products;
create policy sc_pop_select on public.sc_popular_products
  for select to public using (true);

-- запись — только админ
drop policy if exists sc_pop_admin_write on public.sc_popular_products;
create policy sc_pop_admin_write on public.sc_popular_products
  for all to public using (sc_is_admin()) with check (sc_is_admin());

-- Контроль после применения (ожидание: rls_on = true, 2 политики):
-- select c.relrowsecurity, p.policyname, p.cmd, p.roles
-- from pg_class c join pg_policies p on p.tablename=c.relname
-- where c.relname='sc_popular_products' and c.relnamespace='public'::regnamespace;
