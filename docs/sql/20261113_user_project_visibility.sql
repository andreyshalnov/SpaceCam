-- ═════════════════════════════════════════════════════════════════════════════
-- 20261113_user_project_visibility.sql
-- Права доступа к проектам на уровне аккаунта: чекбоксы
-- «Видит все проекты» / «Видит свои проекты» (вкладка «Пользователи» админ-панели).
--
-- Управляют списком объектов в разделе «Объекты строительства» (#/project-reg).
-- Решение по умолчанию (согласовано 13.11.2026): ВСЕ аккаунты кроме admin
-- НЕ видят ни одного объекта, пока админ не выдаст доступ точечно.
--
-- Семантика (в JS null → false):
--   see_all_projects = true → пользователь видит все объекты базы;
--   see_own_projects = true → видит свои (owner_id) и соучастные объекты;
--   role = 'admin'          → всегда все объекты (чекбоксы в UI заблокированы).
--   оба false               → пустой список + баннер «Показ объектов ограничен
--                             администратором».
--
-- Серверная защита: чужие объекты отсекаются на стороне БД — витрина
-- objects_overview пересоздаётся с фильтром по правам аккаунта (базовая
-- информация ID/название/адрес больше не отдаётся всем подряд).
-- Полный доступ к своим/соучастным объектам по-прежнему обеспечивает RLS
-- таблицы objects (без изменений); собственные объекты остаются доступны
-- владельцу на уровне БД, но в UI при see_own_projects=false список пуст.
--
-- Откат: alter table profiles drop column see_all_projects, drop column
-- see_own_projects; пересоздать витрину без WHERE (см. 20261103_objects_schema.sql §8).
-- ═════════════════════════════════════════════════════════════════════════════

alter table profiles
  add column if not exists see_all_projects boolean not null default false;
alter table profiles
  add column if not exists see_own_projects boolean not null default false;

comment on column profiles.see_all_projects is
  'Видит все объекты базы в #/project-reg; admin видит все независимо от флага';
comment on column profiles.see_own_projects is
  'При see_all_projects=false: видит свои (owner_id) и соучастные объекты';

-- Админ видит всё всегда; флаги выставлены для консистентности отображения в UI.
update profiles set see_all_projects = true, see_own_projects = true where role = 'admin';

-- ── Витрина базовой информации: теперь с серверным фильтром прав ───────────
-- security_invoker = false — как в исходной миграции (осознанно: витрина
-- отдаёт базовую информацию без RLS), но состав строк ограничен профилем:
--   admin / see_all_projects=true  → все объекты базы;
--   остальные                      → только собственные (owner_id = auth.uid()).
-- auth.uid() вычисляется по JWT каждого запроса, витрина остаётся безопасной.
drop view if exists objects_overview;
create view objects_overview with (security_invoker = false) as
  select o.id, o.object_code, o.object_name, o.address, o.created_at
  from objects o
  where exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.see_all_projects)
  )
  or o.owner_id = auth.uid();

comment on view objects_overview is
  'Базовая информация об объектах: admin/see_all_projects — все; остальным — только собственные. Соучастным полный доступ даёт RLS objects.';

-- drop/create view сбрасывает права — восстанавливаем (§9 схемы 20261103):
revoke all on objects_overview from anon;
grant select on objects_overview to authenticated;
