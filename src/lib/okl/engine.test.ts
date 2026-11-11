/**
 * Юнит-тесты расчётного ядра «Калькулятора ОКЛ».
 * Контрольные примеры К1–К4 — Приложение Б ТЗ «Калькулятор ОКЛ»
 * (значения — строго из okl-matrix.json, сгенерированного из инструкции ПТК).
 *
 * Запуск: bun test src/lib/okl/engine.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  OKL_MATRIX,
  OKL_NORMS,
  buildSpec,
  checkAmpacity,
  checkThermal,
  checkVoltageDrop,
  decodeState,
  encodeState,
  matchSolutions,
  specHasQuery,
  specTotal,
  suggestAlternatives,
  type OklLine,
} from './engine'

const products = JSON.parse(
  require('fs').readFileSync(new URL('../../../src/data/products.json', import.meta.url), 'utf-8'),
) as { id: string; sku: string; title: string; price: number | null; priceUnit?: string; subcategory: string }[]

let seq = 0
function line(partial: Partial<OklLine>): OklLine {
  seq += 1
  return {
    id: `L${seq}`,
    name: `Линия ${seq}`,
    surfaceId: 'concrete',
    catId: 'signal',
    mark: 'КПСнг(А)-FRLS',
    cert: 'N00466',
    crossSection: '',
    cores: '1–4 пары; 2–8 жил',
    cableCount: 1,
    diameterMm: 6,
    lengthM: 100,
    fireTimeMin: 60,
    loadMode: 'power',
    loadW: 0,
    loadA: 0,
    phases: 1,
    voltage: 230,
    cosPhi: 1,
    ikzKA: 0,
    tripTimeS: 0.1,
    reservePct: 10,
    ...partial,
  }
}

describe('Данные матрицы', () => {
  test('матрица содержит реальные системы PTK-Line и 441 строку', () => {
    expect(OKL_MATRIX.matrix.length).toBeGreaterThan(400)
    expect(OKL_MATRIX.systems['ОП']).toBeDefined()
    expect(OKL_MATRIX.systems['ЛМПО']).toBeDefined()
    expect(OKL_MATRIX.systems['ТСП-ТС ВГП']).toBeDefined()
  })

  test('реквизиты сертификатов соответствуют сканам ptcab.ru', () => {
    expect(OKL_MATRIX.certificates['N00466'].reg).toBe('ССБК RU.ПБ10.Н00466')
    expect(OKL_MATRIX.certificates['N00466'].validTo).toBe('16.12.2026')
    expect(OKL_MATRIX.certificates['N00476'].reg).toBe('ССБК RU.ПБ10.Н00476')
    expect(OKL_MATRIX.certificates['N00476'].validTo).toBe('29.09.2027')
  })
})

describe('К1. Сигнальная линия СПС: КПСнг(А)-FRLS, открыто по бетону, ≥ 60 мин', () => {
  const l = line({ catId: 'signal', mark: 'КПСнг(А)-FRLS', cert: 'N00466', fireTimeMin: 60 })
  const solutions = matchSolutions(l)
  const op = solutions.find((s) => s.system === 'ОП')

  test('вариант PTK-Line-ОП с фактическим временем 60 мин (Е60)', () => {
    expect(op).toBeDefined()
    expect(op!.minutes).toBe(60)
    expect(op!.limit).toBe('Е60')
    expect(op!.cert).toBe('N00466')
  })

  test('спецификация: держатель ДМОУ, коробка огнестойкая, крепёж по нормам расхода', () => {
    const sol = op!
    const spec = buildSpec([l], { [l.id]: sol }, products)
    const skus = spec.map((s) => s.sku)
    expect(skus).toContain('840-001') // ДМОУ-1К (шаг ≤ 500 мм → ceil(100/0.5)+1 = 201)
    expect(skus.some((s) => s.startsWith('072-') || s.startsWith('070-'))).toBeTrue() // коробка КМОП/КМОМ
    expect(skus).toContain('860-002') // саморез на точку крепления
    expect(skus).toContain('862-001') // анкер-клин
    const dmou = spec.find((s) => s.sku === '840-001')!
    expect(dmou.qty).toBeCloseTo(201 * 1.1, 1) // точки × запас 10 %
  })
})

describe('К2. Силовая линия аварийного освещения: ВВГнг(А)-FRLS 3×1,5, гофротруба по гипсокартону, ≥ 90 мин', () => {
  const l = line({
    catId: 'power',
    mark: 'ВВГнг(А)-FRLS',
    cert: 'N00466',
    crossSection: '1.5',
    fireTimeMin: 90,
    surfaceId: 'plasterboard',
    diameterMm: 10,
    lengthM: 45,
    loadMode: 'power',
    loadW: 500,
    phases: 1,
    voltage: 230,
    cosPhi: 1,
  })
  const solutions = matchSolutions(l)

  test('ТГТ СЗ (60 мин) отфильтрован, ТГ FRHF присутствует с Е90', () => {
    expect(solutions.find((s) => s.system === 'ТГТ СЗ')).toBeUndefined()
    const frhf = solutions.find((s) => s.system === 'ТГ FRHF')
    expect(frhf).toBeDefined()
    expect(frhf!.minutes).toBe(90)
    expect(frhf!.knsPick.size && 'd' in frhf!.knsPick.size).toBeTrue()
  })

  test('проверка ΔU для L=45 м, P=500 Вт, 230 В — ≈ 1,03 %, статус ok', () => {
    const du = checkVoltageDrop(l)
    expect(du.status).toBe('ok')
    const duPct = parseFloat(du.value)
    expect(duPct).toBeGreaterThan(0.9)
    expect(duPct).toBeLessThan(1.2)
    expect(Math.abs(duPct - 1.03)).toBeLessThan(0.15) // допустимое отклонение ≤ 1 %
  })

  test('проверка тока: 500 Вт / 230 В ≈ 2,2 А ≤ 21 А (1,5 мм²)', () => {
    const amp = checkAmpacity(l)
    expect(amp.status).toBe('ok')
    expect(amp.value).toContain('2.2')
  })
})

describe('К3. Лоток: 6 кабелей d≈11 мм, L=30 м по металлоконструкции', () => {
  const l = line({
    catId: 'signal',
    mark: 'КПСнг(А)-FRLS',
    cert: 'N00466',
    surfaceId: 'metal',
    fireTimeMin: 60,
    cableCount: 6,
    diameterMm: 11,
    lengthM: 30,
  })
  const solutions = matchSolutions(l)
  const lmpo = solutions.find((s) => s.system === 'ЛМПО')!

  test('ЛМПО подбирается; требуемая ширина ≈ 41 мм → типоразмер 50×50', () => {
    expect(lmpo).toBeDefined()
    const size = lmpo.knsPick.size as { w: number; h: number; sku: string }
    expect(size.w).toBe(50)
    expect(size.sku).toBe('531-020')
    expect(lmpo.knsPick.fillPct).toBeLessThan(40)
  })

  test('число стоек/метизов по нормам: ceil(30/1,5)+1 = 21 с запасом 10 %', () => {
    const spec = buildSpec([l], { [l.id]: lmpo }, products)
    const st = spec.find((s) => s.sku === '576-001')!
    expect(st.qty).toBeCloseTo(21 * 1.1, 1)
    const ank = spec.find((s) => s.sku === '862-001')!
    expect(ank.qty).toBeCloseTo(21 * 1.1, 1)
  })

  test('смета формируется с ценами каталога SpaceCam', () => {
    const spec = buildSpec([l], { [l.id]: lmpo }, products)
    expect(spec.length).toBeGreaterThan(4)
    expect(specTotal(spec)).toBeGreaterThan(0)
    expect(specHasQuery(spec)).toBeFalse() // все артикулы К3 имеют цены
  })

  test('артикул без цены в каталоге → «Цена по запросу», товар вне каталога → позиция-заглушка', () => {
    const spec = buildSpec([l], { [l.id]: lmpo }, [])
    expect(spec.length).toBeGreaterThan(0)
    expect(specHasQuery(spec)).toBeTrue()
    const missing = spec.find((s) => s.sku === '531-020')!
    expect(missing.price).toBeNull()
    expect(missing.label).toContain('531-020')
  })
})

describe('К4. Отрицательный: ParLan U/UTP (N00466) при Е180 — решений нет', () => {
  const l = line({
    catId: 'pair',
    mark: 'ParLan U/UTP Cat5e PVCLS нг(A)-FRLS',
    cert: 'N00466',
    surfaceId: 'concrete',
    fireTimeMin: 180,
  })

  test('matchSolutions пуст; альтернативы подсказывают доступное время', () => {
    expect(matchSolutions(l)).toHaveLength(0)
    const alt = suggestAlternatives(l)
    expect(alt.length).toBeGreaterThan(0)
    expect(alt[0].timeMin).toBe(15)
  })
})

describe('Инженерные проверки', () => {
  test('пучок 3 кабелей снижает Iдоп ×0,8 (табл. C.52.15)', () => {
    const one = checkAmpacity(line({ catId: 'power', mark: 'ВВГнг(А)-FRLS', cert: 'N00466', crossSection: '2.5', loadA: 25, loadMode: 'current', cableCount: 1, cores: '3 жилы' }))
    const bundle = checkAmpacity(line({ catId: 'power', mark: 'ВВГнг(А)-FRLS', cert: 'N00466', crossSection: '2.5', loadA: 25, loadMode: 'current', cableCount: 3, cores: '3 жилы' }))
    expect(one.status).toBe('ok')
    expect(bundle.status).toBe('fail')
    expect(bundle.recommendation).toContain('сечение')
  })

  test('термическая стойкость: Smin = Iкз·√t/k (k=115)', () => {
    const t = checkThermal({ ...line({ catId: 'power', mark: 'ВВГнг(А)-FRLS', cert: 'N00466', crossSection: '2.5' }), ikzKA: 6, tripTimeS: 0.25 })
    // Smin = 6000·0,5/115 ≈ 26,1 мм² → 2,5 мм² — fail
    expect(t.status).toBe('fail')
    expect(t.value).toContain('26.1')
  })
})

describe('Deep-link состояния (FR-24)', () => {
  test('encode/decode сохраняет линии и выбор системы', () => {
    const l1 = line({ catId: 'power', mark: 'ВВГнг(А)-FRLS', cert: 'N00466', crossSection: '1.5' })
    const state = { v: 1 as const, lines: [l1], selected: { [l1.id]: 'ТГ FRHF' } }
    const enc = encodeState(state)
    expect(enc).not.toContain('{')
    const dec = decodeState(enc)
    expect(dec).not.toBeNull()
    expect(dec!.lines[0].mark).toBe('ВВГнг(А)-FRLS')
    expect(dec!.selected[l1.id]).toBe('ТГ FRHF')
  })

  test('битое состояние → null (мягкий сброс)', () => {
    expect(decodeState('!!!-not-base64-!!!')).toBeNull()
    expect(decodeState(encodeState({ v: 9 as never, lines: [], selected: {} }))).toBeNull()
  })
})

describe('Нормативная база (FR-16, FR-28)', () => {
  test('все значения норм имеют источники', () => {
    expect(OKL_NORMS.ampacity.source).toContain('ГОСТ 31996-2012')
    expect(OKL_NORMS.fill.pipeSource).toContain('СП 134.13330.2012')
    expect(OKL_NORMS.fastening.dmouStepSource).toContain('Инструкция')
    expect(OKL_NORMS.checks.thermalKSource).toContain('ГОСТ Р 50571.4.43-2011')
    expect(OKL_NORMS.normativeBase.length).toBeGreaterThanOrEqual(10)
  })
})
