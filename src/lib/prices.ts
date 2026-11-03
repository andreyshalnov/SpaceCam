// Слой данных «цены и наличие» (Supabase) — site-spacecam-23.
//
// Таблицы (см. db/schema.sql): price_types, prices, warehouses, stock,
// user_price_types + profiles.see_availability. Доступ режет RLS:
// гость видит только «95 Розница» и не видит наличие; залогиненный — свой
// набор типов (по умолчанию 95 + МРЦ) и наличие; админ — всё.
//
// Если таблиц ещё нет (schema.sql не выполнен), справочник подменяется
// константой, а выборки возвращают пустые карты — сайт продолжает работать
// на статических ценах products.json (graceful degradation).

import { supabase } from './supabase'

export interface PriceType {
  id: number
  code: string
  name: string
  sortOrder: number
}

/** Коды типов цен (id фиксированы в schema.sql). */
export const PT = {
  retail95: 1,
  p91: 2,
  p93: 3,
  sbber_mm: 4,
  ozon: 5,
  yandex_market: 6,
  wildberries: 7,
  mrc: 8,
  mrc_inner: 9,
  project: 10,
  dealer: 11,
  cost: 12,
  p90: 13,
} as const

/** Резервный справочник, если таблица price_types ещё не создана. */
export const FALLBACK_PRICE_TYPES: PriceType[] = [
  { id: 1, code: 'retail95', name: '95 Розница', sortOrder: 10 },
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

/** Набор по умолчанию для залогиненного пользователя без индивидуальных прав. */
export const DEFAULT_ALLOWED: number[] = [PT.retail95, PT.mrc]

export interface Warehouse {
  id: number
  code: string
  name: string
  sortOrder: number
}

/** sku → (price_type_id → цена), ключи типов — строки (после JSON). */
export type PriceMap = Record<string, Record<string, number>>
/** sku → (warehouse_id → qty). */
export type StockMap = Record<string, Record<string, number>>

export function errRu(err: { message?: string } | null | undefined): string {
  const m = String(err?.message ?? '')
  if (/row-level security/i.test(m)) return 'Действие запрещено политикой доступа'
  if (/duplicate key/i.test(m)) return 'Такая запись уже существует'
  if (/failed to fetch|network/i.test(m))
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
  if (/relation .* does not exist|schema cache/i.test(m))
    return 'Таблицы базы цен не созданы — выполните db/schema.sql в Supabase'
  return m || 'Ошибка базы данных'
}

// ---------------------------------------------------------------------------
// Чтение
// ---------------------------------------------------------------------------

export async function fetchPriceTypes(): Promise<PriceType[]> {
  const { data, error } = await supabase
    .from('price_types')
    .select('id, code, name, sort_order')
    .order('sort_order')
  if (error || !data || !data.length) return FALLBACK_PRICE_TYPES
  return (data as Array<{ id: number; code: string; name: string; sort_order: number }>).map(
    (r) => ({ id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order }),
  )
}

/** Все цены, разрешённые текущему пользователю политиками RLS. */
export async function fetchAllowedPrices(): Promise<{
  map: PriceMap
  updatedAtMax: string | null
}> {
  const { data, error } = await supabase
    .from('prices')
    .select('sku, price_type_id, price, updated_at')
  const map: PriceMap = {}
  let max: string | null = null
  if (error) return { map, updatedAtMax: null }
  for (const r of (data ?? []) as Array<{
    sku: string
    price_type_id: number
    price: number | string
    updated_at: string | null
  }>) {
    ;(map[r.sku] ||= {})[String(r.price_type_id)] = Number(r.price)
    if (r.updated_at && (!max || r.updated_at > max)) max = r.updated_at
  }
  return { map, updatedAtMax: max }
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, code, name, sort_order')
    .eq('is_active', true)
    .order('sort_order')
  if (error || !data) return []
  return (data as Array<{ id: number; code: string; name: string; sort_order: number }>).map(
    (r) => ({ id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order }),
  )
}

export async function fetchStock(): Promise<StockMap> {
  const { data, error } = await supabase.from('stock').select('sku, warehouse_id, qty')
  const map: StockMap = {}
  if (error) return map
  for (const r of (data ?? []) as Array<{ sku: string; warehouse_id: number; qty: number }>) {
    ;(map[r.sku] ||= {})[String(r.warehouse_id)] = r.qty
  }
  return map
}

/**
 * Индивидуальный набор типов текущего пользователя.
 * Возвращает null, если строк нет (→ набор по умолчанию) или пользователь гость.
 */
export async function fetchMyPriceTypeIds(): Promise<number[] | null> {
  const { data: sess } = await supabase.auth.getSession()
  const uid = sess.session?.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('user_price_types')
    .select('price_type_id')
    .eq('user_id', uid)
  if (error) return null
  const rows = (data ?? []) as Array<{ price_type_id: number }>
  return rows.length ? rows.map((r) => r.price_type_id) : null
}

/** Все индивидуальные наборы (для админки). */
export async function fetchAllPricePerms(): Promise<Record<string, number[]>> {
  const { data, error } = await supabase.from('user_price_types').select('user_id, price_type_id')
  const out: Record<string, number[]> = {}
  if (error) return out
  for (const r of (data ?? []) as Array<{ user_id: string; price_type_id: number }>) {
    ;(out[r.user_id] ||= []).push(r.price_type_id)
  }
  return out
}

// ---------------------------------------------------------------------------
// Запись (RLS пропустит только админа)
// ---------------------------------------------------------------------------

/** Установить цену (price=null — удалить строку). */
export async function savePrice(
  sku: string,
  typeId: number,
  price: number | null,
): Promise<string | null> {
  if (price == null || Number.isNaN(price)) {
    const { error } = await supabase
      .from('prices')
      .delete()
      .eq('sku', sku)
      .eq('price_type_id', typeId)
    return error ? errRu(error) : null
  }
  const { error } = await supabase
    .from('prices')
    .upsert({ sku, price_type_id: typeId, price, updated_at: new Date().toISOString() })
  return error ? errRu(error) : null
}

/** Массовый upsert цен (админка/импорт). */
export async function upsertPricesBatch(
  rows: Array<{ sku: string; price_type_id: number; price: number }>,
): Promise<string | null> {
  if (!rows.length) return null
  const now = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now }))
    const { error } = await supabase.from('prices').upsert(chunk)
    if (error) return errRu(error)
  }
  return null
}

/** Установить остаток (qty=null — удалить строку). */
export async function saveStock(
  sku: string,
  warehouseId: number,
  qty: number | null,
): Promise<string | null> {
  if (qty == null || Number.isNaN(qty)) {
    const { error } = await supabase
      .from('stock')
      .delete()
      .eq('sku', sku)
      .eq('warehouse_id', warehouseId)
    return error ? errRu(error) : null
  }
  const { error } = await supabase
    .from('stock')
    .upsert({ sku, warehouse_id: warehouseId, qty, updated_at: new Date().toISOString() })
  return error ? errRu(error) : null
}

/** Массовый upsert остатков (админка/импорт). */
export async function upsertStockBatch(
  rows: Array<{ sku: string; warehouse_id: number; qty: number }>,
): Promise<string | null> {
  if (!rows.length) return null
  const now = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now }))
    const { error } = await supabase.from('stock').upsert(chunk)
    if (error) return errRu(error)
  }
  return null
}

/** Заменить индивидуальный набор типов пользователя (пустой массив → дефолт). */
export async function saveUserPriceTypes(
  userId: string,
  typeIds: number[],
): Promise<string | null> {
  const del = await supabase.from('user_price_types').delete().eq('user_id', userId)
  if (del.error) return errRu(del.error)
  if (!typeIds.length) return null
  const { error } = await supabase
    .from('user_price_types')
    .insert(typeIds.map((t) => ({ user_id: userId, price_type_id: t })))
  return error ? errRu(error) : null
}

/** Обновление служебных полей профиля (роль, право на наличие) — админ. */
export async function updateProfileAdmin(
  id: string,
  patch: { role?: 'admin' | 'partner'; see_availability?: boolean },
): Promise<string | null> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  return error ? errRu(error) : null
}

// ---------------------------------------------------------------------------
// Хелперы отображения
// ---------------------------------------------------------------------------

/**
 * Цена для показа в карточке: первый разрешённый тип, по которому есть цена;
 * иначе — статическая цена из products.json (гость/нет данных).
 */
export function pickDisplayPrice(
  prices: PriceMap,
  sku: string,
  allowedIds: number[],
  fallback: number | null,
): number | null {
  const slot = prices[sku]
  if (slot) {
    for (const id of allowedIds) {
      const v = slot[String(id)]
      if (typeof v === 'number' && v > 0) return v
    }
  }
  return fallback
}

/** Суммарный остаток по всем складам; null — нет данных по SKU. */
export function totalStock(stock: StockMap, sku: string): number | null {
  const slot = stock[sku]
  if (!slot) return null
  let sum = 0
  for (const k of Object.keys(slot)) sum += slot[k] ?? 0
  return sum
}

/** Список разрешённых типов с ценами по SKU (для таблицы на карточке товара). */
export function allowedPriceList(
  prices: PriceMap,
  sku: string,
  allowedIds: number[],
  types: PriceType[],
): Array<{ type: PriceType; value: number }> {
  const slot = prices[sku]
  if (!slot) return []
  const out: Array<{ type: PriceType; value: number }> = []
  for (const id of allowedIds) {
    const v = slot[String(id)]
    const t = types.find((x) => x.id === id)
    if (typeof v === 'number' && v > 0 && t) out.push({ type: t, value: v })
  }
  return out
}

export function ruDateTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Нормализация артикулов и чисел (импорт прайсов, site-spacecam-23)
// ---------------------------------------------------------------------------

/** Артикул из файла → id каталога: 'SC-Box-8GP-240-2G-UPS(A)' → 'sc-box-8gp-240-2g-ups-a'. */
export function normSku(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace('(А)', '(A)') // кириллическая А → латинская
    .replace(/\(([A-ZА-Я])\)$/, '-$1')
    .replace(/[^0-9A-Z-]/g, '')
    .toLowerCase()
}

/** Строка → число ≥ 0 (запятая/пробелы допустимы); '' → null; мусор → null. */
export function parseNum(raw: string): number | null {
  const t = String(raw ?? '')
    .replace(/\xa0/g, '')
    .replace(/\s/g, '')
    .replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}
