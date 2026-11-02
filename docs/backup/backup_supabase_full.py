#!/usr/bin/env python3
"""Полный бэкап БД SpaceCam (Supabase). Запускать с service-ключом:
  SUPABASE_SERVICE_KEY=xxx python3 backup_supabase_full.py [выходной-каталог]
Анонимный ключ НЕ подходит: RLS скрывает prices/stock/warehouses/profiles/projects.
Складывает JSON каждой таблицы + schema-сводку (OpenAPI). Секреты в репо не класть."""
import json, os, sys, urllib.request, datetime

KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not KEY:
    sys.exit("Нужен SUPABASE_SERVICE_KEY (Supabase -> Settings -> API -> service_role key)")
BASE = "https://kgdrtrfwsyixprvuzdqj.supabase.co/rest/v1"
OUT = sys.argv[1] if len(sys.argv) > 1 else f"supabase_backup_{datetime.date.today():%Y%m%d}"
os.makedirs(OUT, exist_ok=True)

TABLES = ["prices", "price_types", "stock", "warehouses", "user_price_types",
          "profiles", "projects", "news", "stock_snapshots",
          "sc_stock_backup_20261020", "sc_popular_products"]

def get(url, headers=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    if headers: h.update(headers)
    with urllib.request.urlopen(urllib.request.Request(url, headers=h)) as r:
        return r.read().decode(), dict(r.headers)

summary = {}
for t in TABLES:
    rows, off = [], 0
    while True:
        body, hdr = get(f"{BASE}/{t}?select=*&limit=1000&offset={off}",
                        {"Prefer": "count=exact"})
        part = json.loads(body)
        rows += part
        if len(part) < 1000: break
        off += 1000
    json.dump(rows, open(f"{OUT}/{t}.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    summary[t] = len(rows)
    print(f"{t}: {len(rows)} строк")

try:
    spec, _ = get(f"{BASE}/")
    open(f"{OUT}/_openapi.json", "w").write(spec)
    print("OpenAPI: сохранён (_openapi.json)")
except Exception as e:
    print("OpenAPI: недоступен", e)

json.dump(summary, open(f"{OUT}/_summary.json", "w"), indent=1)
print("Готово:", OUT)
