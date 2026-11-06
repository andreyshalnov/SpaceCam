#!/usr/bin/env python3
"""Применение кодов ОКПД2/ТН ВЭД к products.json по товарным группам (задача владельца 06.11).

Источники: рубрикаторы ТН ВЭД ЕАЭС / ОКПД2 (tnved.info, ifcg.ru, classifikators.ru,
moy-zakupki.ru, alta.ru), реальная декларация ЕАЭС на электромагнитные замки
(unitrex.ru, ТН ВЭД 8301401900), сертификат на уголки крепёжные (7326909409).
06.11 владелец подтвердил материал 4 аксессуаров (все стальные, кроме AC012 —
алюминиевый сплав; совпадает со спецификациями) — закрыто последним хвостом:
козырьки AC002/AC003 и кронштейн AC011 — сталь 7326909409; кронштейн AC012 —
алюминий 7616999008 (ifcg.ru, решения по классификации: крепёж из алюм. сплава);
ОКПД2 25.72.14.190 для всех четырёх — «детали крепежные и установочные из
недрагоценных металлов» (материалонезависимая позиция).
"""
import json
import csv
import os
from collections import Counter

WS = os.environ.get('SPACECAM_WORK', '/home/z/my-project')
PATH = os.path.join(WS, 'src/data/products.json')

# (tnved, okpd2) по группам
CODES = {
    'node':     ('8517620003', '26.30.11.122'),   # узел коммутации со встроенным коммутатором — по основному компоненту
    'switch':   ('8517620003', '26.30.11.122'),  # коммутаторы Ethernet
    'sfp_opt':  ('8517620002', '26.30.23.112'),  # оптические трансиверы (ВОЛС)
    'sfp_cu':   ('8517620003', '26.30.23.120'),  # медный SFP RJ45
    'video':    ('8517691000', '26.30.23.143'),  # видеофоны: станции вызова + мониторы
    'audio':    ('8517692000', '26.30.23.143'),  # домофоны: аудио-абонентские + терминал консьержа
    'relay':    ('8536490000', '27.12.24.160'),  # релейные модули (реле электромагнитные)
    'em_lock':  ('8301401900', '27.33.13.163'),  # электромагнитные замки (декларация ЕАЭС ML-серии)
    'closer':   ('8302600009', '25.72.14.120'),  # доводчики дверные
    'bracket':  ('7326909409', '25.72.14.190'),  # штампованные стальные уголки/кронштейны
    'acc_steel': ('7326909409', '25.72.14.190'),  # козырьки + настольный кронштейн, сталь (владелец 06.11)
    'acc_alu':   ('7616999008', '25.72.14.190'),   # настольный кронштейн, алюм. сплав (владелец 06.11)
}

def classify(p):
    sku, sec, sub = p['sku'], p['section'], p.get('subcategory', '')
    if sec == 'nodes':
        return CODES['node']
    if sec == 'switches':
        if sub == 'SFP-модули':
            return CODES['sfp_cu'] if 'RJ45' in sku else CODES['sfp_opt']
        return CODES['switch']
    if sec == 'intercom':
        if sku == 'SC-INT-AC012-DSS':
            return CODES['acc_alu']  # алюминиевый сплав (спецификация + владелец 06.11)
        if sku in ('SC-INT-AC002-RSS', 'SC-INT-AC003-RFS', 'SC-INT-AC011-DSB'):
            return CODES['acc_steel']  # сталь (спецификация + владелец 06.11)
        if sku in ('SC-INT-AC008-MSW', 'SC-INT-AC009-MSB'):
            return CODES['relay']
        if sub == 'Станции вызова':
            return CODES['video']
        if sku.startswith('SC-INT-H'):
            return CODES['audio']  # абонентские БЕЗ экрана (аудио, с трубкой/кнопками)
        if sub == 'Мониторы':
            return CODES['video']
        return CODES['audio']  # терминал консьержа
    if sec == 'rlock':
        if sub == 'Электромагнитные замки':
            return CODES['em_lock']
        if sub == 'Доводчики':
            return CODES['closer']
        return CODES['bracket']
    raise SystemExit(f'Неизвестная секция: {sec} у {sku}')

def main():
    with open(PATH, encoding='utf-8') as f:
        data = json.load(f)
    prods = data if isinstance(data, list) else data.get('products')
    rows, stats = [], Counter()
    for p in prods:
        tnved, okpd2 = classify(p)
        changed = []
        if p.get('tnved') != tnved:
            if tnved:
                if p.get('tnved'):
                    print(f"  перезапись ТН ВЭД {p['sku']}: {p['tnved']} -> {tnved}")
                p['tnved'] = tnved
                changed.append('tnved')
            else:
                p.pop('tnved', None)
                if p.get('okpd2') is not None:
                    changed.append('-tnved')
        if p.get('okpd2') != okpd2:
            if okpd2:
                p['okpd2'] = okpd2
                changed.append('okpd2')
            else:
                p.pop('okpd2', None)
        stats[(tnved or '—', okpd2 or '—')] += 1
        rows.append({'sku': p['sku'], 'title': p['title'], 'section': p['section'],
                     'subcategory': p.get('subcategory', ''),
                     'okpd2': p.get('okpd2', ''), 'tnved': p.get('tnved', ''),
                     'changed': '+'.join(changed) or '—'})
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)  # indent=1 — канонический формат файла в репо
        f.write('\n')
    out = os.path.join(WS, 'download', 'okpd2_tnved_mapping.csv')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter=';')
        w.writeheader(); w.writerows(rows)
    print(f'Продуктов: {len(prods)}')
    for (t, o), c in sorted(stats.items(), key=lambda x: -x[1]):
        print(f'  {c:4d} шт  ТН ВЭД {t:12}  ОКПД2 {o}')
    print('CSV:', out)

if __name__ == '__main__':
    main()
