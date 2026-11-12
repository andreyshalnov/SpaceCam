// Чистая логика отчёта «Проекты × оборудование» (без React и Supabase —
// используется вкладкой «Отчёт» раздела «Объекты строительства» и проверяется
// bun-скриптом scripts/check_objects_report.ts на живых данных).
//
// Постановка владельца (04.11.2026):
//   «В разделе регистрация проектов для админа — отчётность с группировкой по
//    статусу проекта и типу оборудования: суммы по артикулам, присутствующим
//    в проектах, и их количеству. Фильтры — период создания проекта (дата
//    внесения из 1С) и срок реализации (планируемый срок сдачи) — для
//    прогноза заказов на оборудование в заложенных проектах.»
//
// Принятые решения (уточнение владельца 04.11.2026):
//   • тип оборудования = 4 линейки каталога (узлы коммутации, коммутаторы,
//     домофония, замки R-Lock); нераспознанное — группа «Прочее»;
//   • дата создания = entry_date из 1С (для объектов из формы — дата карточки);
//   • срок реализации = objects.deadline («Планируемый срок сдачи»);
//   • дополнительно — сводка прогноза по кварталам срока сдачи.

import { normalizeSku } from './sku'

export interface CatalogEntry {
  sku: string // «красивый» артикул каталога (SC-Box-…(A))
  title: string
  section: string // nodes / switches / intercom / rlock
}

export interface ReportObject {
  id: string
  objectCode: string
  status: string
  createdIso: string // YYYY-MM-DD (entry_date из 1С, fallback — дата карточки)
  deadlineIso: string // YYYY-MM-DD или ''
}

export interface ReportItem {
  objectId: string
  name: string // номенклатура 1С («SpaceCam SC-Box-…(A)»)
  sku: string // колонка sku из БД (обычно пустая)
  qty: number
}

export interface ReportFilters {
  createdFrom: string // YYYY-MM-DD или ''
  createdTo: string
  deadlineFrom: string
  deadlineTo: string
}

/** Порядок групп «тип оборудования» в отчёте. */
export const REPORT_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'nodes', label: 'Узлы коммутации' },
  { id: 'switches', label: 'Коммутаторы' },
  { id: 'intercom', label: 'Домофония' },
  { id: 'rlock', label: 'Замки R-Lock' },
  { id: 'other', label: 'Прочее' },
]

export interface ReportRow {
  key: string
  sku: string // «красивый» артикул (или ВЕРХНИМ регистром токен из названия)
  title: string
  qty: number
  objects: number // в скольких проектах позиция встречается
}

export interface ReportSection {
  id: string
  label: string
  rows: ReportRow[]
  qty: number
}

export interface ReportStatus {
  status: string
  objects: number // проектов в этом статусе (в выборке фильтров)
  sections: ReportSection[]
  qty: number
}

export interface QuarterRow {
  key: string // 2027-Q1
  label: string // I кв. 2027
  range: string // 01.01.2027 – 31.03.2027
  objects: number // проектов со сдачей в квартале
  sections: Record<string, number> // section id → шт
  qty: number
}

export interface ReportResult {
  objectsTotal: number // всего объектов доступно
  objectsIn: number // попало под фильтры
  itemsTotal: number // позиций учтено
  qtyTotal: number // шт всего
  qtyOther: number // шт в группе «Прочее»
  statuses: ReportStatus[]
  quarters: QuarterRow[]
}

// Порядок статусов отчёта: воронка CRM → «Объект оснащен»; служебные — в конце
const STATUS_ORDER = ['Новый', 'В работе', 'Реализация', 'Объект оснащен', 'Заморожен', 'Отклонен']

/** Артикул-кандидаты из названия номенклатуры 1С: первые два токена. */
export function skuCandidates(name: string): string[] {
  const toks = String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
  const out: string[] = []
  for (const t of toks) {
    const n = normalizeSku(t)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

const inRange = (iso: string, from: string, to: string) =>
  (!from || iso >= from) && (!to || iso <= to)

/** Календарные границы квартала: 2027-Q1 → 01.01.2027 – 31.03.2027. */
export function quarterRange(year: string, qi: number): string {
  const y = Number(year)
  const mStart = qi * 3 + 1
  const mEnd = qi * 3 + 3
  const days = new Date(Date.UTC(y, mEnd, 0)).getUTCDate()
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(mStart)}.01.${y} – ${p2(mEnd)}.${p2(days)}.${y}`
}

const QUARTER_ROMAN = ['I', 'II', 'III', 'IV']

export function buildReport(
  objects: ReportObject[],
  items: ReportItem[],
  formItems: Array<{ objectId: string; name: string; qty: number }>,
  catalog: Map<string, CatalogEntry>,
  f: ReportFilters,
): ReportResult {
  const objs = objects.filter(
    (o) =>
      inRange(o.createdIso, f.createdFrom, f.createdTo) &&
      inRange(o.deadlineIso, f.deadlineFrom, f.deadlineTo),
  )
  const objIds = new Set(objs.map((o) => o.id))
  const statusById = new Map(objs.map((o) => [o.id, o.status]))
  const statusObjects = new Map<string, number>()
  for (const o of objs) statusObjects.set(o.status, (statusObjects.get(o.status) || 0) + 1)

  type Cell = { sku: string; title: string; qty: number; objSet: Set<string> }
  const cells = new Map<string, Cell>() // «статус|секция|ключ» → ячейка
  // сводка по кварталам срока сдачи: объекты и штуки по типам оборудования
  const quarterObjs = new Map<string, Set<string>>()
  const quarterSections = new Map<string, Record<string, number>>()
  const deadlineById = new Map(objs.map((o) => [o.id, o.deadlineIso]))

  const add = (objectId: string, name: string, dbSku: string, qty: number) => {
    if (!(qty > 0)) return
    const status = statusById.get(objectId)
    if (!status) return
    let key = ''
    let section = 'other'
    let skuDisplay = ''
    let title = ''
    const cands = dbSku ? [normalizeSku(dbSku), ...skuCandidates(name)] : skuCandidates(name)
    for (const c of cands) {
      const cat = catalog.get(c)
      if (cat) {
        key = c
        section = cat.section
        skuDisplay = cat.sku
        title = cat.title
        break
      }
    }
    if (!key) {
      // нераспознанная позиция — «Прочее», артикул = первый кодовый токен названия
      const raw = String(name || '').trim().split(/\s+/)
      const token = (raw[1] || raw[0] || 'позиция').toUpperCase()
      key = 'raw:' + token.toLowerCase()
      skuDisplay = token
      title = name
      section = 'other'
    }
    const ck = `${status}|${section}|${key}`
    const cell = cells.get(ck) || { sku: skuDisplay, title, qty: 0, objSet: new Set<string>() }
    cell.qty += qty
    cell.objSet.add(objectId)
    if (!cell.title && title) cell.title = title
    cells.set(ck, cell)

    // штуки по кварталу срока сдачи объекта
    const dl = deadlineById.get(objectId)
    if (dl) {
      const [y, m] = dl.split('-')
      if (y && m) {
        const qi = Math.floor((Number(m) - 1) / 3)
        const qk = `${y}-Q${qi + 1}`
        const secs = quarterSections.get(qk) || {}
        secs[section] = Math.round(((secs[section] || 0) + qty) * 100) / 100
        quarterSections.set(qk, secs)
      }
    }
  }

  let itemsTotal = 0
  for (const it of items) {
    if (!objIds.has(it.objectId)) continue
    add(it.objectId, it.name, it.sku, it.qty)
    itemsTotal++
  }
  for (const fi of formItems) {
    if (!objIds.has(fi.objectId)) continue
    add(fi.objectId, fi.name, '', fi.qty)
  }

  // статусы в порядке справочника, внутри — секции в порядке REPORT_SECTIONS
  const statusNames = [...statusObjects.keys()].sort(
    (a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
  )
  const statuses: ReportStatus[] = []
  let qtyTotal = 0
  let qtyOther = 0
  for (const st of statusNames) {
    const bySection = new Map<string, ReportSection>()
    for (const [ck, cell] of cells) {
      const [cellStatus, sectionId] = ck.split('|')
      if (cellStatus !== st) continue
      let sec = bySection.get(sectionId)
      if (!sec) {
        const meta = REPORT_SECTIONS.find((s) => s.id === sectionId)
        sec = { id: sectionId, label: meta ? meta.label : sectionId, rows: [], qty: 0 }
        bySection.set(sectionId, sec)
      }
      sec.rows.push({
        key: ck,
        sku: cell.sku,
        title: cell.title,
        qty: Math.round(cell.qty * 100) / 100,
        objects: cell.objSet.size,
      })
      sec.qty += cell.qty
    }
    const sections = [...bySection.values()]
      .map((s) => ({ ...s, qty: Math.round(s.qty * 100) / 100, rows: s.rows.sort((a, b) => b.qty - a.qty || a.sku.localeCompare(b.sku)) }))
      .sort((a, b) => {
        const ia = REPORT_SECTIONS.findIndex((s) => s.id === a.id)
        const ib = REPORT_SECTIONS.findIndex((s) => s.id === b.id)
        return ia - ib
      })
    const stQty = Math.round(sections.reduce((s, x) => s + x.qty, 0) * 100) / 100
    qtyTotal += stQty
    const otherSec = sections.find((s) => s.id === 'other')
    if (otherSec) qtyOther += otherSec.qty
    statuses.push({ status: st, objects: statusObjects.get(st) || 0, sections, qty: stQty })
  }
  qtyTotal = Math.round(qtyTotal * 100) / 100
  qtyOther = Math.round(qtyOther * 100) / 100

  // сводка по кварталам срока сдачи (по объектам выборки)
  for (const o of objs) {
    if (!o.deadlineIso) continue
    const [y, m] = o.deadlineIso.split('-')
    if (!y || !m) continue
    const qi = Math.floor((Number(m) - 1) / 3)
    const qk = `${y}-Q${qi + 1}`
    let set = quarterObjs.get(qk)
    if (!set) {
      set = new Set<string>()
      quarterObjs.set(qk, set)
    }
    set.add(o.id)
  }
  const quarterLabel = (qk: string) => {
    const [y, q] = qk.split('-Q')
    return `${QUARTER_ROMAN[Number(q) - 1] || q} кв. ${y}`
  }
  const quarters: QuarterRow[] = [...quarterObjs.keys()]
    .sort()
    .map((qk) => {
      const [, q] = qk.split('-Q')
      const y = qk.slice(0, 4)
      const secs = quarterSections.get(qk) || {}
      return {
        key: qk,
        label: quarterLabel(qk),
        range: quarterRange(y, Number(q) - 1),
        objects: quarterObjs.get(qk)?.size || 0,
        sections: secs as Record<string, number>,
        qty: Math.round(Object.values(secs).reduce((s, x) => s + x, 0) * 100) / 100,
      }
    })

  return {
    objectsTotal: objects.length,
    objectsIn: objs.length,
    itemsTotal,
    qtyTotal,
    qtyOther,
    statuses,
    quarters,
  }
}
