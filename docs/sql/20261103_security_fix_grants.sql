-- ═══════════════════════════════════════════════════════════════════════════
-- SpaceCam: фикс грантов объектной схемы (применён 03.11.2026 через Management API)
-- ═══════════════════════════════════════════════════════════════════════════
-- Причина: витрина objects_overview создавалась как security_invoker = false
-- (специально — чтобы базовая информация об объектах была видна всем
-- аутентифицированным), но Supabase по умолчанию выдаёт рольам anon и
-- authenticated полный набор грантов на новые объекты. Витрина унаследовала
-- дефолтные гранты: anon мог ВИДЕТЬ витрину, а anon/authenticated имели
-- INSERT/UPDATE/DELETE на автоподобновляемой витрине — обход RLS через
-- владельца представления (postgres).
--
-- Модель доступа (RLS-политики, 18 шт):
--   admin / владелец объекта / соучастник — полный CRUD по таблицам;
--   остальные аутентифицированные — только SELECT витрины objects_overview;
--   аноним — ничего (REST возвращает 401 на витрину, [] на таблицы).
--
-- Скрипт идемпотентен: повторный запуск не меняет состояние.
-- Проверенное состояние грантов на 04.11.2026 — в комментарии в конце файла.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Анониму — снять всё с витрины и таблиц объектов
REVOKE ALL ON objects_overview FROM anon;
REVOKE ALL ON object_types          FROM anon;
REVOKE ALL ON objects               FROM anon;
REVOKE ALL ON object_participants   FROM anon;
REVOKE ALL ON object_specs          FROM anon;
REVOKE ALL ON object_spec_items     FROM anon;
REVOKE ALL ON app_settings          FROM anon;

-- 2) Аутентифицированным — убрать мутации витрины (оставить только чтение)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON objects_overview FROM authenticated;
GRANT SELECT ON objects_overview TO authenticated;

-- 3) Нумератор кодов объектов (М00090xxx) — наружу не отдаётся:
--    sequence используется функцией генерации object_code, прямых грантов
--    anon/authenticated на неё нет (проверено 04.11.2026 — пусто).

-- ── Верификация (после применения): ─────────────────────────────────────────
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema='public' and grantee in ('anon','authenticated')
--   and (table_name like 'object%' or table_name='app_settings')
-- order by table_name, grantee, privilege_type;
--
-- ── Измеренное состояние 04.11.2026 (эталон): ───────────────────────────────
-- app_settings        authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- object_participants authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- object_spec_items   authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- object_specs        authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- object_types        authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- objects             authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- objects_overview    authenticated  SELECT
-- (grantee = anon — ни одной строки; строки RLS-политик решают, какие именно
--  строки authenticated видит и меняет)
-- ═══════════════════════════════════════════════════════════════════════════
