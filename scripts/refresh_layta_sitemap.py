# -*- coding: utf-8 -*-
"""Свежая выгрузка sitemap layta.ru → scripts/layta_all_urls.json (с бэкапом)."""
import json
import re
import shutil
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
BASE = '/home/z/my-project'
OUT = f'{BASE}/scripts/layta_all_urls.json'

urls = []
# индекс может быть вложенным: offers.xml → offers-1..N.xml
seen_idx = set()
queue = ['https://layta.ru/sitemap.xml']
file_idx = []
while queue:
    url = queue.pop(0)
    if url in seen_idx:
        continue
    seen_idx.add(url)
    try:
        xml = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read().decode('utf-8', 'ignore')
    except Exception as e:  # noqa: BLE001
        print(f"{url}: ERR {e}")
        continue
    locs = re.findall(r'<loc>(.*?)</loc>', xml)
    if '<sitemapindex' in xml:
        print(f"индекс {url}: {len(locs)} подписей")
        queue += locs
    else:
        print(f"{url}: {len(locs)} URL")
        urls += locs
    if len(urls) > 600000:
        break

shutil.copy(OUT, OUT.replace('.json', '_backup_20261026.json'))
json.dump(urls, open(OUT, 'w'), ensure_ascii=False)
print("итого URL:", len(urls), "→ сохранено", OUT)
