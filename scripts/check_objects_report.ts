// Проверка отчёта «Проекты × оборудование» на живых данных Supabase.
// Запуск: SBP_TOKEN=sbp_... bun scripts/check_objects_report.ts
// Сверяет агрегацию buildReport (та же чистая логика, что на сайте) с
// независимым SQL-запросом через Management API (только чтение).

import { buildReport, type CatalogEntry, type ReportItem, type ReportObject } from '../src/lib/objects-report'
import { normalizeSku } from '../src/lib/sku'
import products from '../src/data/products.json'

const PROJECT = 'kgdrtrfwsyixprvuzdqj'
const TOKEN = process.env.SBP_TOKEN || ''
if (!TOKEN) {
  console.error('Нет SBP_TOKEN в окружении')
  process.exit(1)
}

async function sql(q: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const j = (await r.json()) as unknown
  if (!Array.isArray(j)) throw new Error('MAPI: ' + JSON.stringify(j).slice(0, 300))
  return j as Array<Record<string, unknown>>
}

async function main() {
  const objects = await sql(
    `select id, object_code, status, to_char(entry_date,'YYYY-MM-DD') entry,
            to_char(deadline,'YYYY-MM-DD') deadline, created_at::date::text created
     from objects`,
  )
  const specs = await sql(`select id, object_id from object_specs`)
  const itemsRaw = await sql(`select spec_id, name, coalesce(sku,'') sku, qty from object_spec_items`)

  const specToObj = new Map<string, string>()
  for (const s of specs) specToObj.set(String(s.id), String(s.object_id))
  const items: ReportItem[] = itemsRaw
    .map((r) => ({
      objectId: specToObj.get(String(r.spec_id)) || '',
      name: String(r.name ?? ''),
      sku: String(r.sku ?? ''),
      qty: Number(r.qty) || 0,
    }))
    .filter((r) => r.objectId)

  const catalog = new Map<string, CatalogEntry>()
  for (const p of products as unknown as Array<{ sku: string; title: string; section: string }>) {
    const n = normalizeSku(p.sku)
    if (n && !catalog.has(n)) catalog.set(n, { sku: p.sku, title: p.title, section: p.section })
  }

  const objs: ReportObject[] = objects.map((o) => ({
    id: String(o.id),
    objectCode: String(o.object_code ?? ''),
    status: String(o.status ?? ''),
    createdIso: String(o.entry || o.created || ''),
    deadlineIso: String(o.deadline || ''),
  }))

  const rep = buildReport(objs, items, [], catalog, {
    createdFrom: '',
    createdTo: '',
    deadlineFrom: '',
    deadlineTo: '',
  })

  // Независимая SQL-агрегация по статусам (числитель истины)
  const sqlAgg = await sql(
    `select o.status, sum(i.qty)::numeric(14,2)::float8 qty, count(*)::int pos
     from object_spec_items i
     join object_specs s on s.id = i.spec_id
     join objects o on o.id = s.object_id
     where i.qty > 0
     group by 1`,
  )

  console.log('— Проверка отчёта на живых данных —')
  console.log(`объектов: ${rep.objectsTotal}, под фильтрами: ${rep.objectsIn}`)
  console.log(`позиций учтено: ${rep.itemsTotal} (SQL позиций с qty>0: ${sqlAgg.reduce((s, r) => s + Number(r.pos), 0)})`)
  console.log(`итого шт: ${rep.qtyTotal} (SQL: ${Math.round(sqlAgg.reduce((s, r) => s + Number(r.qty), 0) * 100) / 100})`)
  console.log(`«Прочее» шт: ${rep.qtyOther}`)

  let fails = 0
  for (const sa of sqlAgg) {
    const st = rep.statuses.find((x) => x.status === sa.status)
    const mine = st ? st.qty : 0
    const theirs = Math.round(Number(sa.qty) * 100) / 100
    const ok = Math.abs(mine - theirs) < 0.01
    if (!ok) fails++
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${sa.status}: отчёт ${mine} шт / SQL ${theirs} шт, позиций ${st ? st.sections.reduce((s, x) => s + x.rows.length, 0) : 0}`)
  }
  if (rep.statuses.length !== sqlAgg.length) {
    console.log(`FAIL: статусов в отчёте ${rep.statuses.length}, в SQL ${sqlAgg.length}`)
    fails++
  }

  // Сумма по кварталам должна сходиться с итогом
  const qSum = Math.round(rep.quarters.reduce((s, q) => s + q.qty, 0) * 100) / 100
  console.log(`кварталов: ${rep.quarters.length}, сумма по кварталам: ${qSum} ${Math.abs(qSum - rep.qtyTotal) < 0.01 ? '= итогу OK' : '≠ итог FAIL'}`)
  if (Math.abs(qSum - rep.qtyTotal) >= 0.01) fails++

  // Фильтры: период создания (дата из 1С) и срок реализации — сверка с SQL
  const filterCases: Array<{ name: string; created: [string, string]; deadline: [string, string] }> = [
    { name: 'создан 2020 год', created: ['2020-01-01', '2020-12-31'], deadline: ['', ''] },
    { name: 'создан 2024-2026', created: ['2024-01-01', '2026-12-31'], deadline: ['', ''] },
    { name: 'сдача 2027-2028', created: ['', ''], deadline: ['2027-01-01', '2028-12-31'] },
    { name: 'создан 2025+ / сдача 2027+', created: ['2025-01-01', ''], deadline: ['2027-01-01', ''] },
  ]
  for (const fc of filterCases) {
    const sqlCnt = await sql(
      `select count(*)::int n from objects
       where to_char(entry_date,'YYYY-MM-DD') between '${fc.created[0] || '0001-01-01'}' and '${fc.created[1] || '9999-12-31'}'
         and coalesce(to_char(deadline,'YYYY-MM-DD'),'') between '${fc.deadline[0] || '0001-01-01'}' and '${fc.deadline[1] || '9999-12-31'}'`,
    )
    const want = Number(sqlCnt[0]?.n ?? 0)
    const got = buildReport(objs, items, [], catalog, {
      createdFrom: fc.created[0],
      createdTo: fc.created[1],
      deadlineFrom: fc.deadline[0],
      deadlineTo: fc.deadline[1],
    }).objectsIn
    const ok = got === want
    if (!ok) fails++
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} фильтр «${fc.name}»: отчёт ${got} / SQL ${want} объектов`)
  }

  // Пример верхних строк первого статуса
  const first = rep.statuses[0]
  if (first) {
    console.log(`— Пример: ${first.status} —`)
    for (const sec of first.sections) {
      console.log(`  ${sec.label} (${sec.qty} шт):`)
      for (const r of sec.rows.slice(0, 3)) console.log(`    ${r.sku} · ${r.qty} шт · ${r.objects} пр.`)
    }
  }
  console.log(fails === 0 ? 'ВСЕ ПРОВЕРКИ OK' : `ПРОВАЛОВ: ${fails}`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
