/**
 * Ядро «Калькулятора ОКЛ» — чистые функции без React-зависимостей
 * (ТЗ «Калькулятор ОКЛ», п. 6.3: типизированные структуры, детерминированность).
 *
 * Все нормативные числа берутся из src/data/okl-norms.json и
 * src/data/okl-matrix.json (FR-16: жёстко зашитые числа в коде запрещены).
 */

import matrixJson from '@/data/okl-matrix.json'
import normsJson from '@/data/okl-norms.json'

// ─────────────────────────────────────────────────────────────────────────────
// Типы данных (формы okl-matrix.json / okl-norms.json)
// ─────────────────────────────────────────────────────────────────────────────

export type Certificate = {
  reg: string
  holder: string
  std: string
  validFrom: string
  validTo: string
  url: string
  tu: string
  instruction: string
  source: string
}

export type Surface = { id: string; title: string; group: string; note?: string }

export type CableCategory = { title: string; summary: string; section: string }

export type Producer = {
  producer: string
  url?: string
  tu: string
  gauge: string
  marks: string[]
  armored?: boolean
  note?: string
}

export type SystemInfo = { title: string; knsType: string; group: string }

export type MatrixRow = {
  cert: string
  cat: string
  group: string
  system: string
  minutes: number
  note?: string | null
}

export type KnsSize =
  | { sku: string; title: string; d: number; unit: string; price: number }
  | { sku: string; title: string; w: number; h: number; unit: string; price: number }

export type SpecProfile = {
  kns: KnsSize[]
  knsKind: string | null
  holders: Record<string, string> | 'clip' | 'console' | 'rope' | null
  boxKind: string
  extra: { role: string; sku?: string; pick?: string; skuRe?: string }[]
}

export type OklMatrix = {
  version: string
  generated: string
  source: { title: string; url: string; certificates: string[] }
  certificates: Record<string, Certificate>
  methodGroups: Record<string, string>
  surfaces: Surface[]
  cableCategories: Record<string, CableCategory>
  systems: Record<string, SystemInfo>
  catalog: Record<string, Record<string, Producer[]>>
  matrix: MatrixRow[]
  specProfiles: Record<string, SpecProfile>
  boxes: Record<string, { cap: number; sku?: string; plastic?: string; metal?: string }[]>
  clips: { d: number; sku: string; price: number }[]
  hoseMuffs: { d: number; sku: string; price: number }[]
  ropes: { d: number; sku: string; unit: string; price: number; title: string }[]
}

export type OklNorms = {
  version: string
  generated: string
  normativeBase: { doc: string; about: string }[]
  ampacity: {
    title: string
    table: Record<string, number>
    fourFiveCoreFactor: number
    tempFactors: Record<string, number>
    source: string
    tempFactorsSource: string
  }
  resistance: {
    title: string
    table: Record<string, number>
    source: string
    x0: number
    x0Source: string
  }
  fill: {
    boxClosedPct: number
    boxClosedSource: string
    boxLiddedPct: number
    boxLiddedSource: string
    pipePct: number
    pipeSource: string
    trayPct: number
    traySource: string
    pipeSingleMinD: number
    pipeSingleMinDSource: string
  }
  fastening: {
    dmouStepM: number
    dmouStepSource: string
    clipStepM: number
    clipStepSource: string
    trayStepM: number
    trayStepSource: string
    mandatoryNearM: number
    mandatoryNearSource: string
    traySectionM: number
    traySectionSource: string
    ropeClampsPerEnd: number
    ropeClampsPerEndSource: string
    reservePct: number
    reserveSource: string
  }
  checks: {
    deltaULimitPct: number
    deltaUSource: string
    thermalK: number
    thermalKSource: string
    currentWarningNote: string
  }
  disclaimer: string
}

export const OKL_MATRIX = matrixJson as unknown as OklMatrix
export const OKL_NORMS = normsJson as unknown as OklNorms

// ─────────────────────────────────────────────────────────────────────────────
// Ввод расчёта (одна линия)
// ─────────────────────────────────────────────────────────────────────────────

export type OklLine = {
  id: string
  name: string
  surfaceId: string // из OKL_MATRIX.surfaces
  catId: string // signal | interface | pair | power | control | optical
  mark: string // марка кабеля из catalog[cert][cat]
  cert: string // N00466 | N00476 (определяется маркой)
  crossSection: string // мм² для силовых/контрольных
  cores: string // текст: жилы/пары (справочно, из gauge)
  cableCount: number // кабелей в линии (пучке)
  diameterMm: number // наружный диаметр одного кабеля, мм (0 = неизвестен)
  lengthM: number
  fireTimeMin: number // требуемое время (30/60/90/120/180)
  // электрические нагрузки (FR-7)
  loadMode: 'power' | 'current'
  loadW: number
  loadA: number
  phases: 1 | 3
  voltage: number // 230/400
  cosPhi: number
  // эксперт (FR-15)
  ikzKA: number // ток КЗ, кА (0 = не задано)
  tripTimeS: number // время срабатывания защиты, с
  reservePct: number // запас крепежа
}

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'na'

export type Check = {
  id: 'ampacity' | 'voltage' | 'fill' | 'thermal'
  title: string
  status: CheckStatus
  value: string
  detail: string
  source: string
  recommendation?: string
}

export type SpecItem = {
  group: 'КНС и кабеленесущие системы' | 'Коробки монтажные огнестойкие' | 'Крепёж и держатели' | 'Метизы'
  sku: string
  label: string
  qty: number
  unit: string
  price: number | null // null → «Цена по запросу»
  note?: string
}

export type MatchedSolution = {
  system: string
  systemTitle: string
  minutes: number
  limit: string
  cert: string
  note?: string
  producer?: string
  tu?: string
  knsPick: {
    size?: KnsSize
    fillPct?: number
    fillStatus?: CheckStatus
    fillNote?: string
  }
}

export const FIRE_TIME_OPTIONS = [30, 60, 90, 120, 180]

// ─────────────────────────────────────────────────────────────────────────────
// Подбор решений (FR-9, FR-10)
// ─────────────────────────────────────────────────────────────────────────────

export function surfaceGroup(surfaceId: string): string | null {
  const s = OKL_MATRIX.surfaces.find((x) => x.id === surfaceId)
  return s ? s.group : null
}

/** Все марки категории (с производителем/ТУ) для селектора. */
export function markOptions(catId: string): { mark: string; producer: string; tu: string; cert: string }[] {
  const out: { mark: string; producer: string; tu: string; cert: string }[] = []
  for (const [cert, cats] of Object.entries(OKL_MATRIX.catalog)) {
    for (const p of cats?.[catId] ?? []) {
      for (const m of p.marks) {
        out.push({ mark: m, producer: p.producer, tu: p.tu, cert })
      }
    }
  }
  return out.sort((a, b) => a.mark.localeCompare(b.mark, 'ru'))
}

export function findProducer(cert: string, catId: string, mark: string): Producer | null {
  return OKL_MATRIX.catalog?.[cert]?.[catId]?.find((p) => p.marks.includes(mark)) ?? null
}

/**
 * Подбор составов ОКЛ: (способ прокладки × категория × марка × время Е).
 * Каждый вариант — система PTK-Line с фактическим временем и КНС-типоразмером.
 */
export function matchSolutions(line: OklLine): MatchedSolution[] {
  const group = surfaceGroup(line.surfaceId)
  if (!group) return []
  const prod = findProducer(line.cert, line.catId, line.mark)
  const rows = OKL_MATRIX.matrix.filter(
    (r) => r.cert === line.cert && r.cat === line.catId && r.group === group && r.minutes >= line.fireTimeMin,
  )
  const profileOf = (sys: string): SpecProfile | undefined => {
    const direct = OKL_MATRIX.specProfiles[sys]
    if (direct) return direct
    // тросовые варианты труб/рукава наследуют КНС наземных систем
    if (sys.startsWith('ТСП-')) return OKL_MATRIX.specProfiles[sys.replace('ТСП-', '')]
    return undefined
  }
  const solutions: MatchedSolution[] = rows.map((r) => {
    const profile = profileOf(r.system)
    const sysInfo = OKL_MATRIX.systems[r.system]
    const knsPick = profile
      ? pickKnsSize(profile, line)
      : { fillNote: 'КНС не применяется — открытая прокладка на держателях ДМОУ' }
    return {
      system: r.system,
      systemTitle: sysInfo?.title ?? r.system,
      minutes: r.minutes,
      limit: `Е${r.minutes}`,
      cert: r.cert,
      note: r.note ?? undefined,
      producer: prod?.producer,
      tu: prod?.tu,
      knsPick,
    }
  })
  // сортировка: сначала системы с большим запасом времени, потом по алфавиту
  return solutions.sort((a, b) => b.minutes - a.minutes || a.system.localeCompare(b.system, 'ru'))
}

/** FR-10: ближайшие допустимые варианты, когда под условие ничего не нашлось. */
export function suggestAlternatives(line: OklLine): { timeMin: number; count: number }[] {
  const group = surfaceGroup(line.surfaceId)
  if (!group) return []
  const rows = OKL_MATRIX.matrix.filter((r) => r.cert === line.cert && r.cat === line.catId && r.group === group)
  const byTime = new Map<number, number>()
  for (const r of rows) byTime.set(r.minutes, (byTime.get(r.minutes) ?? 0) + 1)
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timeMin, count]) => ({ timeMin, count }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Подбор КНС и заполнение (FR-14)
// ─────────────────────────────────────────────────────────────────────────────

function area(d: number): number {
  return (Math.PI / 4) * d * d
}

export function pickKnsSize(profile: SpecProfile, line: OklLine): MatchedSolution['knsPick'] {
  if (!profile.knsKind || !profile.kns.length) {
    return { fillNote: 'КНС не применяется — открытая прокладка на держателях ДМОУ' }
  }
  const n = Math.max(1, line.cableCount)
  const d = line.diameterMm
  const kind = profile.knsKind

  if (kind === 'tray' || kind === 'wire_tray' || kind === 'ladder_tray' || kind === 'cc' || kind === 'cc_metal') {
    // Лотки и кабель-каналы: подбор по ширине (1–2 ряда кабелей), проверка заполнения по площади
    if (!d) return { fillNote: 'Укажите наружный диаметр кабеля — подбор типоразмера недоступен' }
    const rows = n <= 3 ? 1 : 2
    const widthReq = (n * d * 1.25) / rows // 25 % — монтажный запас
    const sizes = profile.kns as Extract<KnsSize, { w: number }>[]
    const sorted = [...sizes].sort((a, b) => a.w - b.w || a.h - b.h)
    const chosen = sorted.find((s) => s.w >= widthReq)
    if (!chosen) {
      return {
        fillNote: `Требуемая ширина КНС ≈ ${Math.ceil(widthReq)} мм — больше максимального типоразмера каталога; требуется разделение линий`,
        fillStatus: 'fail',
      }
    }
    const fillPct = (n * area(d) / (chosen.w * chosen.h)) * 100
    const status: CheckStatus =
      fillPct <= OKL_NORMS.fill.trayPct ? 'ok' : fillPct <= OKL_NORMS.fill.trayPct + 10 ? 'warn' : 'fail'
    return {
      size: chosen,
      fillPct: Math.round(fillPct * 10) / 10,
      fillStatus: status,
      fillNote: `Заполнение ${fillPct.toFixed(1)} % при пороге ${OKL_NORMS.fill.trayPct} %`,
    }
  }

  // Трубы/рукава: заполнение по площади ≤ 60 % (СП 134.13330.2012), одиночный D ≥ 1,5·d
  if (!d) return { fillNote: 'Укажите наружный диаметр кабеля — подбор диаметра трубы недоступен' }
  const diamReq =
    n === 1 ? d * OKL_NORMS.fill.pipeSingleMinD : d * Math.sqrt(n / (OKL_NORMS.fill.pipePct / 100))
  const sizes = profile.kns as Extract<KnsSize, { d: number }>[]
  const sorted = [...sizes].sort((a, b) => a.d - b.d)
  const chosen = sorted.find((s) => s.d >= diamReq)
  if (!chosen) {
    return {
      fillNote: `Требуемый диаметр КНС ≈ ${Math.ceil(diamReq)} мм — больше максимального типоразмера каталога`,
      fillStatus: 'fail',
    }
  }
  const fillPct = (n * area(d) / area(chosen.d)) * 100
  const status: CheckStatus =
    fillPct <= OKL_NORMS.fill.pipePct ? 'ok' : fillPct <= OKL_NORMS.fill.pipePct + 10 ? 'warn' : 'fail'
  return {
    size: chosen,
    fillPct: Math.round(fillPct * 10) / 10,
    fillStatus: status,
    fillNote: `Заполнение ${fillPct.toFixed(1)} % при пороге ${OKL_NORMS.fill.pipePct} %`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Инженерные проверки (FR-12…FR-15)
// ─────────────────────────────────────────────────────────────────────────────

function bundleFactor(n: number): { factor: number; source: string } {
  // Табл. C.52.15 ГОСТ Р 50571.5.52-2011 (МЭК 60364-5-52): пучки многожильных
  // кабелей в воздухе: 1 → 1,00; 2–4 → 0,80; 5–9 → 0,70; 10–20 → 0,60; > 20 → 0,50
  const f = n <= 1 ? 1 : n <= 4 ? 0.8 : n <= 9 ? 0.7 : n <= 20 ? 0.6 : 0.5
  return { factor: f, source: 'Табл. C.52.15 ГОСТ Р 50571.5.52-2011 (МЭК 60364-5-52): пучки в воздухе' }
}

export function calcCurrent(line: OklLine): number | null {
  if (line.loadMode === 'current') return line.loadA > 0 ? line.loadA : null
  const p = line.loadW
  if (!p) return null
  const cos = line.cosPhi || 1
  if (line.phases === 3) return p / (Math.sqrt(3) * line.voltage * cos)
  return p / (line.voltage * cos)
}

export function checkAmpacity(line: OklLine, ambientTempC = 25): Check {
  const isPower = line.catId === 'power' || line.catId === 'control'
  if (!isPower) {
    return {
      id: 'ampacity',
      title: 'Длительно допустимый ток',
      status: 'na',
      value: '—',
      detail: OKL_NORMS.checks.currentWarningNote,
      source: OKL_NORMS.ampacity.source,
    }
  }
  const secKey = line.crossSection
  const base = OKL_NORMS.ampacity.table[secKey]
  const i = calcCurrent(line)
  if (!base || i === null) {
    return {
      id: 'ampacity',
      title: 'Длительно допустимый ток',
      status: 'na',
      value: '—',
      detail: 'Укажите сечение жилы и нагрузку (мощность или ток) для проверки',
      source: OKL_NORMS.ampacity.source,
    }
  }
  const tfRaw = OKL_NORMS.ampacity.tempFactors[String(ambientTempC)] ?? 1
  const bf = bundleFactor(line.cableCount)
  const allowed = base * tfRaw * bf.factor
  const pct = (i / allowed) * 100
  const status: CheckStatus = pct <= 100 ? 'ok' : pct <= 110 ? 'warn' : 'fail'
  const bigger = Object.keys(OKL_NORMS.ampacity.table)
    .map(Number)
    .sort((a, b) => a - b)
    .find((s) => OKL_NORMS.ampacity.table[String(s)] * tfRaw * bf.factor >= i)
  return {
    id: 'ampacity',
    title: 'Длительно допустимый ток',
    status,
    value: `${i.toFixed(1)} А из ${allowed.toFixed(1)} А (${pct.toFixed(0)} %)`,
    detail: `Iдоп ${base} А (${secKey} мм², воздух 25 °C) × темп. ${tfRaw} × пучок ${bf.factor}`,
    source: `${OKL_NORMS.ampacity.source}; ${OKL_NORMS.ampacity.tempFactorsSource}; ${bf.source}`,
    recommendation:
      status === 'ok'
        ? undefined
        : bigger && bigger > Number(secKey)
          ? `Рекомендуется сечение ${bigger} мм²`
          : 'Требуется разделение нагрузки по нескольким линиям',
  }
}

export function checkVoltageDrop(line: OklLine): Check {
  const isPower = line.catId === 'power' || line.catId === 'control'
  const r0 = OKL_NORMS.resistance.table[line.crossSection]
  const i = calcCurrent(line)
  if (!isPower || !r0 || i === null || !line.lengthM) {
    return {
      id: 'voltage',
      title: 'Потеря напряжения',
      status: 'na',
      value: '—',
      detail: 'Проверка выполняется для силовых линий с заданной длиной, сечением и нагрузкой',
      source: OKL_NORMS.checks.deltaUSource,
    }
  }
  const cos = line.cosPhi || 1
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos))
  const r0km = r0 // Ом/км
  const x0km = OKL_NORMS.resistance.x0
  const lkm = line.lengthM / 1000
  const duV =
    line.phases === 3
      ? Math.sqrt(3) * i * lkm * (r0km * cos + x0km * sin)
      : 2 * i * lkm * (r0km * cos + x0km * sin)
  const duPct = (duV / line.voltage) * 100
  const limit = OKL_NORMS.checks.deltaULimitPct
  const status: CheckStatus = duPct <= limit ? 'ok' : duPct <= limit * 1.5 ? 'warn' : 'fail'
  const bigger = Object.keys(OKL_NORMS.resistance.table)
    .map(Number)
    .sort((a, b) => a - b)
    .find((s) => {
      const rr = OKL_NORMS.resistance.table[String(s)]
      const du = (line.phases === 3 ? Math.sqrt(3) : 2) * i * lkm * (rr * cos + x0km * sin)
      return (du / line.voltage) * 100 <= limit
    })
  return {
    id: 'voltage',
    title: 'Потеря напряжения',
    status,
    value: `${duPct.toFixed(2)} % (порог ${limit} %)`,
    detail: `ΔU = ${duV.toFixed(1)} В на линии ${line.lengthM} м; R₀ = ${r0} Ом/км, X₀ = ${x0km} Ом/км`,
    source: `${OKL_NORMS.resistance.source}; ${OKL_NORMS.resistance.x0Source}; ${OKL_NORMS.checks.deltaUSource}`,
    recommendation:
      status === 'ok'
        ? undefined
        : bigger && bigger > Number(line.crossSection)
          ? `Рекомендуется сечение ${bigger} мм² (ΔU ≈ ${(((line.phases === 3 ? Math.sqrt(3) : 2) * i * lkm * (OKL_NORMS.resistance.table[String(bigger)] * cos + x0km * sin)) / line.voltage) * 100} %)`
          : 'Сократить длину линии или поднять напряжение',
  }
}

export function checkThermal(line: OklLine): Check {
  if (!line.ikzKA || !line.crossSection) {
    return {
      id: 'thermal',
      title: 'Термическая стойкость при КЗ',
      status: 'na',
      value: '—',
      detail: 'Укажите ток КЗ и время срабатывания защиты (блок «Эксперт»)',
      source: OKL_NORMS.checks.thermalKSource,
    }
  }
  const s = Number(line.crossSection)
  const sMin = (line.ikzKA * 1000 * Math.sqrt(Math.max(line.tripTimeS, 0.01))) / OKL_NORMS.checks.thermalK
  const status: CheckStatus = s >= sMin ? 'ok' : s >= sMin * 0.8 ? 'warn' : 'fail'
  return {
    id: 'thermal',
    title: 'Термическая стойкость при КЗ',
    status,
    value: `Smin = ${sMin.toFixed(1)} мм² при ${line.crossSection} мм²`,
    detail: `Smin ≥ Iкз·√t / k = ${line.ikzKA} кА · √${line.tripTimeS} с / ${OKL_NORMS.checks.thermalK}`,
    source: OKL_NORMS.checks.thermalKSource,
    recommendation: status === 'ok' ? undefined : 'Увеличить сечение или уменьшить время срабатывания защиты',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Спецификация и смета (FR-17…FR-19)
// ─────────────────────────────────────────────────────────────────────────────

type ProductLite = {
  id: string
  sku: string
  title: string
  price: number | null
  priceUnit?: string
  subcategory: string
}

/**
 * Спецификация по всем линиям (агрегированная). Каждая позиция ссылается
 * на карточку товара каталога SpaceCam; отсутствие цены → «Цена по запросу».
 */
export function buildSpec(
  lines: OklLine[],
  solutionsByLine: Record<string, MatchedSolution | undefined>,
  products: ProductLite[],
): SpecItem[] {
  const store = new Map(products.map((p) => [p.id, p]))
  const items: SpecItem[] = []
  const add = (group: SpecItem['group'], sku: string | undefined, qty: number, note?: string) => {
    if (!sku || qty <= 0) return
    const item = store.get(sku)
    items.push({
      group,
      sku,
      label: item?.title ?? `Артикул ${sku}`,
      qty: Math.round(qty * 100) / 100,
      unit: item?.priceUnit ?? 'шт',
      price: item?.price ?? null,
      note,
    })
  }

  for (const line of lines) {
    const sol = solutionsByLine[line.id]
    if (!sol) continue
    const profile =
      OKL_MATRIX.specProfiles[sol.system] ?? OKL_MATRIX.specProfiles[sol.system.replace('ТСП-', '')]
    if (!profile) continue
    const L = Math.max(line.lengthM, 0)
    const reserve = 1 + Math.max(0, line.reservePct) / 100

    // 1) КНС
    const size = sol.knsPick.size
    if (size) {
      if ('w' in size) {
        // лоток/канал: хлысты 3 м (unit «м» — метражом)
        const qty = size.unit === 'м' ? L * reserve : Math.ceil(L / OKL_NORMS.fastening.traySectionM)
        add('КНС и кабеленесущие системы', size.sku, qty, `${sol.system}: ${size.w}×${size.h} мм`)
        // заглушки торцевые по ширине (2 шт на трассу)
        const plug =
          profile.knsKind === 'tray'
            ? size.w <= 50
              ? '569-001'
              : size.w <= 100
                ? '569-002'
                : size.w <= 150
                  ? '569-003'
                  : undefined
            : profile.knsKind === 'cc_metal'
              ? size.w <= 25
                ? '525-020'
                : '525-040'
              : undefined
        add('КНС и кабеленесущие системы', plug, 2 * reserve, 'заглушки торцевые (начало/конец трассы)')
      } else {
        add('КНС и кабеленесущие системы', size.sku, L * reserve, `${sol.system}: Ø${size.d} мм`)
      }
    }

    // 2) Держатели / крепёж по нормам расхода (FR-19)
    const holders = profile.holders
    if (holders === 'clip' && size && 'd' in size) {
      const points = Math.ceil(L / OKL_NORMS.fastening.clipStepM) + 1
      const clip = OKL_MATRIX.clips.find((c) => c.d >= size.d) ?? OKL_MATRIX.clips[OKL_MATRIX.clips.length - 1]
      add('Крепёж и держатели', clip?.sku, points * reserve, `клипса Ø${clip?.d} мм, шаг ≤ ${OKL_NORMS.fastening.clipStepM} м`)
    } else if (holders === 'console' && size && 'w' in size) {
      const points = Math.ceil(L / OKL_NORMS.fastening.trayStepM) + 1
      add('Крепёж и держатели', '576-001', points * reserve, 'стойка консольная, шаг ≤ 1,5 м')
      add('Метизы', '862-001', points * reserve, 'анкер-клин к стойке консольной')
      if (profile.knsKind === 'wire_tray') {
        add('Крепёж и держатели', '620-001', Math.ceil(L / OKL_NORMS.fastening.traySectionM) * reserve, 'прижим проволочного лотка на соединение')
      }
    } else if (holders === 'rope') {
      add('КНС и кабеленесущие системы', size && 'd' in size ? size.sku : '890-011', L * reserve, 'трос стальной по длине трассы')
      add('Крепёж и держатели', '890-511', OKL_NORMS.fastening.ropeClampsPerEnd * 2 * reserve, 'зажимы троса, по 2 на концевой коуш')
      add('Крепёж и держатели', '890-301', 2 * reserve, 'коуш концевой')
    } else if (typeof holders === 'object' && holders) {
      const key = line.cableCount <= 1 ? '1' : '2'
      const hsku = holders[key] ?? holders['1']
      const points = Math.ceil(L / OKL_NORMS.fastening.dmouStepM) + 1
      add('Крепёж и держатели', hsku, points * reserve, `ДМОУ, шаг крепления ≤ ${OKL_NORMS.fastening.dmouStepM} м`)
    }

    // 3) Вводные муфты для металлорукава
    for (const ex of profile.extra ?? []) {
      if (ex.pick === 'муфта' && size && 'd' in size) {
        const muff =
          OKL_MATRIX.hoseMuffs.find((m) => m.d >= size.d) ??
          OKL_MATRIX.hoseMuffs[OKL_MATRIX.hoseMuffs.length - 1]
        add('Крепёж и держатели', muff?.sku, 2 * reserve, ex.role)
      }
    }

    // 4) Метизы: крепление ДМОУ/клипс/каналов — саморез + дюбель на точку
    //    (для консолей крепёж учтён выше: анкер-клин к каждой стойке;
    //     ККМОМ — канал крепится к поверхности саморезами с шагом ≤ 500 мм)
    const mountPoints =
      holders === 'console'
        ? 0
        : holders === 'clip' || (typeof holders === 'object' && holders)
          ? Math.ceil(L / OKL_NORMS.fastening.dmouStepM) + 1
          : holders === null && profile.knsKind === 'cc_metal'
            ? Math.ceil(L / OKL_NORMS.fastening.dmouStepM) + 1
            : 0
    if (mountPoints > 0) {
      add('Метизы', '860-002', mountPoints * reserve, 'саморез 3,5×32 на точку крепления')
      add('Метизы', '862-001', mountPoints * reserve, 'анкер-клин 6×40 на точку крепления')
    }

    // 5) Коробка монтажная огнестойкая (1 на линию, подбор по числу вводов)
    const boxRules =
      OKL_MATRIX.boxes[profile.boxKind === 'auto' ? 'auto' : profile.boxKind] ?? OKL_MATRIX.boxes.auto
    let boxSku: string | undefined
    if (profile.boxKind === 'auto') {
      const rule = boxRules.find((r) => line.cableCount <= r.cap)
      boxSku = line.catId === 'power' || line.catId === 'control' ? rule?.metal : rule?.plastic
    } else {
      boxSku = boxRules.find((r) => line.cableCount <= r.cap)?.sku
    }
    add('Коробки монтажные огнестойкие', boxSku, 1, `${sol.system}: подбор по числу вводов (${line.cableCount})`)
  }

  // агрегация одинаковых артикулов
  const merged = new Map<string, SpecItem>()
  for (const it of items) {
    const prev = merged.get(it.sku)
    if (prev) {
      prev.qty = Math.round((prev.qty + it.qty) * 100) / 100
      prev.note = prev.note && prev.note !== it.note ? `${prev.note}; ${it.note}` : it.note
    } else {
      merged.set(it.sku, { ...it })
    }
  }
  return [...merged.values()]
}

export function specTotal(spec: SpecItem[]): number {
  return spec.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0)
}

export function specHasQuery(spec: SpecItem[]): boolean {
  return spec.some((i) => i.price === null)
}

// ─────────────────────────────────────────────────────────────────────────────
// Экспорт: deep-link (FR-24), CSV (FR-22), JSON (FR-22/FR-23)
// ─────────────────────────────────────────────────────────────────────────────

export type SavedState = {
  v: 1
  lines: OklLine[]
  selected: Record<string, string> // lineId -> system
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeState(state: SavedState): string {
  return b64urlEncode(JSON.stringify(state))
}

/** FR-24: распаковка состояния из ссылки; битое состояние → null (мягкий сброс). */
export function decodeState(raw: string): SavedState | null {
  try {
    const obj = JSON.parse(b64urlDecode(raw)) as SavedState
    if (!obj || obj.v !== 1 || !Array.isArray(obj.lines) || !obj.lines.length) return null
    const valid = obj.lines.every(
      (l) => typeof l.id === 'string' && typeof l.surfaceId === 'string' && typeof l.catId === 'string',
    )
    return valid ? obj : null
  } catch {
    return null
  }
}

export function deepLink(state: SavedState, baseHash = '#/solutions'): string {
  return `${baseHash}?calc=okl&s=${encodeState(state)}`
}

export function specToCsv(spec: SpecItem[], meta: string[]): string {
  const rows: string[] = []
  for (const m of meta) rows.push(m)
  rows.push('')
  rows.push(['Группа', 'Наименование', 'Артикул', 'Кол-во', 'Ед.', 'Цена, ₽', 'Сумма, ₽', 'Примечание'].join(';'))
  for (const it of spec) {
    const price = it.price === null ? 'Цена по запросу' : it.price.toFixed(2).replace('.', ',')
    const sum = it.price === null ? '' : (it.price * it.qty).toFixed(2).replace('.', ',')
    rows.push(
      [
        it.group,
        it.label,
        it.sku,
        String(it.qty).replace('.', ','),
        it.unit,
        price,
        sum,
        (it.note ?? '').replace(/;/g, ','),
      ].join(';'),
    )
  }
  return '\uFEFF' + rows.join('\r\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Проекты в localStorage (FR-25)
// ─────────────────────────────────────────────────────────────────────────────

export type OklProject = { name: string; date: string; state: SavedState }

const LS_KEY = 'spacecam-okl-projects'

export function listProjects(): OklProject[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as OklProject[]
  } catch {
    return []
  }
}

export function saveProject(project: OklProject): 'ok' | 'full' {
  try {
    const all = listProjects().filter((p) => p.name !== project.name)
    all.unshift(project)
    localStorage.setItem(LS_KEY, JSON.stringify(all))
    return 'ok'
  } catch {
    return 'full'
  }
}

export function deleteProject(name: string): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(listProjects().filter((p) => p.name !== name)))
  } catch {
    /* игнорируем */
  }
}
