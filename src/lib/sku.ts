// Нормализация артикулов (чистый модуль без зависимостей — используется и на
// сайте, и в bun-скриптах проверки отчётов, где цепочка Supabase не нужна).
// «SC-Box-8GP-240-2G-UPS(A)» → «sc-box-8gp-240-2g-ups-a».
// Кириллические двойники транслитерируются (RL-BR350-LСS, SC-INT-G010-1-AХB).

const CYR_MAP: Record<string, string> = {
  С: 'C', Х: 'X', А: 'A', В: 'B', Е: 'E', К: 'K',
  М: 'M', Н: 'H', О: 'O', Р: 'P', Т: 'T', У: 'Y',
}

export function normalizeSku(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[СХАВЕКМНОРТУ]/g, (ch) => CYR_MAP[ch] || ch)
    .replace(/\s+/g, '')
    .replace('(А)', '(A)')
    .replace(/\(([A-ZА-Я])\)$/, '-$1')
    .replace(/[^0-9A-Z-]/g, '')
    .toLowerCase()
}
