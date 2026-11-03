#!/usr/bin/env bash
# Статический экспорт SpaceCam для GitHub Pages (basePath /SpaceCam)
set -euo pipefail
cd /home/z/my-project
NEXT_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/SpaceCam bun run build
touch out/.nojekyll
echo "--- export done ---"
ls out/ | head -20
