-- ============================================================================
-- Аудит доступа: RPC objects_audit_by_owner (только супер-администратор)
-- Дата: 16.11.2026
--
-- Назначение: вкладка «Аудит доступа» раздела «Регистрация проекта»
-- (#/project-reg) — сводка объектов базы по владельцам с разбивкой
-- [ДЕМО]/живые. Видна только супер-администратору andrey.shalnov@gmail.com
-- (проверка по e-mail из auth.users — надёжнее JWT-клейма).
--
-- Security definer: считает по ВСЕЙ таблице objects (RLS не режет),
-- поэтому исполнение жёстко ограничено супер-админом.
--
-- Применение: Supabase SQL Editor → вставить целиком → Run.
-- Идемпотентно: create or replace.
-- Откат: drop function public.objects_audit_by_owner();
-- ============================================================================

begin;

create or replace function public.objects_audit_by_owner()
returns table (
  owner_id uuid,
  login    text,
  role     text,
  total    bigint, -- всего объектов у владельца
  demo     bigint, -- из них с меткой [ДЕМО]
  live     bigint  -- из них живых (1C)
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'andrey.shalnov@gmail.com'
  ) then
    raise exception 'Аудит доступа доступен только супер-администратору';
  end if;

  return query
    select o.owner_id,
           p.login,
           p.role,
           count(o.id)::bigint,
           count(o.id) filter (where o.object_name like '[ДЕМО]%')::bigint,
           count(o.id) filter (where o.object_name not like '[ДЕМО]%')::bigint
    from public.objects o
    left join public.profiles p on p.id = o.owner_id
    group by o.owner_id, p.login, p.role
    order by p.login nulls last;
end;
$$;

-- EXECUTE по умолчанию выдаётся PUBLIC при create — забираем и разрешаем
-- только authenticated (анонимным и без входа — никак):
revoke all on function public.objects_audit_by_owner() from public, anon, authenticated;
grant execute on function public.objects_audit_by_owner() to authenticated;

commit;

-- Контроль (под супер-админом из приложения или в SQL Editor от postgres):
--   select * from public.objects_audit_by_owner();
