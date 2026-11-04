'use client'

// Админ-панель «Цены и наличие» (#/admin-prices, только для роли admin):
//  - Цены: таблица 13 типов цен по всем SKU (сохранение по blur);
//  - Наличие: остатки по складам РФ (сохранение по blur);
//  - Импорт: xlsx/csv выгрузка 1С → цены или остатки (+ автоматический снимок);
//  - Пользователи: права партнёров (типы цен, доступ к наличию);
//  - Продажи в штуках: расчёт по снимкам остатков (stock_snapshots).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calculator,
  FilePlus2,
  Megaphone,
  Package,
  RefreshCw,
  Tag,
  Upload,
  UserCog,
  Users,
} from 'lucide-react'
import { Badge } from './ui'
import { useAccount } from '@/lib/account-store'
import {
  FALLBACK_PRICE_TYPES,
  fetchAllUserPriceTypes,
  HIDDEN_PRICE_TYPE_IDS,
  importStockRows,
  mapDbError,
  normalizeSku,
  parseNum,
  PRICE_TYPE_ORDER,
  reloadPriceData,
  shortTypeName,
  shortWarehouseName,
  updateProfileRow,
  updateUserRights,
  upsertPrice,
  upsertPrices,
  upsertStockRow,
  usePriceData,
  type PriceData,
} from '@/lib/price-store'
import { fetchAccounts, fetchSetting, saveSetting, type Account } from '@/lib/registry'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/data/site'
import { NewsAdminTab } from './news'

const NUM_CELL =
  'h-8 w-full rounded border border-[#e6e8de] bg-white px-1.5 text-center text-xs tabular-nums text-[#111112] outline-none focus:border-[#a6ce39] focus-visible:ring-1 focus-visible:ring-[#a6ce39]'

const SECTION_OPTIONS: [string, string][] = [
  ['all', 'Все разделы'],
  ['nodes', 'Узлы коммутации'],
  ['switches', 'Коммутаторы'],
  ['intercom', 'Домофония'],
  ['rlock', 'R-Lock'],
]

// Распознавание складов в выгрузке 1С (код склада → фрагмент названия колонки)
const WAREHOUSE_PATTERNS: [string, RegExp][] = [
  ['vnukovo', /внуково/i],
  ['pohtehkabel', /пожтех/i],
  ['rc-krasnodar', /краснодар/i],
  ['rc-rostov', /ростов/i],
  ['spb', /спб|петербург/i],
  ['saratov', /саратов/i],
  ['simferopol', /симфероп/i],
  ['stavropol', /ставропол/i],
]

/** Автосопоставление колонок выгрузки: артикул + типы цен (или склады). */
function guessColumns(
  header: string[],
  mode: 'prices' | 'stock',
  warehouseCodes: string[],
): Record<string, number> {
  const map: Record<string, number> = {}
  const lower = header.map((h) => String(h ?? '').toLowerCase())
  const find = (pred: (h: string) => boolean) => lower.findIndex((h) => h && pred(h))

  map.sku = find((h) => /артикул|sku|код товара/.test(h))
  if (mode === 'prices') {
    const set = (key: string, pred: (h: string) => boolean) => {
      const idx = find(pred)
      if (idx >= 0) map[key] = idx
    }
    set('t1', (h) => /ррц|рцц/.test(h) || /95|розниц/.test(h))
    set('t2', (h) => /91я|91-я|\b91\b/.test(h))
    const combined = lower.findIndex((h) => /91/.test(h) && /мрц/.test(h) && /внутр/.test(h))
    if (combined >= 0) {
      map.t2 = combined
      map.t8 = combined
      map.t9 = combined
    } else {
      set('t9', (h) => /внутр/.test(h))
      set('t8', (h) => /мрц/.test(h) && !/внутр/.test(h))
    }
    set('t3', (h) => /93|опт/.test(h) || (/сайт/.test(h) && !/ррц/.test(h)))
    set('t4', (h) => /сбер/.test(h))
    const cost = lower.findIndex((h) => /себест/.test(h))
    if (cost >= 0) {
      map.t12 = cost
      map.t13 = cost
    } else {
      set('t13', (h) => /90ая|90-я|\b90\b/.test(h))
    }
    set('t10', (h) => /проект/.test(h))
    set('t11', (h) => /дилер|дистр/.test(h))
    set('t5', (h) => /ozon|озон/.test(h))
    set('t6', (h) => /яндекс/.test(h))
    set('t7', (h) => /\bwb\b|вайлд|wildberries/i.test(h))
  } else {
    for (const code of warehouseCodes) {
      const pattern = WAREHOUSE_PATTERNS.find(([c]) => c === code)?.[1]
      if (!pattern) continue
      const idx = lower.findIndex((h) => h && pattern.test(h))
      if (idx >= 0) map[`w:${code}`] = idx
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Вкладка «Импорт»
// ---------------------------------------------------------------------------

function ImportTab({ pd }: { pd: PriceData }) {
  const [mode, setMode] = useState<'prices' | 'stock'>('prices')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheet, setSheet] = useState('')
  const wbRef = useRef<import('xlsx').WorkBook | null>(null)
  const [header, setHeader] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [cols, setCols] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  const warehouseCodes = useMemo(() => pd.warehouses.map((w) => w.code), [pd.warehouses])
  const whById = useMemo(() => new Map(pd.warehouses.map((w) => [w.code, w])), [pd.warehouses])
  const catalogProducts = useCatalogProducts()
  const catalogSkus = useMemo(() => new Set(catalogProducts.map((p) => normalizeSku(p.sku))), [catalogProducts])

  async function readWorkbook(file: File) {
    setError('')
    setMessages([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      wbRef.current = wb
      setSheetNames(wb.SheetNames)
      await loadSheet(wb.SheetNames[0])
    } catch (e) {
      setError('Не удалось прочитать файл: ' + String(e).slice(0, 120))
    }
  }

  async function loadSheet(name: string) {
    const wb = wbRef.current
    if (!wb) return
    const XLSX = await import('xlsx')
    const ws = wb.Sheets[name]
    if (!ws) return
    const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })
    const headIdx = matrix.findIndex((r) => r.some((c) => /артикул/i.test(String(c ?? ''))))
    if (headIdx < 0) {
      setError('В листе не найдена строка заголовка с колонкой «Артикул»')
      return
    }
    const head = (matrix[headIdx] ?? []).map((c) => String(c ?? '').trim())
    const body = matrix
      .slice(headIdx + 1)
      .map((r) => head.map((_, i) => String(r[i] ?? '')))
      .filter((r) => r.some((c) => c.trim() !== ''))
    setSheet(name)
    setHeader(head)
    setRows(body)
    setCols(guessColumns(head, mode, warehouseCodes))
  }

  useEffect(() => {
    if (header.length) setCols(guessColumns(header, mode, warehouseCodes))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const colSelect = (value: number | undefined, onChange: (idx: number) => void) => (
    <select
      value={value ?? -1}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 max-w-[220px] rounded border border-[#e6e8de] bg-white px-1.5 text-xs text-[#111112]"
    >
      <option value={-1}>— пропустить —</option>
      {header.map((h, i) => (
        <option key={i} value={i}>
          {i + 1}. {h.slice(0, 30) || '(без названия)'}
        </option>
      ))}
    </select>
  )

  const parsed = useMemo(() => {
    if (!rows.length || cols.sku == null || cols.sku < 0) return []
    return rows
      .map((r) => {
        const sku = normalizeSku(r[cols.sku] ?? '')
        const vals: { label: string; value: number }[] = []
        if (mode === 'prices') {
          for (const t of pd.types) {
            const idx = cols[`t${t.id}`]
            if (idx == null || idx < 0) continue
            const v = parseNum(r[idx] ?? '')
            if (v != null) vals.push({ label: t.name, value: v })
          }
        } else {
          for (const code of warehouseCodes) {
            const idx = cols[`w:${code}`]
            if (idx == null || idx < 0) continue
            const v = parseNum(r[idx] ?? '')
            if (v != null) vals.push({ label: whById.get(code)?.name ?? code, value: Math.round(v) })
          }
        }
        return { sku, vals }
      })
      .filter((r) => r.sku)
  }, [rows, cols, mode, pd.types, warehouseCodes, whById])

  const unknown = useMemo(() => parsed.filter((r) => !catalogSkus.has(r.sku)), [parsed, catalogSkus])

  async function upload() {
    setBusy(true)
    setError('')
    setMessages([])
    try {
      const priceRows: { sku: string; price_type_id: number; price: number }[] = []
      const stockRows: { sku: string; warehouse_id: number; qty: number }[] = []
      for (const r of rows) {
        if (cols.sku == null || cols.sku < 0) break
        const sku = normalizeSku(r[cols.sku] ?? '')
        if (!sku) continue
        if (mode === 'prices') {
          for (const t of pd.types) {
            const idx = cols[`t${t.id}`]
            if (idx == null || idx < 0) continue
            const v = parseNum(r[idx] ?? '')
            if (v != null) priceRows.push({ sku, price_type_id: t.id, price: v })
          }
        } else {
          for (const code of warehouseCodes) {
            const idx = cols[`w:${code}`]
            if (idx == null || idx < 0) continue
            const wh = whById.get(code)
            const v = parseNum(r[idx] ?? '')
            if (wh && v != null) stockRows.push({ sku, warehouse_id: wh.id, qty: Math.round(v) })
          }
        }
      }
      const msgs: string[] = []
      if (mode === 'prices') {
        const err = await upsertPrices(priceRows)
        msgs.push(err ? `Ошибка загрузки цен: ${err}` : `Цены загружены: ${priceRows.length} значений`)
      } else {
        const err = await importStockRows(stockRows)
        msgs.push(err ? `Ошибка загрузки остатков: ${err}` : `Остатки загружены: ${stockRows.length} значений`)
      }
      if (unknown.length)
        msgs.push(
          `Внимание: ${unknown.length} артикулов не из каталога (загружены, но на сайте не показываются): ${[
            ...new Set(unknown.map((r) => r.sku)),
          ]
            .slice(0, 8)
            .join(', ')}…`,
        )
      setMessages(msgs)
      if (!msgs.some((m) => m.startsWith('Ошибка'))) reloadPriceData()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border border-[#e6e8de] bg-white p-1">
          {(['prices', 'stock'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                mode === m ? 'bg-[#f4f8e4] text-[#4a6b12]' : 'text-[#707075]'
              }`}
            >
              {m === 'prices' ? 'Цены' : 'Остатки по складам'}
            </button>
          ))}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#a6ce39] bg-[#f4f8e4] px-3 py-2 text-sm font-semibold text-[#4a6b12] hover:bg-[#eaf3cd]">
          <FilePlus2 className="h-4 w-4" aria-hidden /> Выбрать файл (xlsx / csv)
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readWorkbook(f)
            }}
          />
        </label>
        {sheetNames.length > 1 && (
          <select
            value={sheet}
            onChange={(e) => void loadSheet(e.target.value)}
            className="h-9 rounded-md border border-[#e6e8de] bg-white px-2 text-sm text-[#111112]"
            aria-label="Лист книги"
          >
            {sheetNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-[#e8b9b9] bg-[#fbeeee] px-3 py-2 text-sm text-[#a33]">{error}</p>
      )}

      {header.length > 0 && (
        <>
          <div className="mb-4 rounded-xl border border-[#e6e8de] bg-white p-4">
            <h3 className="mb-2 text-sm font-bold text-[#111112]">Сопоставление колонок</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center justify-between gap-2 rounded border border-[#e6e8de] px-2 py-1.5">
                <span className="text-xs font-semibold text-[#111112]">Артикул (SKU)</span>
                {colSelect(cols.sku, (idx) => setCols((c) => ({ ...c, sku: idx })))}
              </div>
              {mode === 'prices'
                ? pd.types.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded border border-[#e6e8de] px-2 py-1.5"
                    >
                      <span className="text-xs font-medium text-[#111112]">{t.name}</span>
                      {colSelect(cols[`t${t.id}`], (idx) => setCols((c) => ({ ...c, [`t${t.id}`]: idx })))}
                    </div>
                  ))
                : warehouseCodes.map((code) => (
                    <div
                      key={code}
                      className="flex items-center justify-between gap-2 rounded border border-[#e6e8de] px-2 py-1.5"
                    >
                      <span className="text-xs font-medium text-[#111112]">{whById.get(code)?.name ?? code}</span>
                      {colSelect(cols[`w:${code}`], (idx) => setCols((c) => ({ ...c, [`w:${code}`]: idx })))}
                    </div>
                  ))}
            </div>
            <p className="mt-2 text-xs text-[#707075]">
              Одна колонка может быть назначена нескольким типам (например «91я, МРЦ, Внутр МРЦ» из прайса — трем
              типам сразу).
            </p>
          </div>

          {parsed.length > 0 && (
            <div className="mb-4 overflow-x-auto rounded-xl border border-[#e6e8de] bg-white">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-[#fafaf6]">
                    <th className="border-b border-[#e6e8de] px-3 py-2 text-left font-semibold text-[#111112]">
                      Артикул
                    </th>
                    <th className="border-b border-[#e6e8de] px-3 py-2 text-left font-semibold text-[#111112]">
                      Значения
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 15).map((r, i) => (
                    <tr key={i} className={catalogSkus.has(r.sku) ? '' : 'bg-[#faf3e0]'}>
                      <td className="border-b border-[#e6e8de] px-3 py-1.5 font-mono">
                        {r.sku}
                        {!catalogSkus.has(r.sku) && ' (нет в каталоге)'}
                      </td>
                      <td className="border-b border-[#e6e8de] px-3 py-1.5">
                        {r.vals.map((v) => `${v.label}: ${v.value}`).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-[#707075]">
                Распознано строк: {parsed.length}; вне каталога: {unknown.length}. Показаны первые{' '}
                {Math.min(15, parsed.length)}.
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void upload()}
              disabled={busy || !parsed.length}
              className="inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-bold text-black hover:bg-[#95bb31] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" aria-hidden />
              {busy ? 'Загрузка…' : `Загрузить ${parsed.length || ''} строк`}
            </button>
          </div>
          {messages.length > 0 && (
            <div className="mt-3 space-y-1">
              {messages.map((m, i) => (
                <p
                  key={i}
                  role="status"
                  className={`text-sm ${m.startsWith('Ошибка') ? 'font-semibold text-[#a33]' : 'text-[#4a6b12]'}`}
                >
                  {m}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      <p className="mt-4 rounded-lg bg-[#fafaf6] p-3 text-xs leading-relaxed text-[#707075]">
        Формат: строка заголовка с колонкой «Артикул»; значения цен — числа с НДС. Автоматически распознаются
        заголовки «РРЦ», «93 (сайт\опт), Сбер ММ», «91я, МРЦ, Внутр МРЦ», «Проектная», «Дилер\Дистр»,
        «Себестоимость = 90ая», а в режиме остатков — названия складов (Внуково, ПожТехКабель, РЦ Краснодар, РЦ
        Ростов, СПб, Саратов, Симферополь, Ставрополь). Артикулы нормализуются:
        «SC-Box-8GP-240-2G-UPS(A)» → «sc-box-8gp-240-2g-ups-a». При загрузке остатков автоматически создаётся
        снимок stock_snapshots на текущую дату — данные для раздела «Продажи в штуках».
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Вкладка «Пользователи»
// ---------------------------------------------------------------------------

function UsersTab({ pd }: { pd: PriceData }) {
  const [users, setUsers] = useState<Account[]>([])
  const [rights, setRights] = useState<Record<string, number[]>>({})
  const [seeAvail, setSeeAvail] = useState<Record<string, boolean>>({})
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string>('')
  const [note, setNote] = useState('')

  async function refresh() {
    const [accounts, all] = await Promise.all([fetchAccounts(), fetchAllUserPriceTypes()])
    setUsers(accounts)
    const r: Record<string, number[]> = {}
    const s: Record<string, boolean> = {}
    const ro: Record<string, string> = {}
    for (const a of accounts) {
      r[a.id] = all[a.id] ?? []
      s[a.id] = a.seeAvailability
      ro[a.id] = a.role
    }
    setRights(r)
    setSeeAvail(s)
    setRoles(ro)
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(u: Account) {
    setSaving(u.id)
    setNote('')
    const err1 = await updateUserRights(u.id, rights[u.id] ?? [])
    const err2 = await updateProfileRow(u.id, {
      role: roles[u.id] ?? u.role,
      see_availability: seeAvail[u.id] ?? true,
    })
    setSaving('')
    if (err1 || err2) setNote([err1, err2].filter(Boolean).join('; '))
    else {
      setNote(`Права ${u.login} сохранены`)
      reloadPriceData()
      void refresh()
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <Users className="h-5 w-5 text-[#5c7a12]" aria-hidden />
        <span className="text-sm text-[#707075]">Пользователей: {users.length}</span>
        {note && <span className="text-sm font-medium text-[#4a6b12]">{note}</span>}
      </div>
      <div className="space-y-3">
        {users.map((u) => {
          const list = rights[u.id] ?? []
          return (
            <details key={u.id} className="rounded-xl border border-[#e6e8de] bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                <span className="font-mono text-sm font-semibold text-[#111112]">{u.login}</span>
                <span className="text-xs text-[#707075]">{u.company || '—'}</span>
                {roles[u.id] === 'admin' && <Badge className="bg-[#a6ce39] text-black">админ</Badge>}
                {u.seeAvailability && roles[u.id] !== 'admin' && (
                  <Badge className="border border-[#e6e8de] bg-white text-[#4b4d45]">наличие</Badge>
                )}
                <span className="ml-auto text-xs text-[#707075]">
                  {list.length === 0 ? 'цены: по умолчанию (95 + МРЦ)' : `типов цен: ${list.length}`}
                </span>
              </summary>
              <div className="border-t border-[#f0f1ea] px-4 py-3">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={roles[u.id] === 'admin'}
                      onChange={(e) => setRoles((r) => ({ ...r, [u.id]: e.target.checked ? 'admin' : 'partner' }))}
                    />
                    Администратор
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={seeAvail[u.id] ?? true}
                      onChange={(e) => setSeeAvail((r) => ({ ...r, [u.id]: e.target.checked }))}
                    />
                    Видит наличие на складах РФ
                  </label>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#707075]">Типы цен</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {pd.types.map((t) => (
                      <label key={t.id} className="inline-flex items-center gap-1.5 text-sm text-[#111112]">
                        <input
                          type="checkbox"
                          checked={list.includes(t.id)}
                          onChange={() =>
                            setRights((r) => {
                              const cur = r[u.id] ?? []
                              return {
                                ...r,
                                [u.id]: cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id],
                              }
                            })
                          }
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-[#85878d]">
                    Пустой набор = набор по умолчанию (РРЦ + МРЦ). Отмеченные типы полностью замещают набор по
                    умолчанию.
                  </p>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void save(u)}
                    disabled={saving === u.id}
                    className="inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-3.5 py-1.5 text-sm font-bold text-black hover:bg-[#95bb31] disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" aria-hidden /> {saving === u.id ? 'Сохранение…' : 'Сохранить права'}
                  </button>
                </div>
              </div>
            </details>
          )
        })}
      </div>
      <p className="mt-4 rounded-lg bg-[#fafaf6] p-3 text-xs leading-relaxed text-[#707075]">
        Создание учётных записей — в Supabase Dashboard → Authentication → Users → Add user (профиль создаётся
        автоматически триггером). Здесь задаются права: набор типов цен и доступ к наличию. Изменения вступают в силу
        у пользователя после перезагрузки страницы.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Вкладка «Продажи в штуках»
// ---------------------------------------------------------------------------

type SalesRow = {
  sku: string
  title: string
  section: string
  start: number
  end: number
  sold: number
  got: number
  price: number | null
  rev: number | null
}

function SalesTab({ pd, products }: { pd: PriceData; products: Product[] }) {
  const [period, setPeriod] = useState({ from: '', to: '' })
  const [snap, setSnap] = useState<{ dates: string[]; raw: { snapshot_date: string; sku: string; warehouse_id: number; qty: number }[]; active: number[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'sold' | 'got' | 'sku'>('sold')
  // Период топа продаж для главной («Флагманы линейки» / «Популярное»):
  // хранится в app_settings (popular_from / popular_to), читается view
  // sc_popular_products. Пустые значения — квартал по умолчанию.
  const [pfFrom, setPfFrom] = useState('')
  const [pfTo, setPfTo] = useState('')
  const [pfStatus, setPfStatus] = useState('')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const wh = await supabase.from('warehouses').select('id,is_active')
        const active = (wh.data || []).filter((w: { is_active: boolean }) => w.is_active).map((w: { id: number }) => w.id)
        // пагинация обязательна: снимков уже > 1000 строк (PostgREST max_rows)
        let data: { snapshot_date: string; sku: string; warehouse_id: number; qty: number }[] = []
        let off = 0
        for (;;) {
          const { data: part, error: err } = await supabase
            .from('stock_snapshots')
            .select('snapshot_date,sku,warehouse_id,qty')
            .order('snapshot_date')
            .range(off, off + 999)
          if (err) throw new Error(mapDbError(err))
          data = data.concat(part || [])
          if (!part || part.length < 1000) break
          off += 1000
        }
        if (!data || !data.length) {
          setError(
            'Снимки остатков (таблица stock_snapshots) пусты. Выполните SQL-скрипт ПТК, затем импортируйте остатки — снимок за дату импорта создаётся автоматически.',
          )
          setSnap({ dates: [], raw: [], active })
          return
        }
        setSnap({
          dates: [...new Set(data.map((r: { snapshot_date: string }) => r.snapshot_date))].sort(),
          raw: data,
          active,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'неизвестная ошибка')
        setSnap({ dates: [], raw: [], active: [] })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Загрузка сохранённого периода для главной
  useEffect(() => {
    void (async () => {
      try {
        setPfFrom(await fetchSetting('popular_from'))
        setPfTo(await fetchSetting('popular_to'))
      } catch {
        /* настройки недоступны — остаётся дефолт */
      }
    })()
  }, [])

  // Дефолтный период (прошлый завершённый квартал от последней выгрузки) — для подсказки
  const pfDefault = useMemo(() => {
    if (!snap || !snap.dates.length) return null
    const last = snap.dates[snap.dates.length - 1]
    const d = new Date(`${last}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return null
    const qStart = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1))
    const prev = new Date(qStart)
    prev.setUTCMonth(prev.getUTCMonth() - 3)
    const iso = (x: Date) => x.toISOString().slice(0, 10)
    return { from: iso(prev), to: iso(qStart) }
  }, [snap])

  async function saveFlagshipPeriod(nextFrom: string, nextTo: string) {
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setPfStatus('Дата начала позже даты конца — проверьте значения')
      return
    }
    const r1 = await saveSetting('popular_from', nextFrom)
    const r2 = await saveSetting('popular_to', nextTo)
    if (r1.ok && r2.ok) {
      setPfStatus('Сохранено — флагманы и «Популярное» на главной уже пересчитаны')
    } else {
      setPfStatus(`Ошибка сохранения: ${r1.error || r2.error || 'неизвестная'}`)
    }
  }

  const rows = useMemo(() => {
    if (!snap || !snap.dates.length) return []
    const dates = snap.dates
    let from = period.from && dates.includes(period.from) ? period.from : dates[0]
    let to = period.to && dates.includes(period.to) ? period.to : dates[dates.length - 1]
    if (from > to) [from, to] = [to, from]

    const bySku: Record<string, Record<string, number>> = {}
    for (const r of snap.raw) {
      if (!snap.active.includes(r.warehouse_id)) continue
      const row = bySku[r.sku] || (bySku[r.sku] = {})
      row[r.snapshot_date] = (row[r.snapshot_date] || 0) + (r.qty || 0)
    }

    const retailId = (pd.types.find((t) => t.code === 'retail95') || { id: 1 }).id
    return Object.keys(bySku).map((sku) => {
      const datesQty = bySku[sku]
      const start = datesQty[from] ?? 0
      const end = datesQty[to] ?? 0
      const sold = Math.max(0, start - end)
      const got = Math.max(0, end - start)
      const p = products.find((x) => normalizeSku(x.sku) === sku)
      const price = pd.prices[sku]?.[String(retailId)] ?? null
      return {
        sku,
        title: p ? p.title : '',
        section: p ? p.section : '',
        start,
        end,
        sold,
        got,
        price,
        rev: price != null ? Math.round(sold * price * 100) / 100 : null,
      }
    })
  }, [snap, period.from, period.to, pd.prices, pd.types, products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => !q || (r.sku + ' ' + r.title).toLowerCase().includes(q))
  }, [rows, query])

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sortBy === 'got') return list.sort((a, b) => b.got - a.got)
    if (sortBy === 'sku') return list.sort((a, b) => (a.sku.toUpperCase() < b.sku.toUpperCase() ? -1 : 1))
    return list.sort((a, b) => b.sold - a.sold || b.got - a.got)
  }, [filtered, sortBy])

  const totalSold = sorted.reduce((s, r) => s + r.sold, 0)
  const totalRev = sorted.reduce((s, r) => s + (r.rev || 0), 0)
  const soldCount = rows.filter((r) => r.sold > 0).length

  const fmt = (n: number) => Number(n || 0).toLocaleString('ru-RU')
  const d2s = (d: string) => String(d || '').replace(/-/g, '').slice(0, 8)

  function dateOptions() {
    if (!snap || !snap.dates.length)
      return (
        <option value="" key="empty">
          нет данных
        </option>
      )
    return snap.dates.map((d) => (
      <option key={`d:${d}`} value={d}>
        {d}
      </option>
    ))
  }

  function downloadCsv() {
    try {
      const head = [
        'Артикул;Наименование;Раздел;Остаток начало;Остаток конец;Продано шт;Поступило шт;Цена розничная;Выручка руб',
      ]
      const lines = sorted.map((r) =>
        [r.sku.toUpperCase(), r.title, r.section, r.start, r.end, r.sold, r.got, r.price ?? '', r.rev ?? '']
          .map((v) => String(v).replace(/;/g, ','))
          .join(';'),
      )
      const blob = new Blob(['\ufeff' + head.concat(lines).join('\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `prodazhi_${d2s(period.from)}_${d2s(period.to)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      /* экспорт необязателен */
    }
  }

  return (
    <div>
      {/* Период топа продаж для главной: «Флагманы линейки» / «Популярное» */}
      <div className="mb-4 rounded-lg border border-[#e6e8de] bg-[#f8faf3] p-4">
        <div className="mb-1 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[#5c7a12]" aria-hidden />
          <span className="text-sm font-semibold text-[#111112]">Период топа продаж на главной</span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-[#707075]">
          {`Блок «Флагманы линейки» показывает лучший товар каждой группы (узлы коммутации, домофоны, коммутаторы, замки), «Популярное оборудование» — лидеров продаж. Оба считаются за этот период; в нём должно быть минимум две выгрузки остатков. Пустые даты — квартал по умолчанию${
            pfDefault
              ? ` (сейчас: ${pfDefault.from.split('-').reverse().join('.')} – ${pfDefault.to.split('-').reverse().join('.')} по дате последней выгрузки)`
              : ''
          }.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="sales-select"
            value={pfFrom}
            onChange={(e) => setPfFrom(e.target.value)}
            aria-label="Начало периода для главной"
          />
          <span className="text-sm text-[#707075]">→</span>
          <input
            type="date"
            className="sales-select"
            value={pfTo}
            onChange={(e) => setPfTo(e.target.value)}
            aria-label="Конец периода для главной"
          />
          <button
            type="button"
            onClick={() => void saveFlagshipPeriod(pfFrom, pfTo)}
            className="sales-csv font-semibold text-[#4a6b12]"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => {
              setPfFrom('')
              setPfTo('')
              void saveFlagshipPeriod('', '')
            }}
            className="sales-csv"
          >
            Сбросить (квартал по умолчанию)
          </button>
          {pfStatus && <span className="text-xs text-[#707075]">{pfStatus}</span>}
        </div>
      </div>

      <div className="sales-toolbar">
        <select
          className="sales-select"
          value={period.from}
          onChange={(e) => setPeriod({ from: e.target.value, to: period.to })}
          aria-label="Дата начала периода"
        >
          {dateOptions()}
        </select>
        <span className="text-sm text-[#707075]">→</span>
        <select
          className="sales-select"
          value={period.to}
          onChange={(e) => setPeriod({ from: period.from, to: e.target.value })}
          aria-label="Дата конца периода"
        >
          {dateOptions()}
        </select>
        <input
          className="sales-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по артикулу или названию"
        />
        <div className="flex gap-1 rounded-md border border-[#e6e8de] bg-white p-1">
          {(
            [
              ['sold', 'По продажам'],
              ['got', 'По поступлениям'],
              ['sku', 'По артикулу'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSortBy(v)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                sortBy === v ? 'bg-[#f4f8e4] text-[#4a6b12]' : 'text-[#707075]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button type="button" onClick={downloadCsv} className="sales-csv">
          Скачать CSV
        </button>
      </div>

      {error && <p className="sales-note">{error}</p>}

      {!loading && snap && snap.dates.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          <span className="sales-chip">
            Период: {period.from || '—'} → {period.to || '—'}
          </span>
          <span className="sales-chip">Продано за период: {fmt(totalSold)} шт</span>
          <span className="sales-chip">Позиций с продажами: {soldCount}</span>
          <span className="sales-chip">Выручка (розница): {fmt(Math.round(100 * totalRev) / 100)} ₽</span>
          <span className="sales-chip">Снимков в базе: {snap.dates.length}</span>
        </div>
      )}

      {!loading && (
        <div className="sales-scroll">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Наименование</th>
                <th>Раздел</th>
                <th className="num">Остаток начало</th>
                <th className="num">Остаток конец</th>
                <th className="num">Продано, шт</th>
                <th className="num">Поступило, шт</th>
                <th className="num">Цена розничная, ₽</th>
                <th className="num">Выручка, ₽</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`sku:${r.sku}`}>
                  <td>{r.sku.toUpperCase()}</td>
                  <td>{r.title}</td>
                  <td>{r.section || '—'}</td>
                  <td className="num">{fmt(r.start)}</td>
                  <td className="num">{fmt(r.end)}</td>
                  <td className="num" style={r.sold > 0 ? { fontWeight: 700, color: '#4a6b12' } : undefined}>
                    {r.sold > 0 ? fmt(r.sold) : '—'}
                  </td>
                  <td className="num">{r.got > 0 ? fmt(r.got) : '—'}</td>
                  <td className="num">{r.price != null ? fmt(r.price) : '—'}</td>
                  <td className="num">{r.rev != null && r.rev > 0 ? fmt(r.rev) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sorted.length === 0 && !loading && (
        <p className="mt-3 text-sm text-[#707075]">Нет данных за выбранный период.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Страница #/admin-prices
// ---------------------------------------------------------------------------

type TabKey = 'prices' | 'stock' | 'recon' | 'import' | 'users' | 'sales' | 'news'

export function AdminPrices() {
  const { account, loading } = useAccount()
  const pd = usePriceData()
  const [tab, setTab] = useState<TabKey>('prices')

  if (loading)
    return (
      <section className="bg-[#f5f6f1] py-24">
        <div className="mx-auto max-w-3xl px-4 text-center text-sm text-[#707075]">Проверка доступа…</div>
      </section>
    )

  if (!account)
    return (
      <section className="bg-[#f5f6f1] py-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="text-5xl font-extrabold text-[#a6ce39]">403</div>
          <h1 className="mt-4 text-2xl font-bold text-[#111112]">Раздел только для администраторов</h1>
          <p className="mt-2 text-sm text-[#707075]">
            Войдите под учётной записью администратора ПТК.{' '}
            <a href="#/login" className="font-semibold text-[#5c7a12] hover:underline">
              Войти
            </a>
          </p>
        </div>
      </section>
    )

  const isAdmin = account.role === 'admin'
  const tabs: [TabKey, string, React.ReactNode][] = [
    ['prices', isAdmin ? 'Цены' : 'Мои цены', <Tag key="t" className="h-4 w-4" aria-hidden />],
  ]
  if (pd.canSeeStock) tabs.push(['stock', 'Наличие', <Package key="s" className="h-4 w-4" aria-hidden />])
  if (isAdmin)
    tabs.push(
      ['recon', 'Сверка наличия', <Package key="rc" className="h-4 w-4" aria-hidden />],
      ['import', 'Импорт', <FilePlus2 key="i" className="h-4 w-4" aria-hidden />],
      ['users', 'Пользователи', <UserCog key="u" className="h-4 w-4" aria-hidden />],
      ['sales', 'Продажи в штуках', <Calculator key="S" className="h-4 w-4" aria-hidden />],
      ['news', 'Новости', <Megaphone key="nws" className="h-4 w-4" aria-hidden />],
    )

  return (
    <>
      <section className="sc-pattern-dark bg-[#0b0b0c] py-10 text-white">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-[#a6ce39]">
                {isAdmin ? 'Администрирование' : 'Личный кабинет'}
              </div>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Цены и наличие</h1>
              <p className="mt-2 text-sm text-[#b8bab0]">
                {isAdmin
                  ? `База Supabase: ${FALLBACK_PRICE_TYPES.length} типов цен, остатки по складам РФ, права пользователей.`
                  : 'Персональные цены и наличие по складам РФ.'}
                {pd.updatedAtMax && (
                  <span className="ml-2 text-[#8a8d82]">
                    Последнее обновление данных: {new Date(pd.updatedAtMax).toLocaleString('ru-RU')}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => reloadPriceData()}
              className="inline-flex items-center gap-2 rounded-md border border-[#3a3b35] bg-[#141511] px-3 py-2 text-sm font-medium text-white hover:bg-[#1d1f18]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Обновить
            </button>
          </div>
        </div>
      </section>

      <section className="bg-[#f5f6f1] py-6">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Разделы панели цен">
            {tabs.map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors ${
                  tab === key
                    ? 'border-[#a6ce39] bg-[#f4f8e4] text-[#4a6b12]'
                    : 'border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {!pd.ready && <p className="mb-4 text-sm text-[#707075]">Загрузка данных из базы…</p>}
          {pd.ready && !pd.dbReady && (
            <p className="mb-4 rounded-md border border-[#e3c98a] bg-[#faf3e0] px-3 py-2 text-sm text-[#8a6d1f]">
              Таблицы базы цен не найдены — выполните <span className="font-mono">db/schema.sql</span> и{' '}
              <span className="font-mono">db/seed.sql</span> в Supabase SQL Editor.
            </p>
          )}

          {tab === 'prices' && <PricesTab pd={pd} />}
          {tab === 'stock' && <StockTab pd={pd} />}
          {tab === 'recon' && <ReconTab pd={pd} />}
          {tab === 'import' && <ImportTab pd={pd} />}
          {tab === 'users' && <UsersTab pd={pd} />}
          {tab === 'sales' && <SalesTabContainer pd={pd} />}
          {tab === 'news' && <NewsAdminTab />}
        </div>
      </section>
    </>
  )
}

/** Продажи: товары берутся из общего файла каталога. */
function SalesTabContainer({ pd }: { pd: PriceData }) {
  const products = useCatalogProducts()
  return <SalesTab pd={pd} products={products} />
}

// Ленивая загрузка каталога (одна на страницу, без лишних ре-рендеров)
let catalogCache: Product[] | null = null
function useCatalogProducts(): Product[] {
  const [items, setItems] = useState<Product[]>(catalogCache ?? [])
  useEffect(() => {
    if (catalogCache) return
    import('@/data/products.json').then((m) => {
      catalogCache = m.default as unknown as Product[]
      setItems(catalogCache)
    })
  }, [])
  return items
}

// ---------------------------------------------------------------------------
// Вкладки «Цены» и «Наличие»
// ---------------------------------------------------------------------------

/** Форматирование цены для отображения: 1234567.5 → «1 234 567,5». */
function fmtPrice(v: number | null | undefined): string {
  return v == null ? '' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

function PricesTab({ pd }: { pd: PriceData }) {
  const products = useCatalogProducts()
  const { account } = useAccount()
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [section, setSection] = useState('all')
  const [query, setQuery] = useState('')

  // Показываемые типы: без маркетплейсных (Сбер ММ, Яндекс Маркет, WB — правятся
  // через «Импорт»), в пределах разрешённых пользователю, в порядке владельца.
  const shownTypes = useMemo(() => {
    const allowed = pd.allowedIds
    const list = pd.types.filter((t) => !HIDDEN_PRICE_TYPE_IDS.includes(t.id) && allowed.includes(t.id))
    const orderMap = new Map(PRICE_TYPE_ORDER.map((id, i) => [id, i]))
    return [...list].sort(
      (a, b) => (orderMap.get(a.id) ?? 1000 + a.sortOrder) - (orderMap.get(b.id) ?? 1000 + b.sortOrder),
    )
  }, [pd.types, pd.allowedIds])

  useEffect(() => {
    const v: Record<string, Record<string, string>> = {}
    for (const p of products) {
      const row = pd.prices[normalizeSku(p.sku)] ?? {}
      const cell: Record<string, string> = {}
      for (const t of pd.types) {
        const val = row[String(t.id)]
        cell[String(t.id)] = val != null ? fmtPrice(val) : ''
      }
      v[p.sku] = cell
    }
    setValues(v)
  }, [pd.prices, pd.types, products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter(
      (p) => (section === 'all' || p.section === section) && (!q || (p.sku + ' ' + (p.title || '')).toLowerCase().includes(q)),
    )
  }, [products, section, query])

  async function saveCell(sku: string, typeId: number, raw: string) {
    const current = pd.prices[normalizeSku(sku)]?.[String(typeId)]
    const num = parseNum(raw)
    // сравниваем разобранное значение с БД — отформатированный показ не триггерит запись
    if (num === (current != null ? current : null)) return
    if (raw.trim() !== '' && num == null) {
      setError(`Некорректное значение «${raw}» — ожидается число ≥ 0`)
      return
    }
    setSaving(`${sku}:${typeId}`)
    setError('')
    const err = await upsertPrice(normalizeSku(sku), typeId, num)
    setSaving('')
    if (err) setError(err)
    else reloadPriceData()
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="h-9 rounded-md border border-[#e6e8de] bg-white px-2 text-sm text-[#111112]"
          aria-label="Раздел каталога"
        >
          {SECTION_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по артикулу или названию…"
          className="h-9 w-64 rounded-md border border-[#e6e8de] bg-white px-3 text-sm text-[#111112]"
          aria-label="Поиск товара"
        />
        <span className="text-sm text-[#707075]">Строк: {filtered.length}</span>
        {saving && (
          <Badge className="bg-[#faf3e0] text-[#8a6d1f] border border-[#e3c98a]">Сохранение…</Badge>
        )}
        {error && <span className="text-sm font-medium text-[#a33]">{error}</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#e6e8de] bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#fafaf6]">
              <th className="sticky left-0 z-10 min-w-[220px] border-b border-r border-[#e6e8de] px-3 py-2 text-left font-semibold text-[#111112]">
                Артикул / название
              </th>
              {shownTypes.map((t) => (
                <th
                  key={t.id}
                  className="border-b border-r border-[#e6e8de] px-2 py-2 text-center font-semibold text-[#111112] last:border-r-0"
                >
                  {shortTypeName(t.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.sku} className="hover:bg-[#fbfcf7]">
                <td className="sticky left-0 z-10 border-b border-r border-[#e6e8de] bg-white px-3 py-1.5">
                  <div className="font-mono text-[11px] font-medium text-[#111112]">{p.sku}</div>
                  <div className="max-w-[240px] truncate text-[11px] text-[#707075]">{p.title || p.subcategory}</div>
                </td>
                {shownTypes.map((t) => (
                  <td key={t.id} className="border-b border-r border-[#e6e8de] px-1.5 py-1 last:border-r-0">
                    <input
                      value={values[p.sku]?.[String(t.id)] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [p.sku]: { ...v[p.sku], [String(t.id)]: e.target.value },
                        }))
                      }
                      onBlur={(e) => void saveCell(p.sku, t.id, e.target.value)}
                      inputMode="decimal"
                      readOnly={account?.role !== 'admin'}
                      className={NUM_CELL}
                      aria-label={`${p.sku} — ${shortTypeName(t.name)}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#707075]">
        Значение сохраняется при выходе из ячейки. Пустая ячейка — цена удаляется (тип не показывается). Маркетплейсные цены
        (Сбер ММ, OZON, Яндекс Маркет, WB) скрыты и редактируются через «Импорт».
      </p>
    </div>
  )
}

function StockTab({ pd }: { pd: PriceData }) {
  const products = useCatalogProducts()
  const { account } = useAccount()
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [section, setSection] = useState('all')
  const [query, setQuery] = useState('')
  const [onlyNonZero, setOnlyNonZero] = useState(false)

  useEffect(() => {
    const v: Record<string, Record<string, string>> = {}
    for (const p of products) {
      const row = pd.stock[normalizeSku(p.sku)] ?? {}
      const cell: Record<string, string> = {}
      for (const w of pd.warehouses) {
        const val = row[String(w.id)]
        cell[String(w.id)] = val != null ? String(val) : '0'
      }
      v[p.sku] = cell
    }
    setValues(v)
  }, [pd.stock, pd.warehouses, products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter(
        (p) =>
          (section === 'all' || p.section === section) &&
          (!q || (p.sku + ' ' + (p.title || '')).toLowerCase().includes(q)),
      )
      .filter((p) => !onlyNonZero || Object.values(values[p.sku] ?? {}).some((x) => Number(x) > 0))
  }, [products, section, query, onlyNonZero, values])

  async function saveCell(sku: string, warehouseId: number, raw: string) {
    const dbValue = pd.stock[normalizeSku(sku)]?.[String(warehouseId)] ?? 0
    if ((values[sku]?.[String(warehouseId)] ?? '0') === String(dbValue)) return
    const num = parseNum(raw)
    const qty = num == null ? 0 : Math.round(num)
    if (qty < 0) {
      setError('Остаток не может быть отрицательным')
      return
    }
    setSaving(`${sku}:${warehouseId}`)
    setError('')
    const err = await upsertStockRow(normalizeSku(sku), warehouseId, qty)
    setSaving('')
    if (err) setError(err)
    else reloadPriceData()
  }

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const w of pd.warehouses) {
      let sum = 0
      for (const p of products) sum += Number(values[p.sku]?.[String(w.id)] ?? 0) || 0
      t[String(w.id)] = sum
    }
    return t
  }, [values, pd.warehouses, products])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="h-9 rounded-md border border-[#e6e8de] bg-white px-2 text-sm text-[#111112]"
          aria-label="Раздел каталога"
        >
          {SECTION_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по артикулу или названию…"
          className="h-9 w-64 rounded-md border border-[#e6e8de] bg-white px-3 text-sm text-[#111112]"
          aria-label="Поиск товара"
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-[#111112]">
          <input type="checkbox" checked={onlyNonZero} onChange={(e) => setOnlyNonZero(e.target.checked)} />
          только ненулевые
        </label>
        <span className="text-sm text-[#707075]">Строк: {filtered.length}</span>
        {saving && (
          <Badge className="bg-[#faf3e0] text-[#8a6d1f] border border-[#e3c98a]">Сохранение…</Badge>
        )}
        {error && <span className="text-sm font-medium text-[#a33]">{error}</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#e6e8de] bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#fafaf6]">
              <th className="sticky left-0 z-10 min-w-[200px] border-b border-r border-[#e6e8de] px-3 py-2 text-left font-semibold text-[#111112]">
                Артикул / название
              </th>
              <th className="w-[8.6%] border-b border-r border-[#e6e8de] px-2 py-2 text-center font-semibold text-[#4a6b12]">Итого</th>
              {pd.warehouses.map((w) => (
                <th
                  key={w.id}
                  title={w.name}
                  className="w-[8.6%] border-b border-r border-[#e6e8de] px-2 py-2 text-center font-semibold text-[#111112] last:border-r-0"
                >
                  {shortWarehouseName(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const sum = pd.warehouses.reduce(
                (acc, w) => acc + (Number(values[p.sku]?.[String(w.id)] ?? 0) || 0),
                0,
              )
              return (
                <tr key={p.sku} className="hover:bg-[#fbfcf7]">
                  <td className="sticky left-0 z-10 border-b border-r border-[#e6e8de] bg-white px-3 py-1.5">
                    <div className="font-mono text-[11px] font-medium text-[#111112]">{p.sku}</div>
                    <div className="max-w-[240px] truncate text-[11px] text-[#707075]">{p.title || p.subcategory}</div>
                  </td>
                  <td className="border-b border-r border-[#e6e8de] px-2 py-1.5 text-center font-bold tabular-nums text-[#4a6b12]">
                    {sum}
                  </td>
                  {pd.warehouses.map((w) => (
                    <td key={w.id} className="border-b border-r border-[#e6e8de] px-1.5 py-1 last:border-r-0">
                      <input
                        value={values[p.sku]?.[String(w.id)] ?? '0'}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [p.sku]: { ...v[p.sku], [String(w.id)]: e.target.value },
                          }))
                        }
                        onBlur={(e) => void saveCell(p.sku, w.id, e.target.value)}
                        inputMode="numeric"
                        readOnly={account?.role !== 'admin'}
                        className={NUM_CELL}
                        aria-label={`${p.sku} — ${shortWarehouseName(w)}`}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#fafaf6] font-semibold">
              <td className="sticky left-0 z-10 border-r border-t border-[#e6e8de] bg-[#fafaf6] px-3 py-2 text-[#111112]">
                Итого по складу
              </td>
              <td className="border-r border-t border-[#e6e8de] px-2 py-2 text-center tabular-nums text-[#4a6b12]">
                {Object.values(totals).reduce((a, b) => a + b, 0)}
              </td>
              {pd.warehouses.map((w) => (
                <td
                  key={w.id}
                  className="border-r border-t border-[#e6e8de] px-2 py-2 text-center tabular-nums text-[#111112] last:border-r-0"
                >
                  {totals[String(w.id)] ?? 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#707075]">
        Значение сохраняется при выходе из ячейки. 0 — позиции нет на складе (на сайте — «под заказ»).
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Вкладка «Сверка наличия» (admin): период по снимкам 1С, дельта по складам,
// импорт отчёта 1С «Анализ доступности товаров на складах» → stock_snapshots.
// ---------------------------------------------------------------------------

type SnapshotRow = { snapshot_date: string; sku: string; warehouse_id: number; qty: number }

/** Нормализация названия строки 1С для сопоставления складов. */
function normWh(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[<>.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Служебные склады 1С → id справочника (SQL-скрипт ПТК). */
const SPECIAL_WAREHOUSES: Record<string, number> = {
  'брак внуково': 21,
  'демозал саратов': 22,
  'недостача очаково': 23,
  'недостача симферополь': 24,
  'транзит внуково': 25,
  'транзит г санкт-петербург': 26,
  'транзит рц ростов-на-дону': 27,
  'транзит г симферополь': 28,
}

/** Базовые склады по названию (fallback, если справочника нет). */
const BASE_WAREHOUSES: Record<string, number> = {
  внуково: 1,
  пожтехкабель: 2,
  'рц краснодар': 3,
  'рц ростов-на-дону': 4,
  'санкт-петербург': 5,
  спб: 5,
  'саратов трофимовский': 6,
  саратов: 6,
  симферополь: 7,
  ставрополь: 8,
}

export function ReconTab({ pd }: { pd: PriceData }) {
  const products = useCatalogProducts()
  const [snap, setSnap] = useState<{ rows: SnapshotRow[]; dates: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [wh, setWh] = useState('all')
  const [period, setPeriod] = useState({ from: '', to: '' })
  const [query, setQuery] = useState('')
  const [impMsg, setImpMsg] = useState('')
  const [parsed, setParsed] = useState<{ date: string; rows: number; warehouses: number; skipped: string[] } | null>(null)
  const [impRows, setImpRows] = useState<SnapshotRow[]>([])
  const [impBusy, setImpBusy] = useState(false)
  const [impDate, setImpDate] = useState('')

  function whId(name: string): number | null {
    const t0 = normWh(name)
    if (!t0) return null
    if (t0.indexOf('объект не найден') === 0) return 29
    const n0 = t0.replace(/^склад /, '')
    const found = (pd.warehouses || []).find((w) => normWh(w.name) === n0 || normWh(w.name) === t0)
    return found ? found.id : (SPECIAL_WAREHOUSES[t0] ?? BASE_WAREHOUSES[n0] ?? BASE_WAREHOUSES[t0] ?? null)
  }

  async function loadSnapshots() {
    setLoading(true)
    setMsg('')
    try {
      // пагинация обязательна: снимков > 1000 строк
      let rows: SnapshotRow[] = []
      let off = 0
      for (;;) {
        const { data, error } = await supabase
          .from('stock_snapshots')
          .select('snapshot_date,sku,warehouse_id,qty')
          .order('snapshot_date')
          .range(off, off + 999)
        if (error) throw new Error(mapDbError(error))
        const part = data || []
        rows = rows.concat(part as SnapshotRow[])
        if (part.length < 1000) break
        off += 1000
      }
      const dates = [...new Set(rows.map((r) => r.snapshot_date))].sort()
      setSnap({ rows, dates })
      if (dates.length)
        setPeriod((p) => ({
          from: p.from && dates.includes(p.from) ? p.from : dates[0],
          to: p.to && dates.includes(p.to) ? p.to : dates[dates.length - 1],
        }))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSnapshots()
  }, [])

  /** Разбор отчёта 1С «Анализ доступности товаров на складах» (.xlsx). */
  async function parseReport(file: File) {
    setImpMsg('')
    setParsed(null)
    setImpRows([])
    setImpDate('')
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })
      let reportDate: string | null = null
      for (let i = 0; i < Math.min(grid.length, 12); i++) {
        for (const cell of grid[i] || []) {
          if (cell == null) continue
          const m = /на конец дня\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(cell))
          if (m && !reportDate) reportDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
        }
      }
      let headRow = -1
      let nameCol = -1
      let qtyCol = -1
      for (let i = 0; i < grid.length; i++) {
        const cells = (grid[i] || []).map((c) => normWh(c))
        const ni = cells.indexOf('номенклатура')
        const qi = cells.indexOf('в ед хранения')
        if (ni >= 0 && qi >= 0) {
          headRow = i
          nameCol = ni
          qtyCol = qi
          break
        }
      }
      if (headRow < 0) throw new Error('Не найдена шапка отчёта (строка «Номенклатура … В ед. хранения»)')
      if (!reportDate) throw new Error('Не найдена дата отчёта («Период: на конец дня …»)')
      const acc: Record<string, number> = {}
      const whs: Record<number, number> = {}
      const skipped: Record<string, number> = {}
      let curWh: number | null = null
      for (let i = headRow + 2; i < grid.length; i++) {
        const cells = grid[i] || []
        const name = String(cells[nameCol] ?? '').trim()
        if (!name) continue
        if (/^итог$/i.test(name)) break
        if (/^(склад|транзит|брак|демозал|недостача)[ \u00A0]/i.test(name) || normWh(name).indexOf('объект не найден') === 0) {
          curWh = whId(name)
          if (curWh == null) skipped[name] = (skipped[name] || 0) + 1
          continue
        }
        if (curWh == null) continue
        const rawQty = cells[qtyCol]
        if (rawQty == null || rawQty === '') continue
        const qty = typeof rawQty === 'number' ? rawQty : Number(String(rawQty).replace(/\xa0/g, '').replace(/\s/g, '').replace(/,/g, ''))
        if (!Number.isFinite(qty) || qty < 0) continue
        const clean = String(name).replace(/^комплект давальческого сырья для\s+/i, '')
        const parts = clean.split(/\s+/)
        const sku = normalizeSku(parts[1] || parts[0])
        if (!sku) continue
        acc[`${curWh}|${sku}`] = (acc[`${curWh}|${sku}`] || 0) + qty
        whs[curWh] = 1
      }
      const out: SnapshotRow[] = Object.keys(acc).map((k) => {
        const sep = k.indexOf('|')
        return { snapshot_date: reportDate as string, sku: k.slice(sep + 1), warehouse_id: Number(k.slice(0, sep)), qty: acc[k] }
      })
      if (!out.length) throw new Error('Не распознано ни одной позиции — проверьте формат файла')
      setImpRows(out)
      setParsed({
        date: reportDate,
        rows: out.length,
        warehouses: Object.keys(whs).length,
        skipped: Object.keys(skipped).map((k) => `${k}: ${skipped[k]}`),
      })
      setImpDate(reportDate)
    } catch (e) {
      setImpMsg(e instanceof Error ? e.message : 'Ошибка разбора файла')
    }
  }

  async function writeSnapshot() {
    if (!impRows.length) return
    setImpBusy(true)
    setImpMsg('')
    const day = impRows[0].snapshot_date
    try {
      for (let i = 0; i < impRows.length; i += 500) {
        const { error } = await supabase.from('stock_snapshots').upsert(impRows.slice(i, i + 500))
        if (error) throw new Error(mapDbError(error))
      }
      setImpMsg(`Записано ${impRows.length} строк за ${day}. Обновляю данные…`)
      await loadSnapshots()
      setImpRows([])
      setParsed(null)
      setImpDate('')
      setImpMsg(`Готово: остатки за ${day} записаны в БД.`)
    } catch (e) {
      setImpMsg(e instanceof Error ? e.message : 'Ошибка записи')
    } finally {
      setImpBusy(false)
    }
  }

  const productBySku = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of products) m.set(normalizeSku(p.sku), p)
    return m
  }, [products])

  const view = useMemo(() => {
    if (!snap || !snap.dates.length) return { d0: '', d1: '', rows: [] as Array<{ sku: string; title: string; section: string; s0: number; e0: number; d: number }> }
    const dates = snap.dates
    let from = period.from && dates.includes(period.from) ? period.from : dates[0]
    let to = period.to && dates.includes(period.to) ? period.to : dates[dates.length - 1]
    if (from > to) [from, to] = [to, from]
    const acc: Record<string, { s0: number; e0: number }> = {}
    const q = query.trim().toLowerCase()
    for (const r of snap.rows) {
      if (wh !== 'all' && Number(wh) !== r.warehouse_id) continue
      const row = acc[r.sku] || (acc[r.sku] = { s0: 0, e0: 0 })
      if (r.snapshot_date === from) row.s0 += Number(r.qty || 0)
      else if (r.snapshot_date === to) row.e0 += Number(r.qty || 0)
      if (from === to) row.e0 = row.s0
    }
    return {
      d0: from,
      d1: to,
      rows: Object.keys(acc)
        .sort()
        .map((sku) => {
          const p = productBySku.get(sku)
          const a = acc[sku]
          return { sku, title: p ? p.title : '', section: p ? p.section : '', s0: a.s0, e0: a.e0, d: a.e0 - a.s0 }
        })
        .filter((r) => !q || (r.sku + ' ' + r.title).toLowerCase().includes(q)),
    }
  }, [snap, period, wh, query, productBySku])

  const fmt = (n: number) => Number(n || 0).toLocaleString('ru-RU')
  const d2s = (d: string) => String(d || '').replace(/-/g, '').slice(0, 8)

  function dateOptions() {
    if (snap && snap.dates.length)
      return snap.dates.map((d) => (
        <option key={`d:${d}`} value={d}>
          {d}
        </option>
      ))
    return (
      <option key="empty" value="">
        нет данных
      </option>
    )
  }

  function downloadCsv() {
    try {
      const lines = view.rows.map((r) =>
        [r.sku.toUpperCase(), r.title, r.s0, r.e0, r.d].map((v) => String(v).replace(/;/g, ',')).join(';'),
      )
      const head = 'Артикул;Наименование;Остаток на начало;Остаток на конец;Изменение'
      const blob = new Blob(['\uFEFF' + [head].concat(lines).join('\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `sverka_${d2s(view.d0)}_${d2s(view.d1)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      /* игнорируем */
    }
  }

  return (
    <div>
      <div className="sales-toolbar">
        <select
          className="sales-select"
          value={period.from}
          onChange={(e) => setPeriod({ from: e.target.value, to: period.to })}
          aria-label="Дата начала периода сверки"
        >
          {dateOptions()}
        </select>
        <span className="text-sm text-[#707075]">→</span>
        <select
          className="sales-select"
          value={period.to}
          onChange={(e) => setPeriod({ from: period.from, to: e.target.value })}
          aria-label="Дата конца периода сверки"
        >
          {dateOptions()}
        </select>
        <select className="sales-select" value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Склад">
          <option value="all">Все склады</option>
          {(pd.warehouses || []).map((w) => (
            <option key={`w:${w.id}`} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input
          className="sales-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по артикулу или названию"
        />
        <button type="button" className="sales-csv" onClick={downloadCsv}>
          Скачать CSV
        </button>
      </div>
      <p className="sales-note">
        Остатки на начало и конец периода — из снимков 1С (stock_snapshots, на день отчёта). «Все склады» суммирует всё,
        включая служебные склады (Брак, Демозал, Недостача, Транзит); конкретный склад выбирается из списка.
      </p>
      {msg ? <p className="sales-note">{msg}</p> : null}
      {loading ? <p className="sales-note">Загрузка…</p> : null}
      {!loading && snap && snap.dates.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          <span className="sales-chip">
            Период: {view.d0 || '—'} → {view.d1 || '—'}
          </span>
          <span className="sales-chip">Позиций: {view.rows.length}</span>
          <span className="sales-chip">
            Прибыло: +{fmt(view.rows.reduce((a, r) => a + Math.max(0, r.d), 0))} шт
          </span>
          <span className="sales-chip">
            Убыло: −{fmt(view.rows.reduce((a, r) => a + Math.max(0, -r.d), 0))} шт
          </span>
          <span className="sales-chip">Снимков в базе: {snap.dates.length}</span>
        </div>
      ) : null}
      {!loading && snap && !snap.dates.length ? (
        <p className="sales-note">Снимки остатков (stock_snapshots) пусты — загрузите отчёт 1С ниже, он запишет остатки на дату отчёта.</p>
      ) : null}
      <div className="mb-4 rounded-md border border-[#e6e8de] bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-[#111112]">
          Загрузка отчёта 1С «Анализ доступности товаров на складах» (.xlsx) — запись остатков на день отчёта
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="sales-input"
          disabled={impBusy}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0]
            if (f) void parseReport(f)
          }}
        />
        {parsed ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="sales-chip">Дата отчёта: {parsed.date}</span>
            <span className="sales-chip">Позиций: {parsed.rows}</span>
            <span className="sales-chip">Складов: {parsed.warehouses}</span>
            {parsed.skipped.length ? (
              <span className="sales-chip">Пропущено (склад не в справочнике): {parsed.skipped.join('; ')}</span>
            ) : null}
            <label className="flex items-center gap-1 text-sm text-[#707075]">
              Дата:{' '}
              <input
                type="date"
                className="sales-input"
                value={impDate}
                onChange={(e) => {
                  setImpDate(e.target.value)
                  setImpRows((rows) => rows.map((r) => ({ ...r, snapshot_date: e.target.value })))
                  setParsed((p) => (p ? { ...p, date: e.target.value } : p))
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void writeSnapshot()}
              disabled={impBusy}
              style={{
                background: '#5c7a12',
                color: '#fff',
                borderRadius: '.375rem',
                padding: '.5rem 1rem',
                fontSize: '.875rem',
                fontWeight: 600,
                opacity: impBusy ? 0.5 : 1,
                cursor: impBusy ? 'default' : 'pointer',
              }}
            >
              {impBusy ? 'Запись…' : 'Записать в БД'}
            </button>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-[#707075]">
          Формат: выгрузка 1С «Анализ доступности товаров на складах» (остаток в ед. хранения). Дата берётся из шапки отчёта
          («Период: на конец дня …») и при необходимости правится вручную. Данные пишутся в stock_snapshots на день отчёта и
          не меняют текущее наличие. Служебные склады (Брак, Демозал, Недостача, Транзит) должны быть заведены в справочнике
          складов (SQL-скрипт ПТК), иначе такие строки пропускаются.
        </p>
        {impMsg ? <p className="sales-note">{impMsg}</p> : null}
      </div>
      {!loading ? (
        <div className="sales-scroll">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Наименование</th>
                <th className="num">На начало</th>
                <th className="num">На конец</th>
                <th className="num">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.sku}>
                  <td>{r.sku.toUpperCase()}</td>
                  <td>{r.title || '—'}</td>
                  <td className="num">{fmt(r.s0)}</td>
                  <td className="num">{fmt(r.e0)}</td>
                  <td className="num">
                    {r.d === 0 ? (
                      <span className="text-[#707075]">0</span>
                    ) : r.d > 0 ? (
                      <span className="font-semibold text-[#4a6b12]">+{fmt(r.d)}</span>
                    ) : (
                      <span className="font-semibold" style={{ color: '#b3261e' }}>
                        −{fmt(-r.d)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>Итого</td>
                <td className="num">{fmt(view.rows.reduce((a, r) => a + r.s0, 0))}</td>
                <td className="num">{fmt(view.rows.reduce((a, r) => a + r.e0, 0))}</td>
                <td className="num">{fmt(view.rows.reduce((a, r) => a + r.d, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
