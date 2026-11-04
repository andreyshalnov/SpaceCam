#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Верификация деплоя SpaceCam: live GitHub Pages == рабочее дерево репо == БД.

Запуск из корня репозитория:  python3 scripts/verify_deploy.py [--full]
  базовый режим  — live vs репо (хеши файлов) + состояние git;
  --full         — плюс счётчики БД и anon-пробы (нужен env SUPABASE_SERVICE_KEY;
                   publishable-ключ парсится из src/lib/supabase.ts, он публичный).

Секретов не содержит. Код возврата: 0 — всё сходится, 1 — есть расхождения.
Подробности — docs/STATE.md (§ 3 деплой, § 9 чек-лист входа).
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "https://andreyshalnov.github.io/SpaceCam/"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = "--full" in sys.argv

results = []  # (ok: bool, text: str)


def check(ok: bool, text: str):
    results.append((ok, text))
    print(("  OK   " if ok else "  FAIL ") + text)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "spacecam-verify/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


# ── 1. git-состояние репо ────────────────────────────────────────────────────
def git(*args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True).stdout.strip()


head = git("rev-parse", "--short", "HEAD")
git("fetch", "origin", "main", "--quiet")
behind_ahead = git("rev-list", "--left-right", "--count", "HEAD...origin/main")
dirty = git("status", "--porcelain")
check(behind_ahead == "0\t0", f"git: HEAD {head} синхронизирован с origin/main (behind/ahead: {behind_ahead.replace(chr(9), '/')})")
check(not dirty, "git: рабочее дерево чистое" if not dirty else f"git: есть незакоммиченные изменения: {dirty[:200]}")

# ── 2. live vs репо: фиксированные файлы + топ-8 чанков по размеру ───────────
fixed = ["index.html", "404.html", "robots.txt"]
chunks_dir = os.path.join(REPO, "_next", "static", "chunks")
try:
    chunks = sorted(
        (f for f in os.listdir(chunks_dir) if f.endswith(".js")),
        key=lambda f: -os.path.getsize(os.path.join(chunks_dir, f)),
    )[:8]
except FileNotFoundError:
    chunks = []
    check(False, "нет каталога _next/static/chunks в рабочем дереве — статика не собрана?")

for p in fixed + [f"_next/static/chunks/{c}" for c in chunks]:
    local_path = os.path.join(REPO, p)
    try:
        local = sha(open(local_path, "rb").read())
    except FileNotFoundError:
        check(False, f"{p}: отсутствует локально")
        continue
    try:
        live = sha(fetch(BASE + p))
        check(live == local, f"{p}: live==local ({local[:12]})" if live == local else f"{p}: РАСХОЖДЕНИЕ live={live[:12]} local={local[:12]}")
    except urllib.error.HTTPError as e:
        check(False, f"{p}: live HTTP {e.code}")

# ── 3. publishable-ключ из src (публичный) ───────────────────────────────────
src_ts = open(os.path.join(REPO, "src", "lib", "supabase.ts"), encoding="utf-8").read()
m_url = re.search(r"'(https://[a-z0-9]+\.supabase\.co)'", src_ts)
m_key = re.search(r"'(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,})'", src_ts)
SUPA_URL = m_url.group(1) if m_url else None
PUB_KEY = m_key.group(1) if m_key else None

# ── 4. БД: anon-пробы + счётчики (--full, service-ключ из окружения) ─────────
def rest(path, key):
    """GET /rest/v1/<path> с apikey=<key>; вернуть (status, body)."""
    req = urllib.request.Request(f"{SUPA_URL}/rest/v1/{path}")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")

if SUPA_URL and PUB_KEY:
    st, _ = rest("objects_overview?select=object_code&limit=1", PUB_KEY)
    check(st == 401, f"anon → objects_overview: HTTP {st} (ожидаем 401 — гранты сняты)")
    st, _ = rest("object_types?select=id&limit=1", PUB_KEY)
    check(st == 401, f"anon → object_types: HTTP {st} (ожидаем 401 — у anon сняты все гранты)")
else:
    check(False, "не удалось распарсить URL/ключ из src/lib/supabase.ts")

if FULL:
    svc = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not svc:
        print("  SKIP  --full: SUPABASE_SERVICE_KEY не задан — счётчики БД пропущены")
    elif SUPA_URL:
        expected = {"objects": 257, "object_specs": 436, "object_spec_items": 1094,
                    "object_types": 14, "profiles": 14, "prices": 2487}
        for t, want in expected.items():
            st, body = rest(f"{t}?select=*", svc)
            try:
                n = len(json.loads(body))
                check(n == want, f"БД {t}: {n} строк (эталон STATE.md § 6: {want})")
            except Exception as e:
                check(False, f"БД {t}: не удалось разобрать ответ ({e})")

# ── итог ─────────────────────────────────────────────────────────────────────
fails = sum(1 for ok, _ in results if not ok)
print(f"\nИтого: {len(results) - fails} OK, {fails} FAIL")
if fails:
    print("Деплой НЕ подтверждён — см. FAIL-строки выше. Протокол: docs/STATE.md § 3.")
sys.exit(1 if fails else 0)
