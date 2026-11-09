#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Загрузка выгрузок 1С «Анализ доступности» (SC&RL Наличие *.xlsx) в Supabase.

Правило владельца (уточнено 09.11.2026):
  - ВСЕ московские склады во всех выгрузках консолидируются на складе
    «Внуково» (id 1): если в файле есть и Внуково, и московский склад/транзит
    (Очаково; в фактических файлах 2024 г. он назывался «Склад Саларьево»;
    «Транзит Внуково», «Транзит Саларьево», «Транзит Очаково») — количество
    Внуково = Внуково + все московские группы; если только старый — он
    записывается как Внуково. Отдельные склады не создаются (исторические
    склады id 25 «Транзит Внуково» и id 31 «Транзит Саларьево» слиты в id 1
    и удалены из справочника 09.11.2026).
  - списания («Недостача Очаково» id 23, «Брак Внуково» id 21) — служебные
    склады списаний, их не трогаем: это не товарные остатки.
  - неопознанные служебные группы (Пятигорск, Транзит РЦ Краснодар) создаются
    в справочнике warehouses КАК НЕАКТИВНЫЕ, чтобы не терять данные и не влиять
    на расчёт продаж (он учитывает только активные).

Метрика: колонка «В ед. хранения» ПОД группой «Остаток» (в файлах 2024-2025
первая такая колонка = «Заказано у поставщиков» — брать её нельзя).

Запуск:
  SBP_TOKEN=sbp_xxx python3 load_stock_history.py [папка-с-xlsx]           # проверка (без записи)
  SBP_TOKEN=sbp_xxx python3 load_stock_history.py [папка-с-xlsx] --write   # записать в БД
"""
import glob
import json
import os
import re
import ssl
import sys
import urllib.request

import openpyxl

REF = "kgdrtrfwsyixprvuzdqj"
API = f"https://api.supabase.com/v1/projects/{REF}/database/query"
TOKEN = os.environ.get("SBP_TOKEN", "")
UPLOAD = next((a for a in sys.argv[1:] if not a.startswith('--')),
              '/home/z/my-project/upload')
OUT_REPORT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          'stock_load_report.json')
WRITE = '--write' in sys.argv
CTX = ssl.create_default_context()


def mapi(sql):
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300, context=CTX) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"MAPI {e.code}: {e.read().decode()[:300]}") from e


# ---------------------------------------------------------------- нормализация
CYR = str.maketrans({'С': 'C', 'Х': 'X', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K',
                     'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'У': 'Y'})


def normalize_sku(raw: str) -> str:
    s = str(raw or '').strip().upper().translate(CYR)
    s = re.sub(r'\s+', '', s)
    s = s.replace('(А)', '(A)')
    s = re.sub(r'\(([A-Z\u0410-\u042F])\)$', r'-\1', s)
    s = re.sub(r'[^0-9A-Z-]', '', s)
    return s.lower()


def norm_wh(v) -> str:
    s = str(v or '').lower().replace('ё', 'е')
    s = re.sub(r'[<>.,]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


# ------------------------------------------------------------- справочник складов
# Основной московский склад: ВСЕ московские имена → Внуково (id 1),
# включая транзиты (правило владельца: «все московские склады = Внуково»).
MAIN_TO_VNKOVO = {
    'внуково': 1, 'очаково': 1, 'саларьево': 1,
    'транзит внуково': 1, 'транзит очаково': 1, 'транзит саларьево': 1,
}
# Служебные склады (как в админке, SPECIAL_WAREHOUSES); московские транзиты
# сюда НЕ входят — они консолидируются в Внуково (MAIN_TO_VNKOVO).
SPECIAL = {
    'брак внуково': 21, 'демозал саратов': 22, 'недостача очаково': 23,
    'недостача симферополь': 24,
    'транзит г санкт-петербург': 26, 'транзит рц ростов-на-дону': 27,
    'транзит г симферополь': 28,
}
BASE = {
    'пожтехкабель': 2, 'рц краснодар': 3, 'рц ростов-на-дону': 4,
    'санкт-петербург': 5, 'спб': 5, 'саратов трофимовский': 6, 'саратов': 6,
    'симферополь': 7, 'ставрополь': 8,
}
# Неопознанные группы → новые НЕАКТИВНЫЕ склады (code, name, sort_order).
# id выдаёт identity-последовательность (GENERATED ALWAYS), явный id запрещён.
NEW_WAREHOUSES = {
    'пятигорск': ('pyatigorsk', 'Пятигорск', 90),
    'транзит рц краснодар': ('tranzit-rc-krasnodar', 'Транзит РЦ Краснодар', 92),
}
WH_RE = re.compile(r'^(склад|транзит|брак|демозал|недостача)[ \u00A0]', re.I)
METRIC_GROUPS = {'остаток', 'свободный остаток', 'заказано у поставщиков',
                 'зарезервировано', 'себестоимость'}

NEW_WH_IDS = {}  # нормализованное имя -> id (заполняется из БД)


def wh_id(name: str):
    """id склада по названию группы; None — не распознано."""
    t0 = norm_wh(name)
    if not t0:
        return None
    if t0.startswith('объект не найден'):
        return 29
    n0 = re.sub(r'^склад ', '', t0)
    if n0 in MAIN_TO_VNKOVO:
        return 1
    if t0 in SPECIAL:
        return SPECIAL[t0]
    if n0 in BASE:
        return BASE[n0]
    return NEW_WH_IDS.get(n0)


def resolve_warehouses():
    """Читает справочник складов, при --write добавляет недостающие неактивные."""
    existing = mapi("SELECT id, code, name FROM warehouses ORDER BY id")
    by_code = {r['code']: r['id'] for r in existing}
    created = []
    for key, (code, name, sort) in NEW_WAREHOUSES.items():
        if code in by_code:
            NEW_WH_IDS[key] = by_code[code]
        elif WRITE:
            mapi("INSERT INTO warehouses (code, name, is_active, sort_order) "
                 f"VALUES ('{code}', '{name}', false, {sort})")
            NEW_WH_IDS[key] = mapi(f"SELECT id FROM warehouses WHERE code='{code}'")[0]['id']
            created.append(f"  + склад id={NEW_WH_IDS[key]}: {name} (неактивный)")
    for line in created:
        print(line)
    return {r['id']: r['name'] for r in existing}


def parse_file(path):
    """→ (date, {(wh_id, sku): qty}, diag)"""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    grid = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()

    report_date = None
    for row in grid[:12]:
        for c in row:
            if c is None:
                continue
            m = re.search(r'на конец дня\s*(\d{1,2})\.(\d{1,2})\.(\d{4})', str(c))
            if m and not report_date:
                report_date = f'{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}'
    if not report_date:
        raise RuntimeError('нет даты «на конец дня»')

    head_i = None
    for i, row in enumerate(grid):
        if any(norm_wh(c) == 'номенклатура' for c in row):
            head_i = i
            break
    if head_i is None:
        raise RuntimeError('нет строки «Номенклатура»')
    subrow = grid[head_i]
    grp_i = None
    for k in range(head_i - 1, max(head_i - 5, -1), -1):
        vals = [norm_wh(c) for c in grid[k]]
        if any(v in METRIC_GROUPS for v in vals):
            grp_i = k
            break
    if grp_i is None:
        raise RuntimeError('нет строки групп метрик')
    grprow = grid[grp_i]

    marks = [(j, norm_wh(c)) for j, c in enumerate(grprow)
             if c is not None and norm_wh(c) in METRIC_GROUPS]
    qty_col = None
    for idx, (j, gname) in enumerate(marks):
        if gname != 'остаток':
            continue
        j_end = marks[idx + 1][0] if idx + 1 < len(marks) else len(grprow)
        for c in range(j, j_end):
            if norm_wh(subrow[c] if c < len(subrow) else None) == 'в ед хранения':
                qty_col = c
                break
        break
    if qty_col is None:
        raise RuntimeError('не найдена колонка «В ед. хранения» под группой «Остаток»')

    acc = {}
    diag = {'unmapped_groups': {}, 'bad_qty': [], 'qty_col_1based': qty_col + 1,
            'warehouses': {}}
    cur = None
    for i in range(head_i + 2, len(grid)):
        cells = grid[i]
        name = str(cells[1] or '').strip()
        if not name:
            continue
        if norm_wh(name) == 'итог':
            break
        if WH_RE.match(name) or norm_wh(name).startswith('объект не найден'):
            cur = wh_id(name)
            if cur is None:
                diag['unmapped_groups'][name] = diag['unmapped_groups'].get(name, 0) + 1
            continue
        if cur is None:
            continue
        raw = cells[qty_col] if qty_col < len(cells) else None
        if raw is None or raw == '':
            continue
        try:
            q = float(raw) if isinstance(raw, (int, float)) else float(
                str(raw).replace('\xa0', '').replace(' ', '').replace(',', '.'))
        except ValueError:
            diag['bad_qty'].append(name[:60])
            continue
        if q < 0:
            continue
        q = int(q) if float(q).is_integer() else q
        clean = re.sub(r'^комплект давальческого сырья для\s+', '', name, flags=re.I)
        parts = re.split(r'\s+', clean)
        sku = normalize_sku(parts[1] if len(parts) > 1 and parts[1] else parts[0])
        if not sku:
            continue
        key = (cur, sku)
        acc[key] = acc.get(key, 0) + q
        diag['warehouses'].setdefault(name, 0)
        diag['warehouses'][name] += 1
    return report_date, acc, diag


def parse_all(files):
    parsed, order = {}, []
    for f in files:
        date, acc, diag = parse_file(f)
        parsed[date] = acc
        order.append(date)
        flag = f" !!! нераспознаны: {diag['unmapped_groups']}" if diag['unmapped_groups'] else ''
        print(f"{os.path.basename(f)} -> {date}: строк {len(acc)}, "
              f"колонка qty = {diag['qty_col_1based']}, штук {sum(acc.values())}{flag}")
    return parsed, order


def main():
    files = sorted(glob.glob(os.path.join(UPLOAD, 'SC&RL*Наличие*.xlsx')))
    wh_names = resolve_warehouses()
    parsed, order = parse_all(files)

    print('\nСумма штук по складам (все 12 файлов):')
    sums = {}
    for acc in parsed.values():
        for (wh, _sku), q in acc.items():
            sums[wh] = sums.get(wh, 0) + q
    for wh in sorted(sums):
        print(f"  warehouse_id {wh} ({wh_names.get(wh, '?')}): {sums[wh]}")

    db_rows = mapi("SELECT snapshot_date, warehouse_id, sku, qty FROM stock_snapshots ORDER BY 1")
    db = {}
    for r in db_rows:
        db.setdefault(r['snapshot_date'], {})[(r['warehouse_id'], r['sku'])] = r['qty']
    print('\nДаты в БД:', sorted(db))
    only_files = sorted(set(parsed) - set(db))
    print('НОВЫЕ даты (будут добавлены):', only_files)

    diff_total = {'only_db': 0, 'only_file': 0, 'qty_diff': 0}
    diff_samples = []
    for d in sorted(set(parsed) & set(db)):
        a, b = parsed[d], db[d]
        only_db, only_file = set(b) - set(a), set(a) - set(b)
        qdiff = [(k, a[k], b[k]) for k in set(a) & set(b) if a[k] != b[k]]
        diff_total['only_db'] += len(only_db)
        diff_total['only_file'] += len(only_file)
        diff_total['qty_diff'] += len(qdiff)
        if only_db or only_file or qdiff:
            print(f'\n  ДИФФ {d}: только в БД {len(only_db)}, только в файле {len(only_file)}, '
                  f'расхождение qty {len(qdiff)}')
            for k in list(only_db)[:5]:
                diff_samples.append((d, k, 'only_db', b[k]))
            for k in list(only_file)[:5]:
                diff_samples.append((d, k, 'only_file', a[k]))
            for k, va, vb in qdiff[:5]:
                diff_samples.append((d, k, 'qty', f'файл={va} бд={vb}'))
        else:
            print(f'  {d}: полное совпадение ({len(a)} строк)')
    for s in diff_samples[:25]:
        print('   ', s)

    if not WRITE:
        print('\n[РЕЖИМ ПРОВЕРКИ] ничего не записано. Для записи: --write')
        json.dump({'dates': order, 'diff_total': diff_total,
                   'diff_samples': diff_samples[:50]}, open(OUT_REPORT, 'w'),
                  ensure_ascii=False, indent=1)
        return

    print('\n[ЗАПИСЬ]')
    rows = [(d, sku, wh, q) for d, acc in parsed.items() for (wh, sku), q in acc.items()]
    total = 0
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        values = ','.join(f"('{d}','{sku}',{wh},{q})" for d, sku, wh, q in chunk)
        mapi("INSERT INTO stock_snapshots (snapshot_date, sku, warehouse_id, qty) "
             f"VALUES {values} ON CONFLICT (snapshot_date, sku, warehouse_id) "
             "DO UPDATE SET qty = EXCLUDED.qty")
        total += len(chunk)
        print(f'  upsert {total}/{len(rows)}')
    cnt = mapi("SELECT snapshot_date, count(*) n, sum(qty) units "
               "FROM stock_snapshots GROUP BY 1 ORDER BY 1")
    print('\nИтог в БД:')
    for r in cnt:
        print(f"  {r['snapshot_date']}: {r['n']} строк, {r['units']} шт")
    json.dump({'written': total, 'dates': order, 'diff_total': diff_total},
              open(OUT_REPORT, 'w'), ensure_ascii=False, indent=1)
    print('saved ->', OUT_REPORT)


if __name__ == '__main__':
    main()
