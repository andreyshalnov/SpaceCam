#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# Канонический деплой SpaceCam — ЕДИНСТВЕННЫЙ разрешённый путь (docs/STATE.md § 3).
#
# Использование:
#   bash scripts/deploy_spacecam.sh "описание правки"
#
# Что делает:
#   1) git pull --ff-only этого репозитория + проверка чистоты дерева
#      (сборка устаревших исходников = причина инцидента 03.11 — исключена)
#   2) синкает исходники репо (src/ + конфиги) в рабочее пространство
#      $SPACECAM_WORK — workspace не может «стареть» относительно репо
#   3) bun install + статический экспорт (NEXT_PUBLIC_BASE_PATH=/SpaceCam)
#   4) копирует сборку в корень репо, НЕ трогая проектные пути:
#      src/, scripts/, docs/*.md, docs/sql/, docs/backup/, .git
#      (public/ в репо не дублируется — статика public уже в корне репо:
#       products/, brands/, dealers/, docs/*.pdf, логотипы, robots.txt)
#   5) коммит + push (Pages пересоберётся за 1–3 мин)
#   6) напоминает про верификацию: python3 scripts/verify_deploy.py
#
# Требования: bun, rsync, git. Рабочее пространство: $SPACECAM_WORK
# (по умолчанию /home/z/my-project — там node_modules и public/).
# Постаревший после отката песочницы public/ синхронизируется из корня репо
# АВТОМАТИЧЕСКИ (шаг 2.5, урок инцидента 7194dcc от 05.11); чужой node_modules
# лечится bun install внутри скрипта.
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${SPACECAM_WORK:-/home/z/my-project}"
MSG="${1:?Использование: deploy_spacecam.sh \"описание правки\"}"

echo "── 1/6 Репо: pull + проверка чистоты ──"
cd "$REPO"
git pull --ff-only origin main
if [ -n "$(git status --porcelain)" ]; then
  echo "ОШИБКА: рабочее дерево репо не чистое — закоммитьте или спрячьте правки."; exit 1
fi
[ -d "$REPO/src" ] || { echo "ОШИБКА: в репо нет src/ — некуда собирать."; exit 1; }

echo "── 2/6 Синк исходников репо → workspace ($WORK) ──"
[ -d "$WORK" ] || { echo "ОШИБКА: нет workspace $WORK"; exit 1; }
rsync -a --delete "$REPO/src/" "$WORK/src/"
for f in next.config.ts package.json postcss.config.mjs tsconfig.json bun.lock components.json tailwind.config.ts; do
  [ -f "$REPO/$f" ] && cp "$REPO/$f" "$WORK/$f"
done
# next-env.d.ts генерируется сборкой.

echo "── 2.5/6 Статика репо → workspace public/ (урок инцидента 05.11, 7194dcc) ──"
# public/ workspace мог постареть после отката песочницы: сборка из него
# вытерла бы статику репо при rsync --delete (инцидент 05.11: −304 фото,
# −49 паспортов PDF, дилеры/бренд rsafe/solutions/logo.svg). Репо — источник
# истины: синк ДО сборки, идемпотентно.
for d in products brands dealers solutions; do
  [ -d "$REPO/$d" ] && rsync -a --delete "$REPO/$d/" "$WORK/public/$d/"
done
mkdir -p "$WORK/public/docs" && cp -f "$REPO"/docs/*.pdf "$WORK/public/docs"/
for f in logo.png logo-light.png logo.svg robots.txt; do
  [ -f "$REPO/$f" ] && cp -f "$REPO/$f" "$WORK/public/$f"
done

echo "── 3/6 Сборка static export ──"
cd "$WORK"
bun install >/dev/null
NEXT_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/SpaceCam bun run build
touch out/.nojekyll
[ -f out/index.html ] || { echo "ОШИБКА: out/index.html не создан"; exit 1; }

echo "── 4/6 Статика → корень репо (проектные пути защищены) ──"
cd "$REPO"
rsync -a --delete "$WORK/out/" "$REPO/" \
  --exclude '.git' \
  --exclude '/src' \
  --exclude '/scripts' \
  --exclude '/docs/sql' \
  --exclude '/docs/backup' \
  --exclude '/docs/PROJECT_NOTES.md' \
  --exclude '/docs/TECH_SPEC.md' \
  --exclude '/docs/STATE.md' \
  --exclude '/package.json' \
  --exclude '/bun.lock' \
  --exclude '/tsconfig.json' \
  --exclude '/next.config.ts' \
  --exclude '/postcss.config.mjs' \
  --exclude '/next-env.d.ts'
# Корневые конфиги (package.json, bun.lock, tsconfig.json, next.config.ts,
# postcss.config.mjs, next-env.d.ts) — часть «источника истины» в репо:
# out/ их не содержит, без исключений rsync --delete стёр бы их при деплое
# (найдено dry-run 04.11, до первой выкатки по каноническому скрипту).

echo "── 5/6 Коммит + push ──"
git add -A
if git diff --cached --quiet; then
  echo "Изменений нет — деплой не нужен."; exit 0
fi
git commit -m "Deploy: $MSG"
git push origin main

echo "── 6/6 Верификация ──"
echo "Через 1–3 мин (кеш Pages 600 с) выполните:"
echo "  python3 $REPO/scripts/verify_deploy.py"
echo "Деплой '$MSG' отправлен: $(git rev-parse --short HEAD)"
