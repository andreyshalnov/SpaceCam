#!/usr/bin/env bash
# Скачивание кэша первоисточников для build_okl_matrix.py / build_okl_norms.py.
# Запуск: bash scripts/okl-src/fetch_okl_sources.sh  (нужен curl + pdftotext)
set -euo pipefail
cd "$(dirname "$0")"
curl -sL --max-time 180 -o instruction_current.pdf "https://ptcab.ru/instructions/%D0%9E%D0%B3%D0%BD%D0%B5%D1%81%D1%82%D0%BE%D0%B9%D0%BA%D0%B0%D1%8F%20%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F%20%D0%BB%D0%B8%D0%BD%D0%B8%D1%8F%20PTK-%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%86%D0%B8%D1%8F.pdf"
curl -sL --max-time 180 -o instruction_2021.pdf "https://ptcab.ru/instructions/%D0%9E%D0%B3%D0%BD%D0%B5%D1%81%D1%82%D0%BE%D0%B9%D0%BA%D0%B0%D1%8F_%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F_%D0%BB%D0%B8%D0%BD%D0%B8%D1%8F_PTK-%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%86%D0%B8%D1%8F_2021_%D0%98%D0%A2%D0%9E%D0%93.pdf"
curl -sL --max-time 180 -o katalog_2021.pdf "https://ptcab.ru/instructions/%D0%9E%D0%B3%D0%BD%D0%B5%D1%81%D1%82%D0%BE%D0%B9%D0%BA%D0%B0%D1%8F_%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F_%D0%BB%D0%B8%D0%BD%D0%B8%D1%8F_PTK-%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3_2021_%D0%98%D0%A2%D0%9E%D0%93.pdf"
curl -sL --max-time 180 -o sert5.pdf "https://ptcab.ru/sert/sert5.pdf"
curl -sL --max-time 180 -o sert6.pdf "https://ptcab.ru/sert/sert6.pdf"
curl -sL --max-time 180 -A "Mozilla/5.0" -o gost31996_full.pdf "https://www.ruscable.ru/doc/docgost/files/77247429117.pdf"
for f in instruction_current instruction_2021 katalog_2021 gost31996_full; do
  pdftotext -layout "$f.pdf" "$f.txt"
done
echo "Кэш обновлён. Далее: python3 scripts/build_okl_matrix.py && python3 scripts/build_okl_norms.py"
