-- ═══════════════════════════════════════════════════════════════════════════
-- SpaceCam · 2026-11-04 · sc_popular_products: топ продаж за квартал
-- СТАТУС: ПОДГОТОВЛЕН, НЕ ПРИМЕНЁН — Management API с 04.11 работает только
-- на чтение (роль supabase_read_only_user), DDL через него невозможен.
-- Применение: Supabase Studio → SQL Editor → вставить блок ниже → Run
-- (идемпотентно: create or replace view). Затем пересобрать/выложить фронтенд.
-- ═══════════════════════════════════════════════════════════════════════════
-- Алгоритм (запрос владельца: «топ по статистике продаж за период — квартал»):
--   окно = 90 дней назад от ПОСЛЕДНЕГО снапшота остатков (устойчиво к паузам
--   импорта 1С: если выгрузки прекратятся, окно не выметается в пустоту, а
--   считается от последней имеющейся даты);
--   продажи SKU = сумма ПОЛОЖИТЕЛЬНЫХ снижений остатка между соседними
--   снапшотами внутри окна (перезакупка между датами больше не маскирует
--   продажи предыдущего интервала — дефект старой версии «первая vs последняя»);
--   первый снапшот окна даёт 0 (нет базы сравнения до окна).
-- Форма результата прежняя: (sku text, sold int) — обратная совместимость.
-- Чтение anon — как раньше, через права владельца вью (security_invoker=false,
-- reloptions=null; RLS для вью не поддерживается).
-- Идемпотентен: create or replace.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.sc_popular_products as
with per_date as (
  select s.sku, s.snapshot_date, sum(coalesce(s.qty, 0)) as qty
  from stock_snapshots s
  where s.snapshot_date >= (select max(snapshot_date) from stock_snapshots) - 90
  group by s.sku, s.snapshot_date
),
seq as (
  select sku, snapshot_date, qty,
         lag(qty) over (partition by sku order by snapshot_date) as prev_qty
  from per_date
),
drops as (
  select sku, greatest(coalesce(prev_qty, qty) - qty, 0) as sold
  from seq
)
select sku, sum(sold)::integer as sold
from drops
group by sku
having sum(sold) > 0
order by sold desc;

-- Контроль:
--   select count(*) from sc_popular_products;       -- число SKU с продажами > 0
--   select * from sc_popular_products limit 12;     -- топ-12
