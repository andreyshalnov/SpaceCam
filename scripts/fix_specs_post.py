# -*- coding: utf-8 -*-
"""Пост-обработка specs после пересканирования layta:
1) html.unescape на name/value (layta отдаёт &deg; и пр.);
2) убрать шумовый атрибут «Производитель» (бренд и так известен на сайте);
3) для 7 продуктов без карточки layta — таблица строго из title/description/features;
4) аномалии в stdout.
"""
import html
import json
import re

REPO = '/home/z/my-project/scripts/spacecam-repo'
PROD_JSON = f'{REPO}/src/data/products.json'


def n(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def spec(name, value):
    return {'name': name, 'value': value}


MANUAL = {
    'sc16p2852g1ga': [
        spec('Тип коммутатора', 'Неуправляемый'),
        spec('Порты PoE', '16 × 10/100 Мбит/с'),
        spec('Порты Uplink RJ45', '2 × 10/100/1000 Мбит/с'),
        spec('SFP-порты', '1 × 1000 Мбит/с'),
        spec('Бюджет PoE, Вт', '285'),
        spec('Стандарты', 'IEEE 802.3i, 802.3u, 802.3x, 802.3ab'),
        spec('Тип монтажа', 'В стойку 19"'),
        spec('Габаритные размеры, мм', '440×280×44'),
        spec('Рабочая температура, °C', '−10…+50'),
        spec('Напряжение питания, В', 'AC 110–240'),
        spec('Вес, кг', '3,9'),
    ],
    'sc24p2852ga': [
        spec('Тип коммутатора', 'Неуправляемый'),
        spec('Порты PoE', '24 × 10/100 Мбит/с'),
        spec('Порты Uplink RJ45', '1 × 10/100/1000 Мбит/с'),
        spec('Combo-порты', '1 × 1000 Мбит/с (RJ45/SFP)'),
        spec('Бюджет PoE, Вт', '280'),
        spec('Стандарты', 'IEEE 802.3i, 802.3u, 802.3x, 802.3ab, 802.3z'),
        spec('Тип монтажа', 'В стойку 19"'),
        spec('Габаритные размеры, мм', '440×280×44'),
        spec('Рабочая температура, °C', '−10…+50'),
        spec('Напряжение питания, В', 'AC 110–240'),
    ],
    'scil28gp240bt2ga': [
        spec('Тип коммутатора', 'Управляемый L2, промышленный'),
        spec('Порты PoE', '8 × 10/100/1000 Мбит/с (2 порта с бюджетом 90 Вт, 802.3bt)'),
        spec('SFP-порты', '2 × 1000 Мбит/с'),
        spec('Бюджет PoE, Вт', '240'),
        spec('Функции', 'VLAN, Port isolation, QoS, ACL, CLI, SNMPv1/v2c/v3, 802.1X, Q-in-Q, RMON, NTP, IGMP Snooping, DHCP Snooping, Ring, PoE Management'),
        spec('Тип монтажа', 'На DIN-рейку'),
        spec('Габаритные размеры, мм', '143×104×48'),
        spec('Рабочая температура, °C', '−40…+80'),
        spec('Напряжение питания, В', 'DC 48–58'),
        spec('Степень защиты', 'IP40'),
        spec('Вес, кг', '0,58'),
    ],
    'scil216gp380bt4ga': [
        spec('Тип коммутатора', 'Управляемый L2, промышленный'),
        spec('Порты PoE', '16 × 10/100/1000 Мбит/с (2 порта с бюджетом 90 Вт, 802.3bt)'),
        spec('SFP-порты', '4 × 1000 Мбит/с'),
        spec('Бюджет PoE, Вт', '380'),
        spec('Функции', 'VLAN, Port isolation, QoS, ACL, CLI, SNMPv1/v2c/v3, 802.1X, Q-in-Q, RMON, NTP, IGMP Snooping, DHCP Snooping, Ring, PoE Management'),
        spec('Тип монтажа', 'На DIN-рейку'),
        spec('Габаритные размеры, мм', '143×104×48'),
        spec('Рабочая температура, °C', '−40…+80'),
        spec('Напряжение питания, В', 'DC 48–58'),
        spec('Степень защиты', 'IP40'),
        spec('Вес, кг', '0,58'),
    ],
    'scintg0101axb': [
        spec('Экран', '10" TFT LCD 1024×600, сенсорный'),
        spec('ОС', 'Android 10'),
        spec('Оперативная память', '512 МБ'),
        spec('Встроенная память', '4 ГБ, слот SD до 32 ГБ'),
        spec('Станции вызова', 'до 8 шт.'),
        spec('IP-камеры', 'до 8 шт., H.264'),
        spec('Аудио', 'G.711, RFC2833'),
        spec('Тревожные входы', '8 шт.'),
        spec('Интерфейсы', 'RS485, 1 × RJ45 10/100 Мбит/с, WiFi + BT'),
        spec('Камера', '3 Мп CMOS'),
        spec('Питание', 'PoE (802.3af) или DC 12 В'),
        spec('Габаритные размеры, мм', '303×195×35'),
        spec('Материал корпуса', 'Пластик'),
    ],
    'rlbr280lcs': [
        spec('Тип', 'Монтажный уголок типа LC с крышечкой'),
        spec('Совместимость', 'Для замков на 280 кг'),
        spec('Материал', 'Алюминиевый сплав'),
        spec('Тип монтажа', 'Накладной'),
        spec('Цвет', 'Серебристый (RAL 7047)'),
    ],
    'rlbr350lcs': [
        spec('Тип', 'Монтажный уголок типа LC с крышечкой'),
        spec('Совместимость', 'Для замков на 350 кг'),
        spec('Материал', 'Алюминиевый сплав'),
        spec('Тип монтажа', 'Накладной'),
        spec('Цвет', 'Серебристый (RAL 7047)'),
    ],
}

DROP_NAMES = {'производитель'}


def main():
    prods = json.load(open(PROD_JSON))
    n_escaped, n_dropped, n_manual = 0, 0, 0
    anomalies = []
    for p in prods:
        for s in (p.get('specs') or []):
            for k in ('name', 'value'):
                v = s[k]
                if '&' in v and ';' in v:
                    u = html.unescape(v)
                    if u != v:
                        s[k] = u
                        n_escaped += 1
        # дедуп имен (после unescape «Рабочая температура °C» из двух источников совпадает)
        seen = set()
        dedup = []
        for s in (p.get('specs') or []):
            key = s['name'].strip().lower()
            if key in seen:
                continue
            seen.add(key)
            dedup.append(s)
        p['specs'] = dedup
        before = len(p.get('specs') or [])
        p['specs'] = [s for s in (p.get('specs') or []) if s['name'].strip().lower() not in DROP_NAMES]
        n_dropped += before - len(p['specs'])
        key = n(p['sku'])
        manual = None
        for k, v in MANUAL.items():
            if key == k or (len(k) < 14 and k in key):
                manual = v
                break
        if manual is not None and len(p.get('specs') or []) < len(manual):
            p['specs'] = manual
            n_manual += 1
        for s in (p.get('specs') or []):
            if len(s['name']) > 60 or len(s['value']) > 130 or not s['value'].strip():
                anomalies.append((p['sku'], s['name'][:40], s['value'][:60]))
            if re.match(r'^[\d\s.,x×]+$', s['name']):
                anomalies.append((p['sku'], 'NAME_IS_NUM', s['name']))
    json.dump(prods, open(PROD_JSON, 'w'), ensure_ascii=False, indent=1)
    print(f'html.unescape: {n_escaped} | «Производитель» удалён: {n_dropped} | ручные таблицы: {n_manual}')
    print(f'аномалий: {len(anomalies)}')
    for a in anomalies[:15]:
        print('  !', a)


if __name__ == '__main__':
    main()
