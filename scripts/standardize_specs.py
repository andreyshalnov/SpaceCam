#!/usr/bin/env python3
# ═════════════════════════════════════════════════════════════════════════════
# standardize_specs.py — 06.11.2026, по задаче владельца:
#   1) стандартизация таблиц характеристик: канонические имена строк и
#      ЕДИНЫЙ порядок строк для всех продуктов (внутри группы порядок
#      совпадает автоматически, т.к. порядок глобальный);
#   2) глубокое сканирование описания продукта: извлечение доп. параметров
#      (цвет/RAL, IP, УХЛ, материал, покрытие, габариты, масса, температура,
#      грозозащита, АКБ, оптический кросс, крепление в комплекте, гермовводы,
#      замок, ББП, термостабилизация, IEEE-стандарты, функции L2, экран/
#      память/входы мониторов, скорость/разъём/дальность SFP) и добавление
#      в таблицу, если строки ещё нет;
#   3) удаление дублирующих параметров, идущих списком в описании
#      («Сталь 1мм / порошковая покраска / серый (RAL 7035) / ...») —
#      из списка features и из текста description (информация переносится
#      в таблицу, а не теряется);
#   4) дедуп: Длина/Ширина/Высота ↔ «Габаритные размеры (Д×Ш×В), мм»,
#      «Количество портов» ↔ «Количество портов RJ45», замусоренные
#      значения («8<br>», «1,25 Гбит/с Разъем: SC x 1») разделяются на
#      отдельные строки.
# Отчёт: scripts/standardize_report.json + stdout.
# Источник истины: src/data/products.json репозитория (НЕ workspace-копия).
# ═════════════════════════════════════════════════════════════════════════════
import json, re, collections

REPO = '/home/z/my-project/scripts/spacecam-repo'
SRC = f'{REPO}/src/data/products.json'
REPORT = f'{REPO}/scripts/standardize_report.json'

# ── 1. Канонические имена (rename) ──────────────────────────────────────────
RENAME = {
    'Рабочая температура °C': 'Рабочая температура, °C',
    'Рабочая температура, °C': 'Рабочая температура, °C',
    'Температурный диапазон': 'Рабочая температура, °C',
    'Вес, кг': 'Масса, кг',
    'Сила удержания': 'Усилие удержания, кг',
    'Материал': 'Материал корпуса',
    'Соответствует требованиям и стандартам': 'Соответствие стандартам',
    'Стандарты': 'Соответствие стандартам',
    'PoE стандарты': 'Стандарты PoE',
    'Тип коммутаторов': 'Тип коммутатора',
    'Общая мощность PoE, Вт.': 'Общий бюджет PoE, Вт',
    'Бюджет PoE, Вт': 'Общий бюджет PoE, Вт',
    'Потребление тока, А': 'Потребляемый ток, А',
    'Потребляемый ток': 'Потребляемый ток, А',
    'Тип оборудования (замок/защелки)': 'Тип замка/защелки',
    'Тип товара': 'Тип оборудования',
    'Тип': 'Тип оборудования',
    'Порты 1000 Base-X SFP': 'Порты SFP',
    'SFP-порты': 'Порты SFP',
    'Порты PoE': 'PoE-порты',
    'Порты 10/100/1000 Base-T RJ-45 PoE': 'PoE-порты RJ45',
    'Порты Uplink RJ45': 'Uplink-порты RJ45',
    'Базовая скорость передачи данных, Мбит/с': 'Скорость передачи',
    'Максимальная ширина двери (мм)': 'Максимальная ширина двери, мм',
    'Максимальный вес двери, кг': 'Максимальная масса двери, кг',
    'Функционал': 'Функции',
    'Категория размещения': 'Исполнение',
    'Уличное исполнение': 'Исполнение',
    'Питание': 'Напряжение питания, В',
    'Размеры': 'Габаритные размеры (Д×Ш×В), мм',
    'Габаритные размеры, мм': 'Габаритные размеры (Д×Ш×В), мм',
}
EXEC_NORM = {'Да': 'Уличный', 'нет': None, 'Нет': None}
VALUE_FIX = {'аллюминевый сплав': 'Алюминиевый сплав',
             'алюминевый сплав': 'Алюминиевый сплав',
             'алюминий': 'Алюминий', 'сталь': 'Сталь',
             'пластик': 'Пластик', 'металл': 'Металл'}
CAP_NAMES = {'Материал корпуса', 'Цвет', 'Тип двери', 'Исполнение',
             'Тип монтажа', 'Покрытие', 'Степень защиты', 'Управление'}

# ── 2. Единый порядок строк ─────────────────────────────────────────────────
ORDER = [
    'Тип оборудования', 'Тип коммутатора', 'Тип замка/защелки', 'Модель',
    'Управление', 'Количество портов', 'Количество портов RJ45', 'PoE-порты',
    'PoE-порты RJ45', 'Порты SFP', 'Uplink-порты RJ45', 'Combo-порты',
    'Скорость основных портов', 'Скорость Uplink-портов', 'Скорость передачи',
    'Тип основных портов', 'Общий бюджет PoE, Вт', 'Питание PoE',
    'Стандарты PoE', 'Консольный порт',
    'Напряжение питания, В', 'Потребляемый ток, А', 'Индикация', 'Функции',
    'Датчик замка', 'Грозозащита, кВ', 'Оптический кросс', 'ББП',
    'Аккумуляторы (АКБ), шт', 'Термостабилизация', 'Замок', 'Гермовводы',
    'Крепление в комплекте', 'Материал корпуса', 'Покрытие', 'Цвет',
    'Степень защиты', 'Климатическое исполнение', 'Исполнение', 'Тип монтажа',
    'Крепление на DIN-рейку', 'Габаритные размеры (Д×Ш×В), мм', 'Масса, кг',
    'Рабочая температура, °C', 'Соответствие стандартам',
    'Количество в упаковке', 'Тип двери', 'Максимальная ширина двери, мм',
    'Максимальная масса двери, кг', 'Усилие удержания, кг', 'Тип тяги',
    'Регулировка усилия', 'Закрывающее усилие, EN', 'Механизм открывания',
    'Максимальный угол открывания', 'Тип уголка', 'Тип волокна', 'Тип лазера',
    'Длина волны Tx/Rx, нм', 'Длина волны Tx, нм', 'Тип кабеля', 'Разъём',
    'Дальность передачи', 'Экран', 'Матрица', 'Разрешение', 'Угол обзора',
    'Подсветка', 'Антивандальность', 'Видеокодеки', 'Аудиокодеки', 'Камера',
    'Аудио', 'Тревожные входы', 'Выход сирены', 'Количество абонентов',
    'Управляющие реле, шт', 'Считыватель карт', 'PIN-код', 'FaceID',
    'QR-код', 'Тампер', 'Станции вызова', 'IP-камеры', 'Интерфейсы',
    'Слот SD', 'Оперативная память', 'Встроенная память', 'ОС',
    'Совместимость',
]
ORDER_IDX = {n: i for i, n in enumerate(ORDER)}
RANK_TAIL = len(ORDER) + 100

# ── 3. Экстракторы (имя канона, значение) из текста описания/features ───────
COLORS = {'серый': 'Серый', 'серебристый': 'Серебристый', 'чёрный': 'Чёрный',
          'черный': 'Чёрный', 'белый': 'Белый', 'графитовый': 'Графитовый'}
JUNK_VALUES = {'', '-', '—', 'нет', 'Нет', 'нет данных', 'n/a', 'null', '—'}

def m_temp(text):
    out = []
    for a, b in re.findall(
            r'(?:рабочая температура|температур\w*)[^\d\-+]{0,24}'
            r'([-+]?\d{1,2})\s*[º°]?\s*[CС]?\s*до\s*([-+]?\d{1,2})', text, re.I):
        out.append(('Рабочая температура, °C', f'{a}…{b}'))
    for a, b in re.findall(
            r'([-+−]?\d{1,2})\s*[º°℃]\s*[CС]?\s*[~…⋯.]{1,3}\s*\+?(\d{1,2})\s*[º°℃]?\s*[CС]?',
            text):
        out.append(('Рабочая температура, °C', f'{a.replace("−","-")}…{b}'))
    return out

def m_ip(text):
    return [('Степень защиты', f'IP{v}') for v in
            re.findall(r'\bIP(?:-| )?(\d{2})\b', text)]

def m_uhl(text):
    return [('Климатическое исполнение', re.sub(r'^УХЛ\s?', 'УХЛ ', v).rstrip('.'))
            for v in re.findall(r'УХЛ\s?[\d.,]+\d', text)]

def m_dims(text):
    return [('Габаритные размеры (Д×Ш×В), мм', f'{a}×{b}×{c}')
            for a, b, c in re.findall(
                r'(\d{1,4}(?:[.,]\d+)?)\s*[хx×]\s*(\d{1,4}(?:[.,]\d+)?)\s*[хx×]\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:мм|mm)\b',
                text, re.I)]

def m_weight(text):
    return [('Масса, кг', v.replace(',', '.')) for v in re.findall(
        r'(?:вес|масса)\s*(?:нетто)?\s*[:=]?\s*(\d+[.,]?\d*)\s*кг', text, re.I)]

def m_material(text):
    out = []
    for v in re.findall(r'[Сс]таль\s*(\d+(?:[.,]\d+)?)\s*мм', text):
        out.append(('Материал корпуса', f'Сталь {v.replace(",", ".")} мм'))
    if re.search(r'\bпластик\w*\b', text, re.I):
        out.append(('Материал корпуса', 'Пластик'))
    return out

def m_coating(text):
    if re.search(r'порошков\w+\s+(?:покраск|окраск|краск)\w+', text, re.I):
        word = 'окраска' if re.search(r'(?<!п)окраск', text, re.I) else 'покраска'
        return [('Покрытие', f'Порошковая {word}')]
    return []

def m_color(text):
    out = []
    for word, canon in COLORS.items():
        g = re.search(rf'{word}\w*\s*\((?:RAL\s?)?(\d{{4}})\)', text, re.I)
        if g:
            out.append(('Цвет', f'{canon} (RAL {g.group(1)})'))
    if not out:
        # RAL без скобок: «серебристый сатинированный алюминий RAL 7047»
        g = re.search(
            r'(серый|серебристый|чёрный|черный|белый|графитовый)\w*[^.,\n]{0,40}?RAL\s?(\d{4})',
            text, re.I)
        if g:
            out.append(('Цвет', f'{COLORS[g.group(1).lower()]} (RAL {g.group(2)})'))
    return out

def m_poe_budget(text):
    return [('Общий бюджет PoE, Вт', v) for v in re.findall(
        r'(?:бюджет\w*\s*PoE\w*|POE\s*бюджет)\s*(\d{2,4})\s*Вт', text, re.I)]

def m_grozo(text):
    return [('Грозозащита, кВ', v.replace(',', '.')) for v in
            re.findall(r'грозозащит\w*\s+(\d+[.,]?\d*)\s*кВ', text, re.I)]

def m_akb(text):
    return [('Аккумуляторы (АКБ), шт', v) for v in
            re.findall(r'АКБ\s*(\d+)\s*шт', text, re.I)]

def m_krepl(text):
    return [('Крепление в комплекте', 'На ' + g.strip().rstrip('.'))
            for g in re.findall(
                r'[Кк]репление\s+на\s+(.{2,60}?)\s+в\s+комплекте', text)]

def m_nodes_prose(text):
    out = []
    if re.search(r'оптический\s+кросс', text, re.I):
        out.append(('Оптический кросс', 'Встроенный'))
    g = re.search(r'гермовводы\s+(снизу|сверху|сзади)', text, re.I)
    if g:
        out.append(('Гермовводы', g.group(1).lower()))
    if re.search(r'\bзамок\b', text, re.I):
        out.append(('Замок', 'Да'))
    if re.search(r'встроенн\w+\s+ББП', text, re.I):
        out.append(('ББП', 'Встроенный'))
    if re.search(r'термостабилизаци', text, re.I):
        out.append(('Термостабилизация', 'Есть'))
    return out

IEEE_RE = re.compile(r'IEEE\s+802\.[0-9a-z]+', re.I)
FUNC_TOKENS = [('IGMP Snooping', 'IGMP Snooping'), ('Port Mirror', 'Port Mirror'),
               ('VLAN', 'VLAN'), ('STP/RSTP/MSTP', 'STP/RSTP/MSTP'),
               ('ERPS', 'ERPS'), ('LACP', 'LACP'), ('QOS', 'QoS'),
               ('ACL', 'ACL'), ('802.1X', '802.1X'), ('LLDP', 'LLDP'),
               ('WEB/Telnet/SSH/SNMP/RMON', 'Web/Telnet/SSH/SNMP/RMON'),
               ('POE management', 'PoE management')]

def m_switch(text):
    out = []
    ieee = sorted({f'IEEE {t.split()[-1].lower()}' for t in IEEE_RE.findall(text)})
    if ieee:
        out.append(('Соответствие стандартам', ', '.join(ieee)))
    up = text.upper()
    found = [canon for tok, canon in FUNC_TOKENS if tok.upper() in up]
    if found:
        out.append(('Функции', ', '.join(dict.fromkeys(found))))
    return out

def m_sfp(text):
    out = []
    for v in re.findall(r'Скорость передачи[:\s]*([\d.,]+\s*Гбит/с)', text, re.I):
        out.append(('Скорость передачи', v.replace(',', '.')))
    for v in re.findall(
            r'Разъем[:\s]*([A-ZА-Я]{1,4}\d*(?:\s*[x×]\s*\d+)?'
            r'(?:\s*/\s*[A-Z]+\d*(?:\s*[x×]\s*\d+)?)*)', text):
        out.append(('Разъём', re.sub(r'\s*[x×]\s*', ' × ', v.strip())))
    for v in re.findall(r'Тип кабеля[:\s]*([^;\n]+?)(?:\s*;|$)', text, re.I):
        out.append(('Тип кабеля', v.strip()))
    for n, u in re.findall(r'Дальность передачи\s*(\d+)\s*(м|км)\b', text, re.I):
        out.append(('Дальность передачи', f'{n} {u.lower()}'))
    g = re.search(r'Длина волны:?\s*Tx\s*(\d{3,4})\s*нм', text, re.I)
    if g:
        out.append(('Длина волны Tx, нм', g.group(1)))
    g = re.search(r'Длина волны\s+(\d{3,4})\s*нм\s*,\s*(\d{3,4})\s*нм', text)
    if g:
        out.append(('Длина волны Tx/Rx, нм', f'{g.group(1)}/{g.group(2)}'))
    g = re.search(r'Тип лазера\s+([A-ZА-Я]{2,6}(?:\s*\([^)]*\))?)', text)
    if g:
        out.append(('Тип лазера', g.group(1).strip()))
    g = re.search(r'Питание\s*\+?([\d.,]+)\s*В\b', text)
    if g:
        out.append(('Напряжение питания, В', g.group(1).replace('.', ',') + 'В'))
    for v in re.findall(r'Потребляемый ток\s*(\d+)\s*mA', text, re.I):
        out.append(('Потребляемый ток, А', str(int(v) / 1000)))
    if re.search(r'Функция мониторинга DDM', text, re.I):
        out.append(('Функции', 'DDM (мониторинг)'))
    return out

def m_monitor(text):
    out = []
    g = re.search(r'сенсорный\s+экран\s+(\d+[.,]?\d*)\s*(?:["»]|дюйм)?\s*(?:TFT|IPF|IPS)\s*LCD'
                  r'(?:\s*(\d{3,4}\s*[x×]\s*\d{3,4}))?', text, re.I)
    if g:
        res = f', {re.sub(r"\s*[x×]\s*", "×", g.group(2))}' if g.group(2) else ''
        out.append(('Экран', f'Сенсорный {g.group(1)}" {g.group(0).split()[2]} LCD{res}' if False else f'Сенсорный {g.group(1)}" LCD{res}'))
    g = re.search(r'(?<!сенсорный )\bэкран\s+([\d.,]+)\s*"?\s*(?:TFT|IPF|IPS)\s*LCD(?:\s*(\d{3,4}\s*[x×]\s*\d{3,4}))?', text, re.I)
    if g and not any(n == 'Экран' for n, _ in out):
        res = f', {re.sub(r"\s*[x×]\s*", "×", g.group(2))}' if g.group(2) else ''
        out.append(('Экран', f'{g.group(1)}" LCD{res}'))
    g = re.search(r'(\d{2,4})\s*мб\s*/\s*(\d{2,4})\s*мб', text, re.I)
    if g:
        out.append(('Оперативная память', f'{g.group(1)} МБ'))
        out.append(('Встроенная память', f'{g.group(2)} МБ'))
    for v in re.findall(r'станции вызова до (\d+)\s*шт', text, re.I):
        out.append(('Станции вызова', f'до {v}'))
    for v in re.findall(r'IP\s+видеокамер\w*\s*до\s+(\d+)\s*шт', text, re.I):
        out.append(('IP-камеры', f'до {v}'))
    for v in re.findall(r'тревожные входы\s+(\d+)\s*шт', text, re.I):
        out.append(('Тревожные входы', v))
    for a, b in re.findall(r'выход сирены\s+(\d+)\s*В\s*/\s*(\d+)\s*мА', text, re.I):
        out.append(('Выход сирены', f'{a} В / {b} мА'))
    if re.search(r'RS-?485', text, re.I):
        out.append(('Интерфейсы', 'RS485'))
    for v in re.findall(r'SD до (\d+)\s*Гб', text, re.I):
        out.append(('Слот SD', f'до {v} ГБ'))
    for v in sorted(set(re.findall(r'H\.26[45]', text))):
        out.append(('Видеокодеки', v))
    if re.search(r'G\.711', text):
        out.append(('Аудиокодеки', 'G.711'))
    return out

def m_access(text):
    out = []
    if re.search(r'PIN[- ]?код', text, re.I):
        out.append(('PIN-код', 'Да'))
    if re.search(r'FaceID', text, re.I):
        out.append(('FaceID', 'Есть'))
    if re.search(r'WiFi\s*\+\s*BT', text, re.I):
        out.append(('Интерфейсы', 'WiFi, Bluetooth'))
    g = re.search(r'(\d)\s*Гб\s*/\s*(\d)\s*Гб', text, re.I)
    if g:
        out.append(('Оперативная память', f'{g.group(1)} ГБ'))
        out.append(('Встроенная память', f'{g.group(2)} ГБ'))
    return out

def m_closer(text):
    out = []
    if re.search(r'Электромагнитный сдвиговый замок', text, re.I):
        out.append(('Тип оборудования', 'Электромагнитный сдвиговый замок'))
        out.append(('Механизм открывания', 'Сдвиговый'))
    if re.search(r'EN\d\s*·\s*усилие закрытия регулируемое', text, re.I):
        out.append(('Регулировка усилия', 'Да'))
    for v in re.findall(r'EN(\d)\s*·\s*усилие', text):
        out.append(('Закрывающее усилие, EN', f'EN{v}'))
    for v in re.findall(r'[Мм]асса двери до (\d+)\s*кг', text):
        out.append(('Максимальная масса двери, кг', v))
    for v in re.findall(r'[Шш]ирина (?:полотна|двери) до (\d+)\s*мм', text):
        out.append(('Максимальная ширина двери, мм', v))
    if re.search(r'Гидравлический,?\s*рычажная\s+тяга', text, re.I):
        out.append(('Тип тяги', 'Рычажная (гидравлическая)'))
    for v in re.findall(r'\bМакс\.?\s*угол открывания\s*(\d{2,3})\s*[⁰°]?', text, re.I):
        out.append(('Максимальный угол открывания', f'{v}°'))
    for v in re.findall(r'\b([LUVZ])-кронштейн\s+в\s+комплекте', text, re.I):
        out.append(('Крепление в комплекте', f'{v.upper()}-кронштейн'))
    return out

def m_intercom_prose(text):
    out = []
    for v in re.findall(r'\b(\d+)\s+абонент\w*', text, re.I):
        out.append(('Количество абонентов', v))
    g = re.search(r'(\d)\s*МП\s*CMOS\s*(WDR)?', text, re.I)
    if g:
        out.append(('Матрица', f'{g.group(1)} МП CMOS' + (' (WDR)' if g.group(2) else '')))
    g = re.search(r'обзор\s+горизонтальный\s+(\d+)\s*гр', text, re.I)
    if g:
        out.append(('Угол обзора', f'{g.group(1)}° (горизонтальный)'))
    g = re.search(r'(\d{3,4})\s*[x×]\s*(\d{3,4})\s*(\d{2})\s*fps', text, re.I)
    if g:
        out.append(('Разрешение', f'{g.group(1)}×{g.group(2)}, {g.group(3)} fps'))
    if re.search(r'подсветка\s+LED\s+белая', text, re.I):
        out.append(('Подсветка', 'LED белая'))
    if 'Степень защиты' not in text or not re.search(r'Степень защиты[^\n]*IK\d\d', text):
        for v in re.findall(r'\bIK(\d{2})\b', text):
            out.append(('Антивандальность', f'IK{v}'))
    for v in re.findall(r'управляющие реле\s+(\d+)\s*шт', text, re.I):
        out.append(('Управляющие реле, шт', v))
    if re.search(r'Wiegand\s*26/34', text, re.I):
        out.append(('Интерфейсы', 'Wiegand 26/34'))
    if re.search(r'\bBLE\b', text):
        out.append(('Интерфейсы', 'BLE'))
    g = re.search(r'IC\s*\(([\d.]+)\s*MHz\)\s*Mifare', text, re.I)
    if g:
        out.append(('Считыватель карт', f'IC Mifare ({g.group(1).replace(".", ",")} МГц)'))
    if re.search(r'QR\s*код', text, re.I):
        out.append(('QR-код', 'Да'))
    if re.search(r'\bтампер\b', text, re.I):
        out.append(('Тампер', 'Есть'))
    g = re.search(r'без\s+экрана\\?\s*(с\s+индикаторами)?', text, re.I)
    if g:
        out.append(('Экран', 'Без экрана' + (' (с индикаторами)' if g.group(1) else '')))
    return out

def m_angle(text):
    return [('Тип уголка', g.upper()) for g in
            re.findall(r'\bтип\s+([LUVZ])\b', text, re.I)]

CORE = [m_temp, m_ip, m_uhl, m_dims, m_weight, m_material, m_coating,
        m_color, m_poe_budget, m_grozo, m_akb, m_krepl, m_mount := lambda t: (
            [('Тип монтажа', 'Настольный')] if re.search(r'\bнастольн\w+', t, re.I)
            else []) + ([('Тип монтажа', 'Накладной')] if re.search(
                r'монтаж\s+накладной', t, re.I) else []) + (
            [('Тип монтажа', 'Врезной')] if re.search(r'монтаж\s+врезной', t, re.I)
            else []) + ([('Крепление на DIN-рейку', 'Да')]
                        if re.search(r'на\s+DIN-рейку', t, re.I) else []),
        m_angle]
SECTION_EXTRACTORS = {
    'nodes': CORE + [m_nodes_prose, m_access],
    'switches': CORE + [m_switch, m_sfp],
    'intercom': CORE + [m_monitor, m_intercom_prose, m_access],
    'rlock': CORE + [m_closer],
}

# Покрывающие регэкспы: сегмент описания = чистый параметр (удаляется из текста)
COVER_RES = [
    r'рабочая температура\s*от?\s*[-+−]?\d+\s*[º°⁰]?\s*С?\s*до\s*\+?\d+\s*[º°⁰]?\s*С?',
    r'[-+−]?\d{1,2}\s*[º°℃⁰]?\s*[CС]?\s*[~…⋯.]{1,3}\s*\+?\d{1,2}\s*[º°℃⁰]?[CС]?',
    r'[-+−]?\d{1,2}\s*\.\.\s*\+?\d{1,2}',
    r'IP\s?-?\d{2}',
    r'УХЛ[\d.,]+\d',
    r'\d{2,4}\s*[хx×]\s*\d{2,4}\s*[хx×]\s*\d{2,4}\s*(?:мм|mm)?',
    r'(?:вес|масса)\s*:?\s*\d+[.,]?\d*\s*кг',
    r'\d+[.,]\d+\s*кг',
    r'сталь\s*\d+(?:[.,]\d+)?\s*мм',
    r'порошков\w+\s+(?:покраск|окраск|краск)\w*',
    r'(?:серый|серебристый|чёрный|черный|белый|графитовый)\w*(?:\s*\((?:RAL\s?)?\d{4}\))?',
    r'(?:общий\s+)?бюджет\w*\s*PoE\w*\s*\d+\s*Вт(?:\s*\(802\.3af/at\))?',
    r'POE\s*бюджет\s*\d+\s*Вт',
    r'встроенная?\s+грозозащит\w*\s*\d+[.,]?\d*\s*кВ',
    r'АКБ\s*\d+\s*шт',
    r'оптический\s+кросс',
    r'гермовводы\s+снизу',
    r'крепление\s+на\s+столб',
    r'(?:и\s+)?стену\s+в\s+комплекте',
    r'встроенный\s+ББП',
    r'термостабилизация',
    r'настольный',
    r'AC\d+-\d+V',
    r'IEEE\s+802\.[0-9a-z]+',
    r'POE\s+management',
    r'IGMP\s+Snooping', r'Port\s+Mirror', r'VLAN', r'STP/RSTP/MSTP', r'ERPS',
    r'LACP', r'QOS', r'ACL', r'802\.1X', r'LLDP', r'WEB/Telnet/SSH/SNMP/RMON',
    r'Скорость передачи[:\s]*[\d.,]+\s*Гбит/с',
    r'Разъем[:\s]*[A-ZА-Я]{1,4}\d*(?:\s*[x×]\s*\d+)?(?:\s*/\s*[A-Z]+\d*(?:\s*[x×]\s*\d+)?)?',
    r'Тип кабеля[:\s]*[^;\n]+?(?:\s*;|$)',
    r'Дальность передачи\s*\d+\s*м',
    r'Температурный диапазон[:\s]*[^;\n]+?(?:\s*;|$)',
    r'станции вызова до \d+\s*шт',
    r'IP\s+видеокамер\w*\s*до\s*\d+\s*шт',
    r'тревожные входы\s+\d+\s*шт',
    r'выход сирены\s+\d+\s*В\s*/\s*\d+\s*мА',
    r'RS-?485', r'RFC2833',
    r'SD до \d+\s*Гб',
    r'\d{2,4}\s*мб\s*/\s*\d{2,4}\s*мб',
    r'H\.264', r'G\.711',
    r'\d+\s*[x×]\s*RJ45\s*10/100\s*Mbps',
    r'PoE\s*\(\s*802\.3af\s*\)\s*или\s*DC\s*12\s*В',
    r'сенсорный экран\s+\d+\s*"?\s*TFT\s*LCD(?:\s+\d{3,4}\s*[x×]\s*\d{3,4})?',
    r'для замков до \d+ кг',
    r'тип\s+[LUVZ]\b',
    r'(?:накладной|настольный|навесной)\s+монтаж',
    r'монтаж\s+(?:накладной|врезной|настольный)(?:\s*\(козырёк\s+в\s+комплекте\))?',
    r'козырёк\s+в\s+комплекте',
    r'(?:размеры|габариты):?\s*\d+(?:[.,]\d+)?\s*[хx×]\s*\d+(?:[.,]\d+)?\s*[хx×]\s*\d+(?:[.,]\d+)?\s*мм',
    r'Питание\s*\+?[\d.,]+\s*В\b',
    r'Потребляемый ток\s*\d+\s*mA',
    r'Функция мониторинга DDM',
    r'Длина волны:?\s*(?:Tx\s*)?\d{3,4}\s*нм(?:\s*,\s*\d{3,4}\s*нм)*',
    r'Тип лазера\s+[A-ZА-Я]{2,6}\s*\([^)]*\)?',
    r'Тип волокна:?\s*[^;]+;\s*Дальность передачи\s*\d+\s*км',
    r'UTP\s*Cat\s?5e(?:\s*или\s*выше)?(?:\s*;\s*Дальность\s+передачи\s*\d+\s*м)?',
    r'IEEE\s+802\.[0-9a-z]+(?:/[0-9a-z]+)*',
    r'\d+\s+абонент\w*',
    r'\dМП\s*CMOS(?:\s*WDR)?',
    r'обзор\s+горизонтальный\s+\d+\s*гр',
    r'\d{3,4}\s*[x×]\s*\d{3,4}\s*\d{2}\s*fps',
    r'H\.26[45]',
    r'подсветка\s+LED\s+белая',
    r'BLE',
    r'QR\s*код',
    r'IC\s*\([\d.]+\s*MHz\)\s*Mifare',
    r'PIN[- ]?код', r'FaceID', r'WiFi\s*\+\s*BT', r'\dГб/\dГб',
    r'EN\d\s*·\s*усилие закрытия регулируемое',
    r'[Мм]асса двери до \d+\s*кг',
    r'Вес двери \d+[-–]\d+\s*Кг\.?',
    r'[Шш]ирина (?:полотна|двери) до \d+\s*мм',
    r'ширина (?:полотна|двери) \d+[-–]\d+\s*мм',
    r'Гидравлический,?\s*рычажная тяга',
    r'[LUVZ]-кронштейн в комплекте',
    r'Тип\s+LC\b',
    r'Сдвиговый,?\s*врезной,?\s*универсальный',
    r'нагрузка до \d+\s*кг',
    r'Макс\.?\s*угол открывания \d+\s*[⁰°]?',
    r'EN\d\b',
    r'экран\s+[\d.,]+\s*"?\s*(?:TFT|IPF|IPS)\s*LCD(?:\s+\d{3,4}\s*[x×]\s*\d{3,4})?',
    r'управляющие\s+реле\s+\d+\s*шт',
    r'Wiegand\s*26/34',
    r'тампер',
    r'IK\d\d',
    r'алюминий',
    r'без\s+экрана\\?\s*(?:с\s+индикаторами)?',
    r'цвет[:\s]+(?:серый|серебристый|чёрный|черный|белый)\w*(?:\s*\((?:RAL\s?)?\d{4}\))?',
    r'удержание\s+\d+\s*кг',
    r'\d{2,4}\s*кг',
    r'датчик холла(?:\s+и\s+магнито\w*\s+датчик)?',
    r'питание\s+12/24\s*В?\s*DC',
    r'пластик', r'металл',
    r'замок',
]
COVER = [re.compile(r'^\W*' + p + r'\W*$', re.I) for p in COVER_RES]

def is_param_segment(seg):
    s = seg.strip(' ;:.,-')
    if not s or len(s) < 2:
        return True
    return any(c.fullmatch(s) for c in COVER)

# ── 4. Значения: нормализация и разделение «прилипших» полей ────────────────
SPLIT_RES = [
    (re.compile(r'^(.*?Гбит/с)\s+Разъем:\s*(.+)$', re.I),
     lambda a, b: [('Скорость передачи', a.strip()),
                   ('Разъём', re.sub(r'\s*[x×]\s*', ' × ', b.strip()))]),
    (re.compile(r'^(.*?Мбит/с)\s+Разъем:\s*(.+)$', re.I),
     lambda a, b: [('Скорость передачи', a.strip()),
                   ('Разъём', re.sub(r'\s*[x×]\s*', ' × ', b.strip()))]),
    (re.compile(r'^(.+?);\s*Дальность передачи\s+(\d+)\s*(м|км)', re.I),
     lambda a, b, c: [(None, a.strip()), ('Дальность передачи', f'{b} {c}')]),
]

def norm_value(name, v):
    v = str(v).strip()
    if v.lower() in JUNK_VALUES:
        return None
    v = re.sub(r'<br\s*/?>$', '', v, flags=re.I).strip()
    if name == 'Рабочая температура, °C':
        v = v.replace('−', '-')
        g = re.match(r'^([-+]?\d+)\s*[~….]+\s*([-+]?\d+)\s*[º°]?[CС]?$', v)
        if g:
            v = f'{g.group(1)}…{g.group(2)}'
    if name == 'Габаритные размеры (Д×Ш×В), мм':
        v = re.sub(r'\s*[хxХX×]\s*', '×', v, flags=re.I)
        v = re.sub(r'\s*мм$', '', v)
    if name == 'Потребляемый ток, А':
        g = re.match(r'^(\d+)\s*mA$', v, re.I)
        if g:
            v = str(int(g.group(1)) / 1000)
    if name == 'Регулировка усилия' and re.match(r'^EN\d', v):
        v = 'Да'
    if name == 'Тип монтажа':
        v = re.sub(r'^На поверхность\s*/\s*', '', v)
    if re.match(r'^\d+,\d+$', v):
        v = v.replace(',', '.')
    if name in VALUE_FIX or True:
        low = v.lower()
        if low in VALUE_FIX:
            v = VALUE_FIX[low]
    if name in CAP_NAMES and v and v[0].islower():
        v = v[0].upper() + v[1:]
    return v

def union_tokens(cur, add):
    toks, seen = [], set()
    for t in f'{cur}, {add}'.split(', '):
        t = t.strip()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            toks.append(t)
    return ', '.join(toks)

MERGE_NAMES = {'Соответствие стандартам', 'Функции', 'Интерфейсы',
               'Видеокодеки', 'Аудиокодеки'}

# ── 5. Обработка ─────────────────────────────────────────────────────────────
prods = json.load(open(SRC))
report = {'products': [], 'totals': {'rows_before': 0, 'rows_after': 0,
         'added': 0, 'renamed': 0, 'dropped': 0, 'features_removed': 0,
         'desc_changed': 0}}

for p in prods:
    before_rows = len(p.get('specs') or [])
    features_before = list(p.get('features') or [])
    desc_before = p.get('description') or ''
    act = {'renamed': [], 'dropped': [], 'added': [], 'value_fixed': [],
           'features_removed': [], 'desc_changed': False}

    # 5.1 rename + нормализация значений
    rows = collections.OrderedDict()
    for s in (p.get('specs') or []):
        name, raw_v = s['name'], str(s['value'])
        # спец-случаи: длины волн из layta («Длина волны 1310 нм» → Tx/Rx)
        g = re.match(r'^Длина волны (\d{3,4}) нм$', name)
        gv = re.match(r'^(\d{3,4}) нм$', raw_v)
        if g and gv:
            name, raw_v = 'Длина волны Tx/Rx, нм', f'{g.group(1)}/{gv.group(1)}'
        elif name == 'Длина волны Tx':
            name, raw_v = 'Длина волны Tx, нм', re.sub(r'\s*нм$', '', raw_v)
        elif name == 'Длина волны':
            gt = re.match(r'^Tx\s*(\d{3,4})', raw_v)
            if gt:
                name, raw_v = 'Длина волны Tx, нм', gt.group(1)
        name = RENAME.get(name, name)
        if s['name'] != name:
            act['renamed'].append(f"{s['name']} → {name}")
        v = norm_value(name, raw_v)
        if v is None:
            act['dropped'].append(f"{name}: пустое значение «{s['value']}»")
            continue
        if name == 'Исполнение':
            v = EXEC_NORM.get(v, v)
            if v is None:
                act['dropped'].append('Исполнение: значение «нет»')
                continue
        if name in rows:
            if rows[name] == v:
                act['dropped'].append(f'{name}: дубликат значения')
            else:
                act['dropped'].append(f'{name}: вариант «{v}» (оставлен «{rows[name]}»)')
            continue
        rows[name] = v
    for junk in [n for n in rows if n.startswith('DIN-рейка,')]:
        act['dropped'].append(f'{junk}: мусорная строка')
        del rows[junk]

    # 5.2 разделение «прилипших» значений
    for name in list(rows):
        for rx, fn in SPLIT_RES:
            g = rx.match(str(rows[name]))
            if g:
                parts = fn(*g.groups())
                rows[name] = parts[0][1]
                for pn, pv in parts[1:]:
                    if pn and pn not in rows:
                        rows[pn] = pv
                        act['added'].append(f'{pn} = {pv} (из значения «{name}»)')
                act['value_fixed'].append(name)
                break

    # 5.2b длина волны Tx/Rx из пары строк Tx- и второй строки
    if 'Длина волны Tx/Rx, нм' not in rows and 'Длина волны Tx, нм' in rows:
        pass  # вторая (Rx) строка уже слита в 5.1/5.1-dup; оставляем Tx

    # 5.3 глубокое извлечение из описания + features (по секции)
    text = desc_before + '\n' + '\n'.join(features_before)
    for fn in SECTION_EXTRACTORS.get(p['section'], CORE):
        for name, v in fn(text):
            if name in rows:
                cur = str(rows[name])
                if cur.strip().lower() in JUNK_VALUES:
                    rows[name] = v
                    act['value_fixed'].append(f'{name} ← из описания')
                elif name in MERGE_NAMES and v != cur:
                    rows[name] = union_tokens(cur, v)
                    act['value_fixed'].append(f'{name} ← объединено с описанием')
                elif name == 'Цвет' and 'RAL' in v and 'RAL' not in cur:
                    rows[name] = v
                    act['value_fixed'].append(f'{name}: «{cur}» ← «{v}» (RAL из описания)')
                elif name == 'Тип тяги' and len(v) > len(cur):
                    rows[name] = v
                    act['value_fixed'].append(f'{name}: «{cur}» ← «{v}»')
                continue
            rows[name] = v
            act['added'].append(f'{name} = {v} (из описания)')

    # 5.4 габариты: Д/Ш/В ↔ комбинированная строка
    dims_sep = {k: rows.pop(k) for k in ('Длина, мм', 'Ширина, мм', 'Высота, мм')
                if k in rows}
    if 'Габаритные размеры (Д×Ш×В), мм' not in rows and len(dims_sep) == 3:
        try:
            rows['Габаритные размеры (Д×Ш×В), мм'] = '×'.join(
                str(int(float(str(dims_sep[k]).replace(',', '.'))))
                for k in ('Длина, мм', 'Ширина, мм', 'Высота, мм'))
            act['added'].append('Габаритные размеры (Д×Ш×В), мм ← из Д/Ш/В')
        except (ValueError, TypeError):
            for k, v in dims_sep.items():
                rows[k] = v
    else:
        for k, v in dims_sep.items():
            act['dropped'].append(f'{k} = {v} (есть комбинированные габариты)')

    # 5.5 дедуп «Количество портов» ↔ «Количество портов RJ45»
    if 'Количество портов' in rows and 'Количество портов RJ45' in rows:
        if str(rows['Количество портов']) == str(rows['Количество портов RJ45']):
            del rows['Количество портов']
            act['dropped'].append('Количество портов: дубликат RJ45-строки')

    # 5.6 описание: удалить сегменты-параметры (инфо теперь в таблице)
    FIELD_LABELS = re.compile(
        r'(?:Скорость передачи|Разъем|Тип кабеля|Дальность передачи|'
        r'Температурный диапазон|Тип волокна|Длина волны|Тип лазера)\s*:?', re.I)
    if desc_before:
        new_lines = []
        for line in desc_before.split('\n'):
            if not line.strip():
                continue
            if len(FIELD_LABELS.findall(line)) >= 2:
                act['desc_changed'] = True
                continue
            pieces = re.split(r',\s*(?=\D)', line)
            pieces = [q for pp in pieces for q in re.split(r'(?<=[.!?])\s+', pp)]
            pieces = [q for pp in pieces for q in re.split(r'\s*;\s*', pp)]
            kept = [s for s in pieces if not is_param_segment(s)]
            if kept:
                new_lines.append(re.sub(r'\s{2,}', ' ', ', '.join(
                    s.strip(' ;,') for s in kept).strip(' ;,')))
            else:
                act['desc_changed'] = True
        new_desc = '\n'.join(new_lines).strip()
        if new_desc and new_desc != desc_before:
            p['description'] = new_desc
            act['desc_changed'] = True

    # 5.7 features: убрать пункты, ставшие строками таблицы
    desc_norm = re.sub(r'[^0-9a-zа-яё]+', '', desc_before.lower())
    new_features = []
    for f in features_before:
        fs = f.strip()
        f_norm = re.sub(r'[^0-9a-zа-яё]+', '', fs.lower())
        if (is_param_segment(fs)
                or (len(f_norm) > 4 and f_norm in desc_norm)
                or any(rx.search(fs) for rx in (
                    re.compile(x, re.I) for x in (
                        r'^цвет[:\s]', r'^удержание\s+\d+', r'датчик холла',
                        r'^питание\s+\d', r'^рабочая температура', r'^\d+ мб',
                        r'тип\s+[LUVZ]$', r'(?:накладной|настольный)\s+монтаж$',
                        r'для замков до \d+ кг$',
                        r'(?:скорость передачи|разъем|тип кабеля|'
                        r'дальность|температурн|гбит/с|rj45|utp)')))):
            act['features_removed'].append(fs)
            continue
        new_features.append(f)
    p['features'] = new_features

    # 5.8 единый порядок строк
    ordered = sorted(rows.items(), key=lambda kv: (
        ORDER_IDX.get(kv[0], RANK_TAIL),
        kv[0].lower() if kv[0] not in ORDER_IDX else 0))
    p['specs'] = [{'name': n, 'value': v} for n, v in ordered]

    report['products'].append({
        'id': p['id'], 'rows_before': before_rows, 'rows_after': len(p['specs']),
        'renamed': act['renamed'], 'dropped': act['dropped'],
        'added': act['added'], 'value_fixed': act['value_fixed'],
        'features_removed': act['features_removed'],
        'desc_changed': act['desc_changed']})
    report['totals']['rows_before'] += before_rows
    report['totals']['rows_after'] += len(p['specs'])
    report['totals']['added'] += len(act['added'])
    report['totals']['renamed'] += len(act['renamed'])
    report['totals']['dropped'] += len(act['dropped'])
    report['totals']['features_removed'] += len(act['features_removed'])
    report['totals']['desc_changed'] += int(act['desc_changed'])

json.dump(report, open(REPORT, 'w'), ensure_ascii=False, indent=1)
json.dump(prods, open(SRC, 'w'), ensure_ascii=False, indent=1)
print('OK:', json.dumps(report['totals'], ensure_ascii=False))
