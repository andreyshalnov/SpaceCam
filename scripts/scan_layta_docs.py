# -*- coding: utf-8 -*-
"""Скан layta.ru: документы карточек (паспорта/руководства/схемы) -> сайт SpaceCam.

Задача владельца 09.11: для каждого товара найти на layta.ru связанные
документы (блок files в JSON карточки), сохранить PDF в файловую базу сайта
(репо docs/, раздаётся как /SpaceCam/docs/...) и привязать в products.json
(documents[]). Что уже есть на диске — переиспользуем без перекачки.

Источники данных:
  scripts/layta_all_urls.json — индекс 237k товарных URL layta (26.10.2026)
  scripts/layta_cards/<id>.json — кэш baseProduct карточек
Результат:
  src/data/products.json (documents[]), scripts/layta_docs_report.json

Запуск: python3 scripts/scan_layta_docs.py [--dry]
"""
import json
import os
import re
import sys
import time
import urllib.request

BASE = '/home/z/my-project'
REPO = f'{BASE}/scripts/spacecam-repo'
PROD_JSON = f'{REPO}/src/data/products.json'
DOCS_DIR = f'{REPO}/docs'
CARDS_DIR = f'{BASE}/scripts/layta_cards'
REPORT = f'{BASE}/scripts/layta_docs_report.json'
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}
DRY = '--dry' in sys.argv

os.makedirs(CARDS_DIR, exist_ok=True)
os.makedirs(DOCS_DIR, exist_ok=True)

_HOMO = str.maketrans({'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h',
                       'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x',
                       'А': 'a', 'В': 'b', 'Е': 'e', 'К': 'k', 'М': 'm', 'Н': 'h',
                       'О': 'o', 'Р': 'p', 'С': 'c', 'Т': 't', 'У': 'y', 'Х': 'x'})
# транслит имён файлов -> слаг документа
_TR = str.maketrans({'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
                     'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
                     'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
                     'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
                     'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'})


def norm(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', (s or '').lower().translate(_HOMO))


def http_get(url: str, timeout=45, retries=2):
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
    """baseProduct карточки layta с дисковым кэшем."""
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
    time.sleep(0.3)
    return bp


def build_url_index():
    urls = json.load(open(f'{BASE}/scripts/layta_all_urls.json'))
    idx = []
    for u in urls:
        if '/product/' in u and re.search(r'-\d+$', u.rstrip('/')):
            idx.append((norm(u.rstrip('/').split('/product/')[-1]), u))
    return idx


def find_candidates(sku: str, idx, limit=4):
    ns = norm(sku)
    if len(ns) < 5:
        return []
    hits = [(u, nu) for nu, u in idx if ns in nu]
    hits.sort(key=lambda x: len(x[0]))
    return [u for u, _ in hits[:limit]]


def card_matches(p, bp) -> bool:
    sku = norm(p['sku'])
    vc = norm(bp.get('vendor_code'))
    if vc:
        return vc == sku
    name = norm(bp.get('name') or '')
    code = norm(bp.get('code') or '')
    return sku in name or sku == code or sku in code


def doc_type(name: str) -> str:
    n = (name or '').lower()
    if 'паспорт' in n:
        return 'passport'
    if 'руководств' in n or 'инструкц' in n or 'manual' in n:
        return 'manual'
    if 'схем' in n:
        return 'scheme'
    return 'other'


def doc_slug(name: str) -> str:
    s = (name or 'document').lower().translate(_TR)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:40] or 'document'


def sku_slug(sku: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', (sku or '').lower()).strip('-')


def main():
    prods = json.load(open(PROD_JSON))
    print(f'продуктов: {len(prods)}')
    idx = build_url_index()
    print(f'layta URL в индексе: {len(idx)}')

    wired_before = sum(len(p.get('documents') or []) for p in prods)
    report = []
    n_card = n_nocard = added_files = reused_files = 0

    for i, p in enumerate(prods):
        rec = {'sku': p['sku'], 'section': p['section'], 'card': False,
               'layta_files': 0, 'added': [], 'reused': [], 'skipped': [], 'error': None}
        docs = list(p.get('documents') or [])
        have_paths = {os.path.basename(d.get('public_path') or '') for d in docs}

        cand = find_candidates(p['sku'], idx)
        card = None
        for u in cand:
            try:
                layta_id = int(u.rstrip('/').rsplit('-', 1)[-1])
                bp = fetch_card(layta_id, u)
            except Exception as e:  # noqa: BLE001
                rec['error'] = f'fetch: {str(e)[:110]} ({u})'
                continue
            if card_matches(p, bp):
                card, rec['card'], rec['url'] = bp, True, u
                rec['error'] = None
                break

        if card:
            n_card += 1
            files = [f for f in (card.get('files') or []) if isinstance(f, dict)]
            # certificate_file иногда несёт отдельный PDF-сертификат
            if card.get('certificate_file'):
                files.append({'name': 'Сертификат', 'url': card['certificate_file'],
                              'size_kb': card.get('certificate_file_size_kb')})
            rec['layta_files'] = len(files)
            for f in files:
                url = f.get('url') or ''
                fname_layta = (f.get('name') or 'Документ').strip()
                if not url.lower().endswith('.pdf'):
                    rec['skipped'].append(f'{fname_layta}: не PDF ({url[-40:]})')
                    continue
                # соглашение имён в файловой базе: {id}__{ТОЧНЫЙ SKU}__{слаг}.pdf
                # (55 файлов уже так названы: sc-l2-48gp-680-6xg-a__SC-L2-48GP-680-6XG(A)__pasport.pdf)
                base = f"{p['id']}__{p['sku']}__{doc_slug(fname_layta)}.pdf"
                if base in have_paths:
                    rec['reused'].append(base)
                    continue
                fp = os.path.join(DOCS_DIR, base)
                if os.path.exists(fp) and os.path.getsize(fp) > 1000:
                    reused_files += 1
                else:
                    try:
                        raw = http_get(url, timeout=90)
                    except Exception as e:  # noqa: BLE001
                        rec['skipped'].append(f'{fname_layta}: скачать не удалось ({str(e)[:80]})')
                        continue
                    if not raw.startswith(b'%PDF'):
                        rec['skipped'].append(f'{fname_layta}: это не PDF по содержимому')
                        continue
                    open(fp, 'wb').write(raw)
                    added_files += 1
                    rec['added'].append(base)
                have_paths.add(base)
                kb = f.get('size_kb')
                if not isinstance(kb, int) or kb <= 0:
                    kb = max(1, round(os.path.getsize(fp) / 1024))
                docs.append({
                    'type': doc_type(fname_layta),
                    'name': fname_layta,
                    'url': url,
                    'public_path': f'/docs/{base}',
                    'size_kb': kb,
                })
        else:
            n_nocard += 1

        docs.sort(key=lambda d: (0 if (d.get('type') == 'passport') else 1, d.get('name') or ''))
        if docs and docs != (p.get('documents') or []):
            if not DRY:
                p['documents'] = docs
            rec['result'] = f'{len(docs)} док. (+{len(rec["added"])} новых, {len(rec["reused"])} переисп.)'
        elif docs:
            rec['result'] = f'{len(docs)} док. (без изменений)'
        else:
            rec['result'] = 'нет документов на layta — раздел остаётся пустым'
        report.append(rec)
        if i % 25 == 0 or i == len(prods) - 1:
            print(f'  …{i + 1}/{len(prods)}: карточек={n_card} нет={n_nocard} новых_pdf={added_files}')

    wired_after = sum(len(p.get('documents') or []) for p in prods)
    print(f'\n=== ИТОГ === карточек найдено: {n_card}/{len(prods)} | нет на layta: {n_nocard}')
    print(f'PDF скачано новых: {added_files} | переиспользовано с диска: {reused_files}')
    print(f'привязок документов: {wired_before} -> {wired_after}')

    if not DRY:
        json.dump(prods, open(PROD_JSON, 'w'), ensure_ascii=False, indent=1)
        print('products.json записан')
    json.dump(report, open(REPORT, 'w'), ensure_ascii=False, indent=1)
    print('отчёт:', REPORT)


if __name__ == '__main__':
    main()
