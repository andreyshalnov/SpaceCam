#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_okl_matrix.py — генерация src/data/okl-matrix.json (ТЗ «Калькулятор ОКЛ», п. 6.2).

Первичоисточник матрицы: инструкция по монтажу ОКЛ «ПожТехКабель PTK-Line»
(ИМ ОКЛ ПожТехКабель 2021-0233310-00), Таблица 2.1 «Время работоспособности линий
в условиях пожара» — кэш текста scripts/okl-src/instruction_current.txt.
Реквизиты сертификатов — сканы scripts/okl-src/sert5.pdf (ССБК RU.ПБ10.Н00466),
sert6.pdf (ССБК RU.ПБ10.Н00476), распознанные с первой страницы каждого скана.

Типоразмеры КНС, коробок и крепежа собираются из src/data/products.json
(только позиции с ценой либо значимые позиции реестра) и валидируются:
каждый артикул, попавший в матрицу, обязан существовать в products.json
(ТЗ, раздел 11 «Опечатки парсинга PDF-каталога»), иначе сборка падает.

Скрипт идемпотентен: при неизменных входных данных выходной файл не меняется
(данные метятся датой generated, которую можно зафиксировать через --fixed-date).
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_TXT = os.path.join(ROOT, "scripts", "okl-src", "instruction_current.txt")
PRODUCTS = os.path.join(ROOT, "src", "data", "products.json")
OUT = os.path.join(ROOT, "src", "data", "okl-matrix.json")

# ── Известный набор систем ОКЛ PTK-Line (инструкция, термины и сокращения) ──
SYSTEM_IDS = [
    "ОП", "КК", "ККМОМ", "ТГЛ СЗ", "ТГТ СЗ", "ТГ FRHF", "РМ", "РМП", "ТС ВГП",
    "ЛМПО", "ЛМНО", "ЛМПРО", "ЛМЛО",
    "ТСП-ОП", "ТСП-ТГЛ СЗ", "ТСП-ТГТ СЗ", "ТСП-ТГ FRHF", "ТСП-РМ", "ТСП-РМП", "ТСП-ТС ВГП",
]
# Подмножества для распределения «двух чисел» в блоке (60/90 и т. п.)
FIRST_SET_G1 = {"ОП", "КК", "ТГЛ СЗ", "ТГТ СЗ"}
FIRST_SET_G2 = {"ТСП-ОП", "ТСП-ТГЛ СЗ", "ТСП-ТГТ СЗ"}

SYSTEMS = {
    "ОП": {"title": "Открытая прокладка на держателях ДМОУ", "knsType": "open", "group": "surface"},
    "КК": {"title": "Кабель-канал ПВХ с крышкой (ДМОУ внутри)", "knsType": "cc", "group": "surface"},
    "ККМОМ": {"title": "Канал кабельный монтажный огнестойкий металлический", "knsType": "cc_metal", "group": "surface"},
    "ТГЛ СЗ": {"title": "Труба гофрированная... Труба гладкая самозатухающая ПВХ", "knsType": "pipe_smooth", "group": "surface"},
    "ТГТ СЗ": {"title": "Труба гофрированная тяжёлая самозатухающая ПВХ", "knsType": "pipe_corrugated", "group": "surface"},
    "ТГ FRHF": {"title": "Труба гофрированная трудногорючая безгалогенная (FRHF)", "knsType": "pipe_corrugated", "group": "surface"},
    "РМ": {"title": "Рукав металлический Р3-Ц-Х", "knsType": "metal_hose", "group": "surface"},
    "РМП": {"title": "Рукав металлический Р3-Ц-П (в ПВХ оболочке)", "knsType": "metal_hose", "group": "surface"},
    "ТС ВГП": {"title": "Труба стальная водогазопроводная (ГОСТ 3262-75)", "knsType": "steel_pipe", "group": "surface"},
    "ЛМПО": {"title": "Лоток металлический перфорированный оцинкованный", "knsType": "tray", "group": "surface"},
    "ЛМНО": {"title": "Лоток металлический неперфорированный оцинкованный", "knsType": "tray", "group": "surface"},
    "ЛМПРО": {"title": "Лоток металлический проволочный оцинкованный", "knsType": "wire_tray", "group": "surface"},
    "ЛМЛО": {"title": "Лоток металлический лестничный оцинкованный", "knsType": "ladder_tray", "group": "surface"},
    "ТСП-ОП": {"title": "Тросовая прокладка: кабель на тросе открыто", "knsType": "rope", "group": "rope"},
    "ТСП-ТГЛ СЗ": {"title": "Тросовая прокладка: труба гладкая СЗ на тросе", "knsType": "rope_pipe", "group": "rope"},
    "ТСП-ТГТ СЗ": {"title": "Тросовая прокладка: труба гофрированная СЗ на тросе", "knsType": "rope_pipe", "group": "rope"},
    "ТСП-ТГ FRHF": {"title": "Тросовая прокладка: труба гофрированная FRHF на тросе", "knsType": "rope_pipe", "group": "rope"},
    "ТСП-РМ": {"title": "Тросовая прокладка: рукав металлический Р3-Ц-Х на тросе", "knsType": "rope_hose", "group": "rope"},
    "ТСП-РМП": {"title": "Тросовая прокладка: рукав металлический Р3-Ц-П на тросе", "knsType": "rope_hose", "group": "rope"},
    "ТСП-ТС ВГП": {"title": "Тросовая прокладка: труба стальная ВГП на тросе", "knsType": "rope_pipe", "group": "rope"},
}
# Уточнение названий систем (точные формулировки инструкции)
SYSTEMS["ТГЛ СЗ"]["title"] = "Труба гладкая самозатухающая ПВХ"

GROUP_TITLES = {
    "G1": "По стенам, потолку, полу, по металлическим конструкциям, по плитам однослойным и многослойным гипсовым (ГОСТ 32614-2012), листам гипсокартона (ГОСТ 6266-97), по сэндвич-панелям (ГОСТ 32603-2012) и профилям стальным листовым (ГОСТ 24045-2016)",
    "G2": "Прокладка на тросе (канате)",
    "G3": "Прокладка по деревянным не клееным конструкциям",
}

CERTIFICATES = {
    "N00466": {
        "reg": "ССБК RU.ПБ10.Н00466",
        "holder": "ООО «Технолайт»",
        "std": "ГОСТ Р 53316-2009",
        "validFrom": "17.12.2021",
        "validTo": "16.12.2026",
        "url": "https://ptcab.ru/sert/sert5.pdf",
        "tu": "ТУ 27.90.33-001-0233310-2021",
        "instruction": "ИМ ОКЛ ПожТехКабель 2021-0233310-001",
        "source": "Скан сертификата ptcab.ru/sert/sert5.pdf, стр. 1 (проверено 11.11.2026)",
    },
    "N00476": {
        "reg": "ССБК RU.ПБ10.Н00476",
        "holder": "ООО «Технолайт»",
        "std": "ГОСТ Р 53316-2021",
        "validFrom": "30.09.2022",
        "validTo": "29.09.2027",
        "url": "https://ptcab.ru/sert/sert6.pdf",
        "tu": "ТУ 27.90.33-001-0233310-2021",
        "instruction": "ИМ ОКЛ ПожТехКабель 2021-0233310-00",
        "source": "Скан сертификата ptcab.ru/sert/sert6.pdf, стр. 1 (проверено 11.11.2026)",
    },
}

CABLE_CATEGORIES = {
    "signal": {"title": "Сигнальные", "summary": "Кабели сигнальные для СПС/СОУЭ (КПС…)", "section": "1.1/1.2"},
    "interface": {"title": "Интерфейсные", "summary": "Кабели интерфейсные (КПИ/КИС…)", "section": "2.1/2.2"},
    "pair": {"title": "Парной скрутки", "summary": "Кабели парной скрутки Cat5e (ParLan…)", "section": "3.1/3.2"},
    "power": {"title": "Силовые", "summary": "Кабели силовые до 1 кВ (ВВГнг(А)-FRLS, ППГнг(А)-FRHF…)", "section": "4.1/4.2"},
    "control": {"title": "Контрольные", "summary": "Кабели контрольные (КВВГ…)", "section": "5.1/5.2"},
    "optical": {"title": "Оптические", "summary": "Кабели оптические (ОКМБ…)", "section": "6.1"},
}

# ── Производители и марки кабелей (Таблица 2.1 инструкции, стр. 8–16) ──
# Источник каждого блока: инструкция Таблица 2.1, разделы 1.1–6.1.
CATALOG = {
    "N00466": {
        "signal": [
            {
                "producer": "ООО «ЭНТЭ», г. Орёл", "url": "http://entecable.ru/",
                "tu": "ТУ 27.32.13-016-37395223-2020",
                "gauge": "Сечение жил 0,35–2,50 мм²; 1–4 пары; 2–8 жил",
                "marks": ["КПСнг(А)-FRLS", "КПСЭнг(А)-FRLS", "КПССнг(A)-FRLS", "КПСЭСнг(А)-FRLS",
                          "КПСнг(А)-FRHF", "КПСЭнг(А)-FRHF", "КПССнг(A)-FRHF", "КПСЭСнг(А)-FRHF",
                          "КПСнг(А)-FRLSLTx", "КПСЭнг(А)-FRLSLTx", "КПССнг(A)-FRLSLTx", "КПСЭСнг(А)-FRLSLTx"],
            },
            {
                "producer": "ООО «ОрелТехКабель», г. Орёл", "url": "http://www.tehcab.pro/",
                "tu": "ТУ 27.32.13-001-43673382-2020 (бронированные)",
                "gauge": "Сечение жил 0,35–2,50 мм²; 1–4 пары; 2–8 жил",
                "armored": True,
                "marks": ["КПСВКВнг(А)-FRLS", "КПСЭВКВнг(А)-FRLS", "КПСПКПнг(А)-FRHF", "КПСЭПКПнг(А)-FRHF",
                          "КПСВКВнг(А)-FRLSLTx", "КПСЭВКВнг(А)-FRLSLTx"],
            },
        ],
        "interface": [
            {
                "producer": "ООО «ЭНТЭ», г. Орёл", "url": "http://entecable.ru/",
                "tu": "ТУ 27.32.13-015-37395223-2020",
                "gauge": "Диаметр жил 0,5–1,75 мм; 1–4 пары",
                "marks": ["КПИнг(А)-FRLS", "КПИэнг(А)-FRLS", "КПИнг(А)-FRHF", "КПИэнг(А)-FRHF",
                          "КПИнг(А)-FRLSLTx", "КПИэнг(А)-FRLSLTx"],
            },
        ],
        "pair": [
            {
                "producer": "ООО «ТПД Паритет», г. Подольск", "url": "https://paritet.su/",
                "tu": "ТУ 3574-030-39793330-2016",
                "gauge": "Диаметр жилы 0,52 мм; 2 и 4 пары",
                "marks": ["ParLan U/UTP Cat5e PVCLS нг(A)-FRLS", "ParLan U/UTP Cat5e ZH нг(A)-FRHF",
                          "ParLan U/UTP Cat5e PVCLS нг(A)-FRLSLTx", "ParLan F/UTP Cat5e PVCLS нг(A)-FRLS",
                          "ParLan F/UTP Cat5e ZH нг(A)-FRHF", "ParLan F/UTP Cat5e PVCLS нг(A)-FRLSLTx"],
            },
        ],
        "power": [
            {
                "producer": "АО «ИВКЗ», г. Иваново", "url": "https://ivkz.ru/",
                "tu": "ТУ 27.32.13-025-45310838-2020",
                "gauge": "Сечение жил 1,5–16 мм²; 1–5 жил",
                "marks": ["ВВГнг(А)-FRLS", "ВВГЭнг(А)-FRLS", "ВВГнг(А)-FRLSLTx", "ВВГЭнг(А)-FRLSLTx",
                          "ППГнг(А)-FRHF", "ППГЭнг(А)-FRHF"],
            },
            {
                "producer": "ООО «ЭМ-кабель», г. Саранск", "url": "https://emcable.ru/",
                "tu": "ТУ 16.К71-337-2004, ТУ 16.К71-339-2004, ТУ 16-705.496-2011",
                "gauge": "Сечение жил 16–50 мм²; 1–5 жил (прокладка на тросе)",
                "marks": ["ВВГнг(А)-FRLS", "ВВГЭнг(А)-FRLS", "ВВГнг(А)-FRLSLTx", "ВВГЭнг(А)-FRLSLTx",
                          "ППГнг(А)-FRHF", "ППГЭнг(А)-FRHF"],
            },
        ],
        "control": [
            {
                "producer": "ООО «ИВКЗ», г. Иваново", "url": "https://ivkz.ru/",
                "tu": "ТУ 27.32.13-024-45310838-2020",
                "gauge": "Сечение жил 0,75–6 мм²; 4–27 жил",
                "marks": ["КВВГнг(А)-FRLS", "КВВГЭнг(А)-FRLS", "КППГнг(А)-FRHF", "КППГЭнг(А)-FRHF",
                          "КВВГнг(А)-FRLSLTx", "КВВГЭнг(А)-FRLSLTx"],
            },
        ],
        "optical": [
            {
                "producer": "ООО «КабельЭлектроСвязь», г. Видное", "url": "https://cabletrade.ru/",
                "tu": "ТУ 3587-008-93497588-2016",
                "gauge": "Количество волокон 4–16",
                "marks": ["ОКМБ-02нг(А)-FRLS", "ОКМБ-02нг(А)-FRHF", "ОКМБ-02нг(А)-FRLSLTx"],
            },
        ],
    },
    "N00476": {
        "signal": [
            {
                "producer": "ООО «ТД «Технокабель-НН», г. Нижний Новгород", "url": "https://tehnocable.ru/",
                "tu": "ТУ 27.32.13-001-43000513-2020",
                "gauge": "Сечение жил 0,35–2,50 мм²; 2–8 жил",
                "marks": ["КПСнг(А)-FRLS", "КПСЭнг(А)-FRLS", "КПССнг(A)-FRLS", "КПССЭнг(А)-FRLS", "КПСС-Пнг(A)-FRLS",
                          "КПСнг(А)-FRHF", "КПСЭнг(А)-FRHF", "КПССнг(A)-FRHF", "КПССЭнг(А)-FRHF", "КПСС-Пнг(A)-FRHF",
                          "КПСнг(А)-FRLSLTx", "КПССнг(A)-FRLSLTx", "КПССЭнг(А)-FRLSLTx", "КПСС-Пнг(А)-FRLSLTx"],
            },
            {
                "producer": "ООО «ТПД Паритет», г. Подольск", "url": "https://paritet.su/",
                "tu": "ТУ 3581-014-39793330-2009",
                "gauge": "Диаметр жил 0,50–1,78 мм; 1–4 пары; 2–10 жил",
                "marks": ["КСРВнг(А)-FRLS", "КСРЭВнг(А)-FRLS", "КСРПнг(А)-FRHF", "КСРЭПнг(А)-FRHF",
                          "КСРП-Мнг(А)-FRHF", "КСРЭП-Мнг(А)-FRHF", "КСРВнг(А)-FRLSLTx", "КСРЭВнг(А)-FRLSLTx",
                          "КСРВКнг(А)-FRLS", "КСРЭВКнг(А)-FRLS", "КСРВКШвнг(А)-FRLS", "КСРЭВКШвнг(А)-FRLS",
                          "КСРПКнг(А)-FRHF", "КСРЭПКнг(А)-FRHF", "КСРПКШпнг(А)-FRHF", "КСРЭПКШпнг(А)-FRHF",
                          "КСРПК-Мнг(А)-FRHF", "КСРЭПК-Мнг(А)-FRHF", "КСРВКнг(А)-FRLSLTx", "КСРЭВКнг(А)-FRLSLTx",
                          "КСРВКШвнг(А)-FRLSLTx", "КСРЭВКШвнг(А)-FRLSLTx"],
            },
            {
                "producer": "АО «ИВКЗ», г. Иваново", "url": "https://ivkz.ru/",
                "tu": "ТУ 27.32.13-028-45310838-2020, ТУ 27.32.13-001-43673382-2020 (бронированные)",
                "gauge": "Сечение жил 0,35–2,50 мм²; 2–8 жил",
                "armored": True,
                "marks": ["КПСнг(А)-FRLS", "КПСЭнг(А)-FRLS", "КПССнг(A)-FRLS", "КПСЭСнг(А)-FRLS",
                          "КПСнг(А)-FRHF", "КПСЭнг(А)-FRHF", "КПССнг(A)-FRHF", "КПСЭСнг(А)-FRHF",
                          "КПСнг(А)-FRLSLTx", "КПСCнг(А)-FRLSLTx", "КПСЭСнг(А)-FRLSLTx",
                          "КПСВКВнг(А)-FRLS", "КПСЭВКВнг(А)-FRLS", "КПССВКВнг(A)-FRLS", "КПСЭСВКВнг(А)-FRLS",
                          "КПСПКПнг(А)-FRHF", "КПСЭПКПнг(А)-FRHF", "КПССПКПнг(A)-FRHF", "КПСЭСПКПнг(А)-FRHF",
                          "КПСВКВнг(А)-FRLSLTx", "КПСЭВКВнг(А)-FRLSLTx", "КПСCВКВнг(А)-FRLSLTx", "КПСЭСВКВнг(А)-FRLSLTx"],
            },
        ],
        "interface": [
            {
                "producer": "ООО «ТПД Паритет», г. Подольск", "url": "https://paritet.su/",
                "tu": "ТУ 3574-020-39793330-2012",
                "gauge": "Диаметр жил 0,50–1,78 мм; 1–4 пары",
                "marks": ["КИС-РВнг(А)-FRLS", "КИС-РВГнг(А)-FRLS", "КИС-РПнг(А)-FRHF", "КИС-РПГнг(А)-FRHF",
                          "КИС-РП-Мнг(А)-FRHF", "КИС-РПГ-Мнг(А)-FRHF", "КИС-РВнг(А)-FRLSLTx", "КИС-РВГнг(А)-FRLSLTx",
                          "КИС-РВ-Кнг(А)-FRLS", "КИС-РВГ-Кнг(А)-FRLS", "КИС-РВ-КШвнг(А)-FRLS", "КИС-РВГ-КШвнг(А)-FRLS",
                          "КИС-РП-Кнг(А)-FRHF", "КИС-РПГ-Кнг(А)-FRHF", "КИС-РП-КШпнг(А)-FRHF", "КИС-РПГ-КШпнг(А)-FRHF",
                          "КИС-РП-К-Мнг(А)-FRHF", "КИС-РПГ-К-Мнг(А)-FRHF", "КИС-РП-КШп-Мнг(А)-FRHF", "КИС-РПГ-КШп-Мнг(А)-FRHF",
                          "КИС-РВ-Кнг(А)-FRLSLTx", "КИС-РВГ-Кнг(А)-FRLSLTx"],
            },
        ],
        "pair": [
            {
                "producer": "ООО «ТПД Паритет», г. Подольск", "url": "https://paritet.su/",
                "tu": "ТУ 3574-030-39793330-2016",
                "gauge": "Диаметр жилы 0,52 мм; 2 и 4 пары",
                "marks": ["ParLan SF/UTP Cat5e PVCLS нг(A)-FRLSLTx",
                          "ParLan ARM U/UTP Cat5e PVCLS нг(A)-FRLS", "ParLan ARM PS U/UTP Cat5e PVCLS нг(A)-FRLS",
                          "ParLan ARM U/UTP Cat5e ZH нг(A)-FRHF", "ParLan ARM PS U/UTP Cat5e ZH нг(A)-FRHF",
                          "ParLan ARM U/UTP Cat5e PVCLS нг(A)-FRLSLTx", "ParLan ARM PS U/UTP Cat5e PVCLS нг(A)-FRLSLTx",
                          "ParLan ARM F/UTP Cat5e PVCLS нг(A)-FRLS", "ParLan ARM PS F/UTP Cat5e PVCLS нг(A)-FRLS",
                          "ParLan ARM F/UTP Cat5e ZH нг(A)-FRHF", "ParLan ARM PS F/UTP Cat5e ZH нг(A)-FRHF",
                          "ParLan ARM F/UTP Cat5e PVCLS нг(A)-FRLSLTx"],
            },
        ],
        "power": [
            {
                "producer": "ООО «ТПД Паритет», г. Подольск", "url": "https://paritet.su/",
                "tu": "ТУ 3500-029-39793330-2015",
                "gauge": "Сечение жил 1,5–6 мм²; 2–5 жил",
                "note": "Время 60 мин для марок КПР производства «ТПД Паритет» (стр. 13 инструкции)",
                "marks": ["КПРВГнг(А)-FRLS", "КПРПГнг(А)-FRHF", "КПРВГнг(А)-FRLSLTx",
                          "КПРВКнг(А)-FRLS", "КПРВКШвнг(А)-FRLS", "КПРПКнг(А)-FRHF", "КПРПКШпнг(А)-FRHF",
                          "КПРВКнг(А)-FRLSLTx", "КПРВКШвнг(А)-FRLSLTx"],
            },
            {
                "producer": "АО «ИВКЗ», г. Иваново", "url": "https://ivkz.ru/",
                "tu": "ТУ 27.32.13-024-45310838-2020",
                "gauge": "Сечение жил 1,5–16 мм²; 1–5 жил",
                "marks": ["ВБШвнг(А)-FRLS", "ВБШвнг(А)-FRLSLTx", "ПБПнг(А)-FRHF"],
            },
            {
                "producer": "ООО «Конкорд», г. Смоленск", "url": "https://nym.ru/",
                "tu": "ТУ 3500-012-12350648-14, ТУ 27.32.13-020-12350648-2018, ТУ 3500-009-12350648-12, ТУ 27.32.13-018-12350648-2018, ТУ 3500-010-12350648-13",
                "gauge": "Сечение жил 1,5–300 мм²; 1–5 жил",
                "marks": ["ВВГнг(А)-FRLS", "ВВГ-Пнг(А)-FRLS", "ВВГЭнг(А)-FRLS", "ППГнг(А)-FRHF", "ППГ-Пнг(А)-FRHF",
                          "ППГЭнг(А)-FRHF", "ПвПГнг(А)-FRHF", "ПвПГЭнг(А)-FRHF", "ВВГнг(А)-FRLSLTx", "ВВГЭнг(А)-FRLSLTx",
                          "ВВГ-Пнг(А)-FRLSLTx", "ВБШвнг(А)-FRLS", "ВБШвнг(А)-FRLSLTx", "ПБПнг(А)-FRHF",
                          "ПКПнг(А)-FRHF", "ПКаПнг(А)-FRHF", "ПвБПнг(А)-FRHF", "ПвКПнг(А)-FRHF", "ПвКаПнг(А)-FRHF"],
            },
        ],
        "control": [
            {
                "producer": "ООО «Конкорд», г. Смоленск", "url": "https://nym.ru/",
                "tu": "ТУ 3563-011-12350648-14",
                "gauge": "Сечение жил 0,75–6 мм²; 4–61 жил",
                "marks": ["КВВГнг(А)-FRLS", "КВВГЭнг(А)-FRLS", "КППГнг(А)-FRHF", "КППГЭнг(А)-FRHF",
                          "КВБбШвнг(А)-FRLS", "КПБбПнг(А)-FRHF"],
            },
        ],
    },
}

# ── Поверхности/способы прокладки для селектора (объединённый справочник, FR-4) ──
SURFACES = [
    {"id": "concrete", "title": "Бетон, железобетон, камень, кирпич (стена, потолок, пол)", "group": "G1"},
    {"id": "gazobeton", "title": "Газобетон, пеноблок", "group": "G1"},
    {"id": "plasterboard", "title": "Гипсокартон, плиты гипсовые (ГОСТ 6266-97 / 32614-2012)", "group": "G1"},
    {"id": "metal", "title": "Металлические конструкции, профлист", "group": "G1"},
    {"id": "sandwich", "title": "Сэндвич-панели (ГОСТ 32603-2012)", "group": "G1"},
    {"id": "shtroba", "title": "Штроба (борозда) с заделкой несгораемым слоем ≥ 10 мм", "group": "G1",
     "note": "ПУЭ 7 пп. 2.1.38–2.1.40 (приложение А инструкции); применяется огнестойкий кабель по ГОСТ 31565-2012"},
    {"id": "wood", "title": "Дерево (не клеёные конструкции)", "group": "G3"},
    {"id": "rope", "title": "Стальной трос (канат) — тросовая прокладка", "group": "G2"},
]

# ── Спецификационные профили систем: какие артикулы каталога составляют линию ──
# Каждый артикул проверяется на существование в products.json (валидатор ниже).
SPEC_PROFILES = {
    "ОП": {
        "kns": None,
        "holders": {"1": "840-001", "2": "840-002"},  # ДМОУ-1К / ДМОУ-2К, шаг крепления ≤ 500 мм
        "boxKind": "auto",
        "extra": [],
    },
    "КК": {
        "kns": {"kind": "cc", "prefixes": [[500, 509]], "titleRe": r"Кабель-канал (\d+)x(\d+)", "wRe": 1, "hRe": 2},
        "holders": {"1": "840-001", "2": "840-002"},  # исполнение ДМОУ — по табл. 2.3.1 инструкции
        "boxKind": "auto",
        "extra": [],
    },
    "ККМОМ": {
        "kns": {"kind": "cc_metal", "prefixes": [[520, 520]], "titleRe": r"ККМОМ[^\d]*(\d+)х(\d+)|огнестойкий металлический (\d+)х(\d+)", "wRe": 3, "hRe": 4},
        "holders": None,  # крепление канала к поверхности (саморез + дюбель), шаг ≤ 500 мм
        "boxKind": "metal",
        "extra": [],
    },
    "ТГЛ СЗ": {
        "kns": {"kind": "pipe", "prefixes": [[712, 712]], "titleRe": r"ПВХ д[.о]*\s*(\d+)\s*мм|ПВХ D(\d+)\s*мм", "dRe": 1},
        "holders": "clip",
        "boxKind": "auto",
        "extra": [],
    },
    "ТГТ СЗ": {
        "kns": {"kind": "pipe", "prefixes": [[710, 710]], "titleRe": r"ПВХ\s*(\d+)\s*мм", "dRe": 1},
        "holders": "clip",
        "boxKind": "auto",
        "extra": [],
    },
    "ТГ FRHF": {
        "kns": {"kind": "pipe", "prefixes": [[713, 713]], "titleRe": r"FRHF[^\d]*(\d+)\s*мм", "dRe": 1},
        "holders": "clip",
        "boxKind": "auto",
        "extra": [],
    },
    "РМ": {
        "kns": {"kind": "hose", "prefixes": [[801, 801], [800, 800]], "titleRe": r"Р3-Ц-Х\s*(\d+)\s*\(", "dRe": 1},
        "holders": "clip",
        "boxKind": "metal",
        "extra": [{"role": "вводная муфта (2 шт на линию)", "pick": "муфта", "skuRe": r"Муфта вводная для металлорукава (\d+)"}],
    },
    "РМП": {
        "kns": {"kind": "hose", "prefixes": [[810, 810]], "titleRe": r"Р3-Ц-П\s*(\d+)\s*\(", "dRe": 1},
        "holders": "clip",
        "boxKind": "metal",
        "extra": [{"role": "вводная муфта (2 шт на линию)", "pick": "муфта", "skuRe": r"Муфта вводная для металлорукава (\d+)"}],
    },
    "ТС ВГП": {
        "kns": {"kind": "pipe", "prefixes": [[750, 750]], "titleRe": r"ВГП[^0-9]*(\d+)x", "dRe": 1},
        "holders": "clip",
        "boxKind": "metal",
        "extra": [],
    },
    "ЛМПО": {
        "kns": {"kind": "tray", "prefixes": [[530, 537]], "titleRe": r"ЛМПО (\d+)x(\d+)", "wRe": 1, "hRe": 2},
        "holders": "console",  # стойка консольная / кронштейн, шаг ≤ 1500 мм
        "boxKind": "auto",
        "extra": [],
    },
    "ЛМНО": {
        "kns": {"kind": "tray", "prefixes": [[530, 537]], "titleRe": r"ЛМНО (\d+)x(\d+)", "wRe": 1, "hRe": 2},
        "holders": "console",
        "boxKind": "auto",
        "extra": [],
    },
    "ЛМПРО": {
        "kns": {"kind": "wire_tray", "prefixes": [[600, 600]], "titleRe": r"ЛМПРО (\d+)x(\d+)", "wRe": 1, "hRe": 2},
        "holders": "console",
        "boxKind": "auto",
        "extra": [{"role": "прижим для проволочного лотка (на соединение)", "sku": "620-001"}],
    },
    "ЛМЛО": {
        "kns": {"kind": "ladder_tray", "prefixes": [[650, 650]], "titleRe": r"ЛМЛО (\d+)x(\d+)", "wRe": 1, "hRe": 2},
        "holders": "console",
        "boxKind": "auto",
        "extra": [],
    },
    "ТСП-ОП": {
        "kns": {"kind": "rope", "prefixes": [[890, 890]], "titleRe": r"Трос стальной\s*(\d+(?:,\d+)?)\s*(?:мм)?\s*(?:DIN|ГОСТ)", "dRe": 1},
        "holders": "rope",
        "boxKind": "rope",
        "extra": [
            {"role": "зажим троса (по 2 на каждый конец)", "pick": "зажим", "skuRe": r"Зажим троса D(\d+) усиленный"},
            {"role": "коуш троса (2 шт на линию)", "pick": "коуш", "skuRe": r"Коуш для троса D(\d+)"},
        ],
    },
}
# ТСП-системы с трубами/рукавом на тросе наследуют КНС от наземных профилей
SPEC_PROFILES["ТСП-ТГЛ СЗ"] = dict(SPEC_PROFILES["ТГЛ СЗ"]); SPEC_PROFILES["ТСП-ТГЛ СЗ"].update({"kns": SPEC_PROFILES["ТГЛ СЗ"]["kns"], "holders": "rope", "boxKind": "rope"})
SPEC_PROFILES["ТСП-ТГТ СЗ"] = dict(SPEC_PROFILES["ТГТ СЗ"]); SPEC_PROFILES["ТСП-ТГТ СЗ"].update({"kns": SPEC_PROFILES["ТГТ СЗ"]["kns"], "holders": "rope", "boxKind": "rope"})
SPEC_PROFILES["ТСП-ТГ FRHF"] = dict(SPEC_PROFILES["ТГ FRHF"]); SPEC_PROFILES["ТСП-ТГ FRHF"].update({"kns": SPEC_PROFILES["ТГ FRHF"]["kns"], "holders": "rope", "boxKind": "rope"})
SPEC_PROFILES["ТСП-РМ"] = dict(SPEC_PROFILES["РМ"]); SPEC_PROFILES["ТСП-РМ"].update({"holders": "rope", "boxKind": "rope"})
SPEC_PROFILES["ТСП-РМП"] = dict(SPEC_PROFILES["РМП"]); SPEC_PROFILES["ТСП-РМП"].update({"holders": "rope", "boxKind": "rope"})
SPEC_PROFILES["ТСП-ТС ВГП"] = dict(SPEC_PROFILES["ТС ВГП"]); SPEC_PROFILES["ТСП-ТС ВГП"].update({"holders": "rope", "boxKind": "rope"})

# Коробки огнестойкие по числу вводов (артикулы из каталога, проверяются валидатором)
BOXES = {
    "auto": [   # пластиковые/металлические по назначению — подбирается в ядре
        {"cap": 2, "plastic": "072-001", "metal": "070-025"},
        {"cap": 4, "plastic": "072-002", "metal": "070-020"},
        {"cap": 8, "plastic": "072-003", "metal": "070-020"},
        {"cap": 99, "plastic": "072-003", "metal": "070-020"},
    ],
    "plastic": [
        {"cap": 2, "sku": "072-001"}, {"cap": 4, "sku": "072-002"}, {"cap": 99, "sku": "072-003"},
    ],
    "metal": [
        {"cap": 2, "sku": "070-025"}, {"cap": 99, "sku": "070-020"},
    ],
    "rope": [
        {"cap": 2, "sku": "077-001"}, {"cap": 4, "sku": "077-003"}, {"cap": 99, "sku": "077-001"},
    ],
}

SYS_RE = re.compile(r"ПожТехКабель\s+PTK-Line[-–]?\s*([А-ЯЁ\- ]+?)\s*$|ПожТехКабель\s+PTK-Line-([А-ЯЁ\-]+)")


def parse_matrix(txt: str):
    """Механический разбор Таблицы 2.1 → [(cert, cat, group, system, minutes, note)]."""
    # Диапазон таблицы: от заголовка Таблицы 2.1 до «2.2 Монтаж ОКЛ» ПОСЛЕ него
    # (маркер встречается и в оглавлении — ищем строго после начала таблицы)
    start = txt.find("Таблица 2.1 Время работоспособности")
    end = txt.find("2.2 Монтаж ОКЛ «ПожТехКабель PTK-Line-ОП»", start + 100)
    if start < 0 or end < 0:
        sys.exit("ОШИБКА: не найдены границы Таблицы 2.1 в instruction_current.txt")
    body = txt[start:end]

    sec_re = re.compile(r"(\d)\.(\d)\s+Кабели\s+([^(\n]+?)\s*\(сертификат ОКЛ № ССБК RU\.ПБ10\.Н(\d{5})\)")
    cert_map = {"00466": "N00466", "00476": "N00476"}
    cat_map = {
        ("1", "сигнальные"): "signal", ("1", "интерфейсные"): None,
        ("2", "интерфейсные"): "interface",
        ("3", "парной"): "pair",
        ("4", "силовые"): "power",
        ("5", "контрольные"): "control",
        ("6", "оптические"): "optical",
    }

    rows = []
    sections = list(sec_re.finditer(body))
    for i, sec in enumerate(sections):
        major, minor, name, cert_num = sec.group(1), sec.group(2), sec.group(3).strip().lower(), sec.group(4)
        cat = cat_map.get((major, name.split()[0] if name else ""))
        if not cat:
            continue
        cert = cert_map[cert_num]
        chunk = body[sec.end(): sections[i + 1].start() if i + 1 < len(sections) else len(body)]

        # Блоки «Прокладка …»
        blk_re = re.compile(r"Прокладка ([^\n]*)")
        blocks = list(blk_re.finditer(chunk))
        for j, blk in enumerate(blocks):
            head = blk.group(1)
            if head.startswith("на тросе"):
                group, first_set = "G2", FIRST_SET_G2
            elif head.startswith("по деревянным"):
                group, first_set = "G3", {"КК", "ТГЛ СЗ", "ТГТ СЗ", "ТГ FRHF", "РМ", "РМП"}
            else:
                group, first_set = "G1", FIRST_SET_G1
            bchunk = chunk[blk.end(): blocks[j + 1].start() if j + 1 < len(blocks) else len(chunk)]
            # системы в блоке
            systems = []
            for m in re.finditer(r"PTK-Line[-–]\s*([А-ЯЁA-Z][А-ЯЁA-Z\- ]*[А-ЯЁA-Z]|[А-ЯЁA-Z])", bchunk):
                sid = m.group(1).strip().rstrip("- »")
                if sid in SYSTEM_IDS:
                    systems.append(sid)
            # числа минут в блоке: токен из 15/30/60/90/120/180, отбитый длинным
            # пробелом в конце строки (колонка «Время работоспособности» таблицы)
            nums = re.findall(r"\s{5,}(15|30|60|90|120|180)\s*$", bchunk, flags=re.M)
            note = None
            nm = re.search(r"\((\d+)\s*-\s*«?ТПД Паритет»?\)", bchunk)
            if nm:
                note = f"Для «ТПД Паритет» — {nm.group(1)} мин (примечание инструкции, стр. 8–16)"
            # дедуп систем с сохранением порядка
            seen, ordered = set(), []
            for s in systems:
                if s not in seen:
                    seen.add(s)
                    ordered.append(s)
            if not ordered:
                continue
            nums = [int(n) for n in nums]
            # схлопнуть последовательные дубликаты (артефакт двухколонного layout):
            # реальных блоков с тремя разными значениями в таблице нет
            nums = [k for i, k in enumerate(nums) if i == 0 or k != nums[i - 1]]
            if len(nums) == 0:
                sys.exit(f"ОШИБКА: блок без времени ({cert}/{cat}/{group}, системы {ordered[:4]}…)")
            if len(nums) == 1:
                mins = {s: nums[0] for s in ordered}
            else:
                # два числа: первое — FIRST_SET, второе — остальным
                mins = {}
                for s in ordered:
                    mins[s] = nums[0] if s in first_set else nums[1]
                if len(set(mins.values())) != len(nums):
                    sys.exit(f"ОШИБКА: распределение времени ({cert}/{cat}/{group}): {nums} vs {mins}")
            for s in ordered:
                rows.append({"cert": cert, "cat": cat, "group": group, "system": s, "minutes": mins[s], "note": note})
    return rows


def collect_products():
    prods = json.load(open(PRODUCTS, encoding="utf-8"))
    by_sku = {}
    for p in prods:
        by_sku[p["id"]] = p
    return prods, by_sku


def sku_exists(by_sku, sku):
    if sku in by_sku:
        return True
    # некоторые позиции реестра имеют альтернативные id (например, dmou-sk)
    return any(str(v.get("sku", "")).strip().upper() == str(sku).strip().upper() for v in by_sku.values())


def kns_sizes(profile, prods):
    """Типоразмеры КНС системы из каталога (позиции с ценой)."""
    if not profile.get("kns"):
        return []
    k = profile["kns"]
    out = []
    for lo, hi in k["prefixes"]:
        for p in prods:
            try:
                pre = int(p["id"].split("-")[0])
            except ValueError:
                continue
            if not (lo <= pre <= hi) or not p.get("price"):
                continue
            m = re.search(k["titleRe"], p["title"])
            if not m:
                continue
            if k.get("dRe"):
                try:
                    d = float(m.group(k["dRe"]))
                except (TypeError, IndexError, ValueError):
                    continue
                out.append({"sku": p["id"], "title": p["title"], "d": d, "unit": p.get("priceUnit") or "м", "price": p["price"]})
            elif k.get("wRe"):
                try:
                    w = float(m.group(k["wRe"]))
                    h = float(m.group(k["hRe"]))
                except (TypeError, IndexError, ValueError):
                    continue
                out.append({"sku": p["id"], "title": p["title"], "w": w, "h": h, "unit": p.get("priceUnit") or "м", "price": p["price"]})
    # дедуп по sku
    seen, res = set(), []
    for x in out:
        if x["sku"] not in seen:
            seen.add(x["sku"])
            res.append(x)
    return res


def clip_sizes(prods):
    """Клипсы/скобы/муфты: пары (диаметр → артикул) из каталога."""
    clips, muffs = [], []
    for p in prods:
        t = p["title"]
        if p["id"].startswith("700-") and p.get("price"):
            m = re.search(r"Клипса (\d+)", t) or re.search(r"клипса для труб D(\d+)", t, re.I)
            if m:
                clips.append({"d": float(m.group(1)), "sku": p["id"], "price": p["price"]})
        if p["id"].startswith("812-") and p.get("price"):
            m = re.search(r"металлорукава\s*(\d+)", t, re.I)
            if m:
                muffs.append({"d": float(m.group(1)), "sku": p["id"], "price": p["price"]})
    return sorted(clips, key=lambda x: x["d"]), sorted(muffs, key=lambda x: x["d"])


def rope_sizes(prods):
    """Тросы с ценой."""
    out = []
    for p in prods:
        if p["id"].startswith("890-") and p.get("price") and "Трос стальной" in p["title"]:
            m = re.search(r"Трос стальной\s*(\d+(?:,\d+)?)", p["title"])
            if m:
                out.append({"d": float(m.group(1).replace(",", ".")), "sku": p["id"], "unit": p.get("priceUnit") or "м", "price": p["price"], "title": p["title"]})
    return sorted(out, key=lambda x: x["d"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixed-date", default=None, help="зафиксировать дату generated (идемпотентность)")
    args = ap.parse_args()

    if not os.path.exists(SRC_TXT):
        sys.exit(f"ОШИБКА: нет кэша инструкции {SRC_TXT} (см. скрипт fetch_okl_sources.sh)")
    txt = open(SRC_TXT, encoding="utf-8", errors="ignore").read()
    rows = parse_matrix(txt)
    prods, by_sku = collect_products()

    # ── Валидатор: все артикулы матрицы существуют в products.json (ТЗ раздел 11) ──
    missing = []

    def check(sku, where):
        if sku and not sku_exists(by_sku, sku):
            missing.append(f"{sku} ({where})")

    for system, profile in SPEC_PROFILES.items():
        sizes = kns_sizes(profile, prods)
        if profile.get("kns") and not sizes:
            missing.append(f"НЕТ ТИПОРАЗМЕРОВ: {system}")
        if isinstance(profile.get("holders"), dict):
            for v in profile["holders"].values():
                check(v, f"{system}:holder")
        if profile.get("extra"):
            for e in profile["extra"]:
                if e.get("sku"):
                    check(e["sku"], f"{system}:extra")
    for kind, lst in BOXES.items():
        for b in lst:
            check(b.get("sku"), f"boxes:{kind}")
            check(b.get("plastic"), f"boxes:{kind}")
            check(b.get("metal"), f"boxes:{kind}")
    clips, muffs = clip_sizes(prods)
    ropes = rope_sizes(prods)
    if not clips:
        missing.append("НЕТ клипс 700-xxx")
    if not ropes:
        missing.append("НЕТ тросов 890-xxx")
    if missing:
        sys.exit("ОШИБКА ВАЛИДАЦИИ артикулов: " + "; ".join(missing))

    matrix = {
        "version": "1.0.0",
        "generated": args.fixed_date or "2026-11-11",
        "source": {
            "title": "Инструкция по монтажу ОКЛ «ПожТехКабель PTK-Line» ИМ ОКЛ ПожТехКабель 2021-0233310-00, Таблица 2.1 «Время работоспособности линий в условиях пожара» (стр. 8–16)",
            "url": "https://ptcab.ru/instructions/%D0%9E%D0%B3%D0%BD%D0%B5%D1%81%D1%82%D0%BE%D0%B9%D0%BA%D0%B0%D1%8F%20%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F%20%D0%BB%D0%B8%D0%BD%D0%B8%D1%8F%20PTK-%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%86%D0%B8%D1%8F.pdf",
            "certificates": [CERTIFICATES["N00466"]["url"], CERTIFICATES["N00476"]["url"]],
        },
        "certificates": CERTIFICATES,
        "methodGroups": GROUP_TITLES,
        "surfaces": SURFACES,
        "cableCategories": CABLE_CATEGORIES,
        "systems": SYSTEMS,
        "catalog": CATALOG,
        "matrix": rows,
        "specProfiles": {
            s: {
                "kns": kns_sizes(p, prods) if p.get("kns") else [],
                "knsKind": p["kns"]["kind"] if p.get("kns") else None,
                "holders": p.get("holders"),
                "boxKind": p.get("boxKind"),
                "extra": [
                    {**e, "skuResolved": e.get("sku")} if e.get("sku") else e
                    for e in (p.get("extra") or [])
                ],
            }
            for s, p in SPEC_PROFILES.items()
        },
        "boxes": BOXES,
        "clips": clips,
        "hoseMuffs": muffs,
        "ropes": ropes,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(matrix, f, ensure_ascii=False, indent=1, sort_keys=False)
    print(f"OK: {OUT}")
    print(f"  строк матрицы: {len(rows)}")
    print(f"  решений Е90: {sum(1 for r in rows if r['minutes'] >= 90)}; Е60: {sum(1 for r in rows if r['minutes'] == 60)}; Е15: {sum(1 for r in rows if r['minutes'] == 15)}")
    per_cert = {}
    for r in rows:
        per_cert.setdefault(r["cert"], set()).add(r["cat"])
    for c, cats in per_cert.items():
        print(f"  {c}: категории {sorted(cats)}")
    by_sys = {}
    for r in rows:
        by_sys.setdefault(r["system"], set()).add((r["group"], r["minutes"]))
    print(f"  систем в матрице: {len(by_sys)}")


if __name__ == "__main__":
    main()
