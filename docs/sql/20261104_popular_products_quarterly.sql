-- ═══════════════════════════════════════════════════════════════════════════
-- SpaceCam · 04.11.2026 · sc_popular_products: топ продаж за настраиваемый период
-- СТАТУС: ПОДГОТОВЛЕН, НЕ ПРИМЕНЁН — Management API с 04.11 работает только на
-- чтение (роль supabase_read_only_user), DDL через него невозможен.
-- Применение: Supabase Studio → SQL Editor → вставить целиком → Run.
-- Идемпотентен (create or replace view); гранты и владелец (postgres)
-- сохраняются, anon-чтение сайта не прерывается.
-- ═══════════════════════════════════════════════════════════════════════════
-- Постановка владельца (04.11): «флагманы линейки — топ-продукт из каждой
-- группы товаров (узлы коммутации, домофоны, коммутаторы, замки); период
-- настраивается в админке, по умолчанию — квартал (напр. выгрузка
-- 01.07–01.10.2026)».
--
-- Алгоритм:
--   • Период: ключи app_settings popular_from / popular_to ('YYYY-MM-DD'),
--     задаются из админки сайта (#/admin-prices → «Продажи в штуках» →
--     «Период топа продаж на главной»). Пусто/нет ключей — дефолт: прошлый
--     ЗАВЕРШЁННЫЙ квартал относительно даты ПОСЛЕДНЕГО снимка остатков
--     (данные до 29.10.2026 → окно 01.07.2026–01.10.2026 — ровно пример
--     владельца; когда накопится Q4, дефолт сам сместится на 01.10–01.01).
--   • Страховка: если в окне меньше 2 дат снимков (не с чем сравнивать),
--     конец окна расширяется до последнего снимка — блок не остаётся пустым.
--   • Продажи SKU: сумма ПОЛОЖИТЕЛЬНЫХ снижений остатка между соседними
--     снимками внутри окна (перезакупка между датами не маскирует продажи —
--     дефект старой версии «первая выгрузка против последней» исправлен).
--     Первый снимок окна даёт 0 (нет базы сравнения до окна).
--   • Выход: (sku text, sold int, period_from date, period_to date).
--     sku/sold — как прежде (обратная совместимость); даты периода фронтенд
--     показывает в подзаголовках блоков. Разбивку «топ-1 из каждой группы»
--     делает фронтенд: справочник секций — статический products.json,
--     в БД групп товаров нет.
--   • Чтение anon — как раньше: вью работает с правами владельца (postgres),
--     security_invoker не включён; app_settings внутри вью читается без RLS.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.sc_popular_products as
with lim as (
  select max(snapshot_date) as last_date from stock_snapshots
),
dflt as (
  select
    (date_trunc('quarter', lim.last_date) - interval '3 month')::date as d1,
    date_trunc('quarter', lim.last_date)::date as d2q,
    lim.last_date
  from lim
),
cfg as (
  select
    coalesce(
      nullif((select value from app_settings where key = 'popular_from'), '')::date,
      dflt.d1
    ) as d1,
    coalesce(
      nullif((select value from app_settings where key = 'popular_to'), '')::date,
      dflt.d2q
    ) as d2,
    dflt.last_date
  from dflt
),
cfg2 as (
  select
    c.d1 as d1,
    case
      when (select count(distinct s.snapshot_date) from stock_snapshots s
            where s.snapshot_date between c.d1 and c.d2) >= 2
      then c.d2
      else c.last_date
    end as d2
  from cfg c
),
per_date as (
  select s.sku, s.snapshot_date, sum(coalesce(s.qty, 0)) as qty
  from stock_snapshots s cross join cfg2 c
  where s.snapshot_date between c.d1 and c.d2
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
select
  d.sku,
  sum(d.sold)::integer as sold,
  c.d1 as period_from,
  c.d2 as period_to
from drops d cross join cfg2 c
group by d.sku, c.d1, c.d2
having sum(d.sold) > 0
order by sold desc;

-- Контроль после применения:
--   select * from sc_popular_products limit 12;                  -- sku, sold, период
--   select distinct period_from, period_to from sc_popular_products;  -- окно по умолчанию
--   -- после задания дат в админке (popular_from/popular_to):
--   select distinct period_from, period_to from sc_popular_products;  -- окно сменилось
