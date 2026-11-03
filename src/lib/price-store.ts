'use client'

// Хранилище цен и остатков (Supabase: price_types, prices, warehouses, stock,
// stock_snapshots, user_price_types). Единый модульный стор + хук usePriceData.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAccount, signOutAccount } from './account-store'
import type { Account } from './registry'

// ---------------------------------------------------------------------------
// Нормализация артикулов: «SC-Box-8GP-240-2G-UPS(A)» → «sc-box-8gp-240-2g-ups-a».
// Кириллические двойники транслитерируются (RL-BR350-LСS, SC-INT-G010-1-AХB).
// ---------------------------------------------------------------------------

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

/** Разбор числа из ячейки выгрузки: пробелы/nbsp/запятая → число ≥ 0 или null. */
export function parseNum(v: unknown): number | null {
  const s = String(v ?? '').replace(/\xa0/g, '').replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

/** Человекочитаемые ошибки БД. */
export function mapDbError(e: { message?: string } | null | undefined): string {
  const m = String(e?.message ?? '')
  if (/row-level security/i.test(m)) return 'Действие запрещено политикой доступа'
  if (/duplicate key/i.test(m)) return 'Такая запись уже существует'
  if (/failed to fetch|network/i.test(m))
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
  if (/relation .* does not exist|schema cache/i.test(m))
    return 'Таблицы базы цен не созданы — выполните db/schema.sql в Supabase'
  return m || 'Ошибка базы данных'
}

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export interface PriceType {
  id: number
  code: string
  name: string
  sortOrder: number
}
export interface Warehouse {
  id: number
  code: string
  name: string
  sortOrder: number
}

export const FALLBACK_PRICE_TYPES: PriceType[] = [
  { id: 1, code: 'retail95', name: 'РРЦ', sortOrder: 10 },
  { id: 2, code: 'p91', name: '91-я цена', sortOrder: 20 },
  { id: 3, code: 'p93', name: '93 (сайт / опт)', sortOrder: 30 },
  { id: 4, code: 'sbber_mm', name: 'Сбер ММ', sortOrder: 40 },
  { id: 5, code: 'ozon', name: 'Цена OZON', sortOrder: 50 },
  { id: 6, code: 'yandex_market', name: 'Яндекс Маркет', sortOrder: 60 },
  { id: 7, code: 'wildberries', name: 'Цена для WB', sortOrder: 70 },
  { id: 8, code: 'mrc', name: 'МРЦ', sortOrder: 80 },
  { id: 9, code: 'mrc_inner', name: 'Внутр МРЦ', sortOrder: 90 },
  { id: 10, code: 'project', name: 'Проектная', sortOrder: 100 },
  { id: 11, code: 'dealer', name: 'Дилер / Дистр', sortOrder: 110 },
  { id: 12, code: 'cost', name: 'Себестоимость', sortOrder: 120 },
  { id: 13, code: 'p90', name: '90-я цена', sortOrder: 130 },
]

/** Набор цен по умолчанию для неавторизованных/партнёров без настроек. */
export const DEFAULT_ALLOWED_IDS = [1, 8]

/** Скрытые маркетплейс-колонки (Сбер ММ, Яндекс Маркет, WB) — OZON показывается. */
export const HIDDEN_PRICE_TYPE_IDS = [4, 6, 7]

/** Порядок колонок в таблице цен (остальные — по sortOrder). */
export const PRICE_TYPE_ORDER = [1, 8, 9, 3, 2, 10, 11, 12, 13, 5]

/** Короткие имена типов цен для шапки таблицы. */
export const PRICE_TYPE_NAME_SHORT: Record<string, string> = {
  '95 Розница': 'РРЦ',
  '91-я цена': '91-я B2B',
  '93 (сайт / опт)': '93 (сайт/опт)',
  Проектная: 'Проект.',
  'Дилер / Дистр': 'Дилер/Дистр',
  Себестоимость: 'Себес.',
  '90-я цена': '90-я себес.',
}

export function shortTypeName(name: string): string {
  return PRICE_TYPE_NAME_SHORT[name] ?? name
}

/** Короткие имена складов для шапки таблицы наличия. */
export const WAREHOUSE_SHORT_NAMES: Record<string, string> = {
  vnkovo: 'Мск',
  pohtehkabel: 'ПТК',
  'rc-krasnodar': 'Краснодар',
  'rc-rostov': 'РнД',
  spb: 'СПб',
  saratov: 'Саратов',
  simferopol: 'Симферополь',
  stavropol: 'Ставрополь',
}

export function shortWarehouseName(w: { code: string; name: string }): string {
  return WAREHOUSE_SHORT_NAMES[w.code] ?? w.name
}

export interface PriceData {
  ready: boolean
  types: PriceType[]
  allowedIds: number[]
  prices: Record<string, Record<string, number>>
  stock: Record<string, Record<string, number>>
  warehouses: Warehouse[]
  updatedAtMax: string | null
  canSeeStock: boolean
  dbReady: boolean
}

// ---------------------------------------------------------------------------
// Загрузка из БД
// ---------------------------------------------------------------------------

async function fetchPriceTypes(): Promise<PriceType[]> {
  const { data, error } = await supabase
    .from('price_types')
    .select('id, code, name, sort_order')
    .order('sort_order')
  if (!error && data && data.length)
    return data.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      sortOrder: r.sort_order,
    }))
  return FALLBACK_PRICE_TYPES
}

async function fetchPrices(): Promise<{ map: Record<string, Record<string, number>>; updatedAtMax: string | null }> {
  // пагинация обязательна: supabase-js отдаёт максимум 1000 строк за запрос
  const map: Record<string, Record<string, number>> = {}
  let max: string | null = null
  const rows: Array<{ sku: string; price_type_id: number; price: number; updated_at: string | null }> = []
  let off = 0
  for (;;) {
    const { data, error } = await supabase
      .from('prices')
      .select('sku, price_type_id, price, updated_at')
      .range(off, off + 999)
    if (error) return { map, updatedAtMax: null }
    const part = data ?? []
    rows.push(...part)
    if (part.length < 1000) break
    off += 1000
  }
  for (const r of rows) {
    const key = normalizeSku(r.sku)
    ;(map[key] ||= {})[String(r.price_type_id)] = Number(r.price)
    if (r.updated_at && (!max || r.updated_at > max)) max = r.updated_at
  }
  return { map, updatedAtMax: max }
}

async function fetchWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, code, name, sort_order')
    .eq('is_active', true)
    .order('sort_order')
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order }))
}

async function fetchStock(): Promise<Record<string, Record<string, number>>> {
  // пагинация: stock вырос за пределы одного запроса (1000 строк)
  const map: Record<string, Record<string, number>> = {}
  const rows: Array<{ sku: string; warehouse_id: number; qty: number }> = []
  let off = 0
  for (;;) {
    const { data, error } = await supabase.from('stock').select('sku, warehouse_id, qty').range(off, off + 999)
    if (error) return map
    const part = data ?? []
    rows.push(...part)
    if (part.length < 1000) break
    off += 1000
  }
  for (const r of rows) {
    const key = normalizeSku(r.sku)
    ;(map[key] ||= {})[String(r.warehouse_id)] = r.qty
  }
  return map
}

async function fetchAllowedPriceTypes(): Promise<number[] | null> {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id
  if (!userId) return null
  const { data: rows, error } = await supabase
    .from('user_price_types')
    .select('price_type_id')
    .eq('user_id', userId)
  if (error) return null
  const list = rows ?? []
  return list.length ? list.map((r) => r.price_type_id) : null
}

export async function fetchAllUserPriceTypes(): Promise<Record<string, number[]>> {
  const { data, error } = await supabase.from('user_price_types').select('user_id, price_type_id')
  const map: Record<string, number[]> = {}
  if (error) return map
  for (const r of data ?? []) (map[r.user_id] ||= []).push(r.price_type_id)
  return map
}

// ---------------------------------------------------------------------------
// Записи (возвращает строку ошибки или null)
// ---------------------------------------------------------------------------

export async function upsertPrice(
  skuNorm: string,
  priceTypeId: number,
  price: number | null,
): Promise<string | null> {
  if (price === null || Number.isNaN(price)) {
    const { error } = await supabase.from('prices').delete().eq('sku', skuNorm).eq('price_type_id', priceTypeId)
    return error ? mapDbError(error) : null
  }
  const { error } = await supabase.from('prices').upsert({
    sku: skuNorm,
    price_type_id: priceTypeId,
    price,
    updated_at: new Date().toISOString(),
  })
  return error ? mapDbError(error) : null
}

export async function upsertPrices(
  rows: { sku: string; price_type_id: number; price: number }[],
): Promise<string | null> {
  if (!rows.length) return null
  const ts = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: ts }))
    const { error } = await supabase.from('prices').upsert(chunk)
    if (error) return mapDbError(error)
  }
  return null
}

export async function upsertStockRow(
  skuNorm: string,
  warehouseId: number,
  qty: number | null,
): Promise<string | null> {
  if (qty === null || Number.isNaN(qty)) {
    const { error } = await supabase.from('stock').delete().eq('sku', skuNorm).eq('warehouse_id', warehouseId)
    return error ? mapDbError(error) : null
  }
  const { error } = await supabase.from('stock').upsert({
    sku: skuNorm,
    warehouse_id: warehouseId,
    qty,
    updated_at: new Date().toISOString(),
  })
  return error ? mapDbError(error) : null
}

/** Импорт остатков: перезапись stock + автоматический снимок stock_snapshots на сегодня. */
export async function importStockRows(
  rows: { sku: string; warehouse_id: number; qty: number }[],
): Promise<string | null> {
  if (!rows.length) return null
  const ts = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: ts }))
    const { error } = await supabase.from('stock').upsert(chunk)
    if (error) return mapDbError(error)
  }
  try {
    const day = new Date().toISOString().slice(0, 10)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({
        snapshot_date: day,
        sku: r.sku,
        warehouse_id: r.warehouse_id,
        qty: r.qty,
      }))
      const { error } = await supabase.from('stock_snapshots').upsert(chunk)
      if (error) break
    }
  } catch {
    /* снимок — вспомогательная операция */
  }
  return null
}

export async function updateUserRights(userId: string, priceTypeIds: number[]): Promise<string | null> {
  const del = await supabase.from('user_price_types').delete().eq('user_id', userId)
  if (del.error) return mapDbError(del.error)
  if (!priceTypeIds.length) return null
  const { error } = await supabase
    .from('user_price_types')
    .insert(priceTypeIds.map((price_type_id) => ({ user_id: userId, price_type_id })))
  return error ? mapDbError(error) : null
}

export async function updateProfileRow(
  userId: string,
  patch: { role?: string; see_availability?: boolean },
): Promise<string | null> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  return error ? mapDbError(error) : null
}

// ---------------------------------------------------------------------------
// Выборки
// ---------------------------------------------------------------------------

/** Сумма остатков по всем складам для артикула (нормализованного). */
export function stockTotal(stock: Record<string, Record<string, number>>, sku: string): number | null {
  const row = stock[normalizeSku(sku)]
  if (!row) return null
  let sum = 0
  for (const k of Object.keys(row)) sum += row[k] ?? 0
  return sum
}

/** Первая доступная цена из списка разрешённых типов (fallback — статическая). */
export function livePrice(
  prices: Record<string, Record<string, number>>,
  sku: string,
  allowedIds: number[],
  fallback: number,
): number {
  const row = prices[normalizeSku(sku)]
  if (row) {
    for (const id of allowedIds) {
      const v = row[String(id)]
      if (typeof v === 'number' && v > 0) return v
    }
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Стор
// ---------------------------------------------------------------------------

let state: PriceData = {
  ready: false,
  types: FALLBACK_PRICE_TYPES,
  allowedIds: [1],
  prices: {},
  stock: {},
  warehouses: [],
  updatedAtMax: null,
  canSeeStock: false,
  dbReady: false,
}
const listeners = new Set<(s: PriceData) => void>()
let lastAccountId: string | null | undefined = undefined
// Очередь загрузок: если запрос уже идёт, последний пришедший аккаунт
// выполняется следом (иначе стартовый анонимный запрос «съедал» партнёрский).
let queuedAccount: Account | null | undefined | undefined = undefined
let loading = false

function emit(patch: Partial<PriceData>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}

export async function loadPriceData(account: Account | null | undefined, force = false): Promise<void> {
  queuedAccount = account
  if (loading) return
  loading = true
  try {
    for (;;) {
      const acc = queuedAccount
      queuedAccount = undefined
      if (acc === undefined) break
      const accId = acc?.id ?? null
      if (!force && lastAccountId === accId) continue
      force = false
      lastAccountId = accId
      emit({ ready: false })

      const isAdmin = acc?.role === 'admin'
      const types = await fetchPriceTypes()
      const [{ map: prices, updatedAtMax }, allowed] = await Promise.all([
        fetchPrices(),
        accId ? fetchAllowedPriceTypes() : Promise.resolve(null),
      ])
      const allowedIds = accId
        ? isAdmin
          ? types.map((t) => t.id)
          : allowed && allowed.length
            ? [...allowed].sort((a, b) => a - b)
            : DEFAULT_ALLOWED_IDS
        : [types[0]?.id ?? 1]

      let stock: Record<string, Record<string, number>> = {}
      let warehouses: Warehouse[] = []
      let canSeeStock = false
      if (accId) {
        ;[warehouses, stock] = await Promise.all([fetchWarehouses(), fetchStock()])
        canSeeStock = isAdmin || acc?.seeAvailability !== false
      }

      emit({
        ready: true,
        types,
        allowedIds,
        prices,
        stock,
        warehouses,
        updatedAtMax,
        canSeeStock,
        dbReady: types !== FALLBACK_PRICE_TYPES,
      })
    }
  } finally {
    loading = false
  }
}

export function reloadPriceData(): void {
  lastAccountId = undefined
  const acc = currentAccount
  loadPriceData(acc, true)
}

let currentAccount: Account | null = null

export function usePriceData(): PriceData {
  const { account, loading: accLoading } = useAccount()
  const [s, setS] = useState<PriceData>(state)
  useEffect(() => {
    listeners.add(setS)
    return () => {
      listeners.delete(setS)
    }
  }, [])
  useEffect(() => {
    currentAccount = account
    if (!accLoading) loadPriceData(account)
  }, [accLoading, account?.id, account?.role, account?.seeAvailability])
  return s
}

export { signOutAccount }
