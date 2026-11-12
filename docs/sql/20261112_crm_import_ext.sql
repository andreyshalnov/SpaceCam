-- ============================================================================
-- SpaceCam · Расширение БД под импорт CRM-выгрузки 1С
--           «Объекты строительства 2023-2030 все SC&RL&PTK.xlsx»
-- Дата: 12.11.2026. Запуск: Supabase → SQL Editor (полностью, один раз).
-- Повторный запуск безопасен (idempotent).
--
-- Что делает:
--   1) расширяет справочник статусов objects: + «Объект оснащен», «Отклонен»
--      (реальные статусы CRM: 6 448 и 2 593 объекта из 22 568);
--   2) добавляет 2 типа объектов в object_types: «Торговая недвижимость» (702),
--      «Программы категории "Безопасный город" / "Безопасный регион"» (10);
--   3) добавляет колонку object_specs.extra (jsonb) — данные бренд-строки CRM:
--      техспециалист, поставщик, закупщик, факт, остаток, прибыль, рентабельность.
--
-- Решение владельца от 12.11.2026 (AskUserQuestion):
--   импортируются все 22 568 объектов; статусы — расширить справочник;
--   типы — добавить оба; бренд-строки — в существующие object_specs/items.
-- ============================================================================

begin;

-- 1. Статусы: 4 → 6
alter table objects drop constraint if exists objects_status_check;
alter table objects add constraint objects_status_check
  check (status in ('Новый', 'В работе', 'Реализация', 'Заморожен',
                    'Объект оснащен', 'Отклонен'));

-- 2. Типы объектов (совпадение по названию с выгрузкой 1С — обязательное)
insert into object_types (name, sort_order) values
  ('Торговая недвижимость', 150),
  ('Программы категории "Безопасный город" / "Безопасный регион"', 160)
on conflict (name) do nothing;

-- 3. Данные бренд-строки CRM на спецификации
alter table object_specs add column if not exists extra jsonb;

comment on column object_specs.extra is
  'CRM-данные бренд-строки 1С (импорт 12.11.2026): brand, tech (техспециалист), supplier, buyer (закупщик), fact, remain, profit, margin';

commit;

-- Контроль:
-- select unnest(array['Новый','В работе','Реализация','Заморожен','Объект оснащен','Отклонен']);
-- select name from object_types order by sort_order;            -- 16 значений
-- select column_name from information_schema.columns
--  where table_name='object_specs' and column_name='extra';     -- extra
