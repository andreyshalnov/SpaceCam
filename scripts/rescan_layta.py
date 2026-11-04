# -*- coding: utf-8 -*-
"""Пересканирование карточек layta.ru для всех продуктов сайта SpaceCam.

1) SKU → layta URL: нормализованное вхождение SKU в slug из выгрузки sitemap
   (scripts/layta_all_urls.json, layta.ru, 26.10.2026).
2) Живая загрузка карточки (HTML → __NEXT_DATA__ → props.pageProps.baseProduct),
   кэш в scripts/layta_cards/<id>.json, верификация vendor_code.
3) Фото: докачка недостающих снимков галереи (до 6 на продукт) в
   public/products/..., дедупликация по md5, конверсия в JPEG через PIL.
4) Specs: атрибуты карточки layta + доп. характеристики, извлечённые из
   описаний (проект + layta). Формат как у RL-EM350-LSS: [{"name","value"}].
5) Отчёт: scripts/layta_rescan_report.json + краткая сводка в stdout.

Запуск: python3 scripts/rescan_layta.py            # полный прогон
        python3 scripts/rescan_layta.py --dry      # без записи products.json
"""
import io
import json
import os
import re
import sys
import time
import hashlib
import urllib.request
import urllib.parse

BASE = '/home/z/my-project'
REPO = f'{BASE}/scripts/spacecam-repo'
PROD_JSON = f'{REPO}/src/data/products.json'
CARDS_DIR = f'{BASE}/scripts/layta_cards'
REPORT = f'{BASE}/scripts/layta_rescan_report.json'
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}
MAX_PHOTOS = 6
DRY = '--dry' in sys.argv

os.makedirs(CARDS_DIR, exist_ok=True)


_HOMO = str.maketrans({
    'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h',
    'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x',
    'А': 'a', 'В': 'b', 'Е': 'e', 'К': 'k', 'М': 'm', 'Н': 'h',
    'О': 'o', 'Р': 'p', 'С': 'c', 'Т': 't', 'У': 'y', 'Х': 'x'})


def norm(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', (s or '').lower().translate(_HOMO))


def http_get(url: str, timeout=35, retries=2):
    last = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def fetch_card(layta_id: int, url: str):
    """Карточка layta по реальному URL с дисковым кэшем."""
    cache = f'{CARDS_DIR}/{layta_id}.json'
    if os.path.exists(cache):
        try:
            return json.load(open(cache))
        except Exception:  # noqa: BLE001
            pass
    html = http_get(url).decode('utf-8', 'ignore')
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError('no __NEXT_DATA__')
    d = json.loads(m.group(1))
    bp = (d.get('props', {}).get('pageProps', {}) or {}).get('baseProduct') or {}
    if not isinstance(bp, dict) or not (bp.get('name') or bp.get('vendor_code')):
        raise RuntimeError('no baseProduct')
    json.dump(bp, open(cache, 'w'), ensure_ascii=False)
    time.sleep(0.35)
    return bp


# ── 1. карта URL ─────────────────────────────────────────────────────────────
def build_url_index():
    urls = json.load(open(f'{BASE}/scripts/layta_all_urls.json'))
    prod_urls = [u for u in urls if '/product/' in u and re.search(r'-\d+$', u.rstrip('/'))]
    idx = []
    for u in prod_urls:
        slug = u.rstrip('/').split('/product/')[-1]
        idx.append((norm(slug), u))
    return idx


def find_candidates(sku: str, idx, limit=4):
    ns = norm(sku)
    if len(ns) < 5:
        return []
    hits = [(u, nu) for nu, u in idx if ns in nu]
    # короче slug → ближе к карточке именно этого SKU
    hits.sort(key=lambda x: len(x[0]))
    return [u for u, _ in hits[:limit]]


def card_matches(p, bp) -> bool:
    """vendor_code совпал ИЛИ (vendor_code пуст и SKU в названии/коде страницы)."""
    sku = norm(p['sku'])
    vc = norm(bp.get('vendor_code'))
    if vc:
        return vc == sku
    name = norm(bp.get('name') or '')
    code = norm(bp.get('code') or '')
    return sku in name or sku == code or sku in code


# ── 2. фото ──────────────────────────────────────────────────────────────────
def md5b(b: bytes) -> str:
    return hashlib.md5(b).hexdigest()


def to_jpeg(raw: bytes) -> bytes:
    from PIL import Image
    im = Image.open(io.BytesIO(raw))
    if im.mode != 'RGB':
        im = im.convert('RGB')
    out = io.BytesIO()
    im.save(out, 'JPEG', quality=88)
    return out.getvalue()


def update_photos(p, card, report):
    """Докачать недостающие снимки галереи. Возвращает (добавлено, новых_ссылок)."""
    images = p.get('images') or []
    if not images:
        return 0
    first = images[0]
    local_dir = os.path.dirname(f'{BASE}/public{first}')
    is_rlock = p.get('section') == 'rlock'
    base_name = os.path.splitext(os.path.basename(first))[0]  # у rlock = slug
    have = {}  # md5 → существующий путь (public/...)
    for rel in images:
        fp = f'{BASE}/public{rel}'
        if os.path.exists(fp):
            have[md5b(open(fp, 'rb').read())] = rel

    gallery = []
    for im in ([{'url': card.get('main_image')}] + (card.get('images') or [])):
        u = (im or {}).get('url') or ''
        if u and u not in gallery:
            gallery.append(u)
    if not gallery:
        return 0

    added = 0
    for u in gallery:
        if len(images) >= MAX_PHOTOS:
            break
        try:
            raw = http_get(u, timeout=45)
        except Exception:  # noqa: BLE001
            continue
        h = md5b(raw)
        if h in have:
            continue
        jpg = to_jpeg(raw)
        if md5b(jpg) in have:
            continue
        n = len(images) + 1
        if is_rlock:
            fname = f'{base_name}.jpg' if n == 1 else f'{base_name}-{n}.jpg'
        else:
            fname = f'{n:02d}.jpg'
        rel = '/products/' + (f"rlock/{fname}" if is_rlock else
                              os.path.basename(local_dir) + f'/{fname}')
        fp = f'{BASE}/public{rel}'
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        open(fp, 'wb').write(jpg)
        have[md5b(jpg)] = rel
        images.append(rel)
        added += 1
    if added:
        p['images'] = images
    return added


# ── 3. specs ─────────────────────────────────────────────────────────────────
STOP_NAMES = {'описание', 'характеристики', 'комплектация', 'внимание', 'особенности', 'гарантия'}


def attrs_to_specs(card):
    out, seen = [], set()
    for a in (card.get('attributes') or []):
        name = str(a.get('name') or '').strip()
        vals = a.get('values') or []
        raw = (vals[0].get('value') if vals else '')
        raw = raw.get('value') if isinstance(raw, dict) else raw
        val = ('' if raw is None else str(raw)).strip()
        if not name or not val or name.lower() in seen or name.lower() in STOP_NAMES:
            continue
        seen.add(name.lower())
        out.append({'name': name, 'value': val[:120]})
    return out


DESC_LINE = re.compile(
    r'^\s*([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 ,./()%°+\-–—×xх]{1,45}?)\s*[:：]\s*(\S.{0,90}?)\s*$')
DESC_UNIT = re.compile(
    r'^\s*([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9 ,./()%°+\-–—]{3,42}?)\s+'
    r'(-?\d+[,\.]?\d*\s*[А-Яа-яA-Za-z%°/]{1,10}(?:\s*[×xх]\s*\d+)?(?:\s*[А-Яа-яA-Za-z%°/]{1,10})?)\s*$')


def extras_from_description(text, existing_names, limit=12):
    out, seen = [], {n.lower() for n in existing_names}
    for line in (text or '').splitlines():
        line = line.strip()
        if not line or len(line) > 120:
            continue
        m = DESC_LINE.match(line)
        name, val = (m.group(1), m.group(2)) if m else (None, None)
        if not name:
            m2 = DESC_UNIT.match(line)
            if m2:
                name, val = m2.group(1), m2.group(2)
        if not name or not val:
            continue
        name = name.strip(' .;,-–—')
        val = val.strip(' .;')
        nl = name.lower()
        if (len(name) < 3 or len(val) < 1 or nl in seen or nl in STOP_NAMES):
            continue
        seen.add(nl)
        out.append({'name': name, 'value': val})
        if len(out) >= limit:
            break
    return out


def build_specs(p, card):
    layta_desc = (card or {}).get('description') or ''
    specs = attrs_to_specs(card) if card else []
    names = [s['name'] for s in specs]
    extras = extras_from_description(p.get('description') or '', names)
    if not extras:
        extras = extras_from_description(layta_desc, names, limit=6)
    specs += extras
    # прежние осмысленные specs (если что-то осталось) — в конец, без дублей
    have = {s['name'].lower() for s in specs}
    for s in (p.get('specs') or []):
        if s.get('name') and s.get('value') and s['name'].lower() not in have:
            specs.append({'name': s['name'], 'value': str(s['value'])[:120]})
            have.add(s['name'].lower())
    return specs[:20]


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    prods = json.load(open(PROD_JSON))
    print(f'продуктов: {len(prods)}')
    idx = build_url_index()
    print(f'layta URL в индексе: {len(idx)}')

    report = []
    n_card, n_ambig, n_nocard, photos_total, specs_total = 0, 0, 0, 0, 0
    for i, p in enumerate(prods):
        sku = p['sku']
        cand = find_candidates(sku, idx)
        card, used = None, None
        for u in cand:
            try:
                layta_id = int(u.rstrip('/').rsplit('-', 1)[-1])
                bp = fetch_card(layta_id, u)
            except Exception as e:  # noqa: BLE001
                report.append({'sku': sku, 'step': 'fetch', 'error': str(e)[:120], 'url': u})
                continue
            if card_matches(p, bp):
                card, used = bp, u
                break
        photos = 0
        if card:
            n_card += 1
            try:
                if not DRY:
                    photos = update_photos(p, card, report)
                photos_total += photos
            except Exception as e:  # noqa: BLE001
                report.append({'sku': sku, 'step': 'photos', 'error': str(e)[:120]})
            specs = build_specs(p, card)
        else:
            n_nocard += 1 if not cand else 0
            n_ambig += 1 if cand else 0
            specs = build_specs(p, None)
        if not DRY:
            p['specs'] = specs
        specs_total += len(specs)
        if i % 25 == 0 or i == len(prods) - 1:
            print(f'  …{i + 1}/{len(prods)}: карточек={n_card} без={n_nocard} фото+{photos_total}')

    print(f'\n=== ИТОГ === карточек найдено: {n_card}/{len(prods)} | '
          f'нет на layta: {n_nocard} | неуверенное сопоставление: {n_ambig}')
    print(f'фото добавлено: {photos_total} | specs строк всего: {specs_total} '
          f'(среднее {specs_total / len(prods):.1f}/продукт)')

    if not DRY:
        json.dump(prods, open(PROD_JSON, 'w'), ensure_ascii=False, indent=1)
        print('products.json записан')
    json.dump(report, open(REPORT, 'w'), ensure_ascii=False, indent=1)
    print('отчёт:', REPORT, f'({len(report)} записей)')


if __name__ == '__main__':
    main()
