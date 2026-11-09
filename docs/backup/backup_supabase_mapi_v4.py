#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Полный бэкап Supabase проекта SpaceCam через Management API (MAPI).

Запуск:  SBP_TOKEN=sbp_xxx python3 backup_supabase_mapi_v4.py [выходной-каталог]

MAPI нужен Personal Access Token (sbp_...) — supabase.com -> Access Tokens.
Анонимный/publishable ключ не подходит: RLS скрывает данные и служебные схемы.

Что делает:
  - дамп всех таблиц и вью схемы public (полные данные, SELECT *)
  - дамп auth.users (включая encrypted_password = bcrypt) и auth.identities
  - структура: колонки, констрейнты, триггеры схемы public
  - pg_policies (RLS) полностью, гранты public+auth
  - manifest.json: по каждому файлу число строк, размер, sha256 + ошибки

Секреты (e-mail, внутренние цены, bcrypt-хеши) в публичный репо НЕ класть.
"""
import json, os, sys, ssl, hashlib, urllib.request, urllib.error
from datetime import datetime, timezone

REF = "kgdrtrfwsyixprvuzdqj"
API = f"https://api.supabase.com/v1/projects/{REF}/database/query"
TOKEN = os.environ.get("SBP_TOKEN", "")
if not TOKEN:
    sys.exit("Нужен SBP_TOKEN (sbp_..., supabase.com -> Access Tokens)")

OUT = sys.argv[1] if len(sys.argv) > 1 else f"supabase_backup_{datetime.now(timezone.utc):%Y%m%d}"
os.makedirs(OUT, exist_ok=True)
CTX = ssl.create_default_context()

def mapi(sql):
    """Выполняет SQL через Management API, возвращает список строк."""
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=300, context=CTX) as r:
        return json.loads(r.read().decode())

manifest = {
    "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    "project_ref": REF,
    "tool": "backup_supabase_mapi_v4.py",
    "files": [], "errors": [], "counts": {},
}

def save(name, rows):
    """Пишет JSON-файл и регистрирует его в манифесте."""
    path = os.path.join(OUT, name)
    data = json.dumps(rows, ensure_ascii=False, indent=1).encode()
    with open(path, "wb") as f:
        f.write(data)
    manifest["files"].append({
        "name": name, "rows": len(rows), "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
    manifest["counts"][name] = len(rows)
    print(f"  {name}: {len(rows)} строк, {len(data)//1024} КиБ")

def dump(name, sql):
    try:
        save(name, mapi(sql))
    except Exception as e:
        body = ""
        if isinstance(e, urllib.error.HTTPError):
            try: body = e.read().decode()[:500]
            except Exception: pass
        msg = f"{name}: {e} {body}"
        manifest["errors"].append(msg)
        print(f"  ОШИБКА {msg}")

# 0) инфо о БД
print("[0/7] Инфо о БД")
dump("_db_info.json", "SELECT version() AS version, current_database() AS db, current_user AS usr, pg_size_pretty(pg_database_size(current_database())) AS size")

# 1) список объектов схемы public
print("[1/7] Список таблиц/вью public")
objs = mapi("SELECT table_schema, table_name, table_type FROM information_schema.tables "
            "WHERE table_schema='public' AND table_type IN ('BASE TABLE','VIEW') ORDER BY 1,2")
tables = [o["table_name"] for o in objs if o["table_type"] == "BASE TABLE"]
views  = [o["table_name"] for o in objs if o["table_type"] == "VIEW"]
print(f"  таблиц: {len(tables)}, вью: {len(views)}")

# 2) данные таблиц public
print("[2/7] Данные таблиц public")
for t in tables:
    q = t.replace('"', '""')
    dump(f"public__{q}.json", f'SELECT * FROM public."{q}"')
    # контроль полноты: сверяем с count(*)
    try:
        cnt = mapi(f'SELECT count(*)::int AS n FROM public."{q}"')[0]["n"]
        if cnt != manifest["counts"].get(f"public__{q}.json"):
            manifest["errors"].append(f"{t}: count={cnt}, выгружено={manifest['counts'].get(f'public__{q}.json')}")
    except Exception as e:
        manifest["errors"].append(f"{t}: count-проверка не прошла: {e}")

# 3) данные вью public
print("[3/7] Данные вью public")
for v in views:
    q = v.replace('"', '""')
    dump(f"public__view__{q}.json", f'SELECT * FROM public."{q}"')
dump("public__views_definitions.json",
     "SELECT schemaname, viewname, definition FROM pg_views WHERE schemaname='public' ORDER BY viewname")

# 4) auth
print("[4/7] auth.users (bcrypt) и auth.identities")
dump("auth__users.json", "SELECT * FROM auth.users ORDER BY created_at")
dump("auth__identities.json", "SELECT * FROM auth.identities")

# 5) структура public
print("[5/7] Структура: колонки, констрейнты, триггеры")
dump("_schema_columns.json",
     "SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default, "
     "character_maximum_length, numeric_precision, numeric_scale "
     "FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position")
dump("_schema_constraints.json",
     "SELECT n.nspname AS schema, c.relname AS table_name, con.conname AS constraint_name, "
     "con.contype, pg_get_constraintdef(con.oid) AS definition "
     "FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid "
     "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname, con.conname")
dump("_schema_triggers.json",
     "SELECT trigger_schema, event_object_table, trigger_name, action_timing, event_manipulation, "
     "action_statement FROM information_schema.triggers WHERE trigger_schema IN ('public','auth') "
     "ORDER BY event_object_table, trigger_name")

# 6) RLS и гранты
print("[6/7] RLS-политики и гранты")
dump("_policies.json", "SELECT * FROM pg_policies ORDER BY schemaname, tablename, policyname")
dump("_grants.json",
     "SELECT table_schema, table_name, grantee, privilege_type "
     "FROM information_schema.role_table_grants WHERE table_schema IN ('public','auth') "
     "ORDER BY table_schema, table_name, grantee, privilege_type")

# 7) манифест
print("[7/7] Манифест")
manifest["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
mpath = os.path.join(OUT, "_manifest.json")
with open(mpath, "w") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)

print(f"\nИтог: {len(manifest['files'])} файлов, ошибок: {len(manifest['errors'])}")
for e in manifest["errors"]:
    print("  !", e)
print("Готово:", OUT)
sys.exit(1 if manifest["errors"] else 0)
