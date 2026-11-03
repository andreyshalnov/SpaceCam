'use client'

// Общий синглтон-статус цен и наличия — зеркалит паттерн use-auth.ts (site-spacecam-23).
// Один источник для карточек каталога, страниц товара и админки цен:
// перезагружается при смене аккаунта (вход/выход) и по запросу (после правок).

import { useEffect, useState } from 'react'
import { useAccount } from './use-auth'
import type { Account } from './registry'
import {
  DEFAULT_ALLOWED,
  FALLBACK_PRICE_TYPES,
  type PriceMap,
  type PriceType,
  type StockMap,
  type Warehouse,
  fetchAllowedPrices,
  fetchMyPriceTypeIds,
  fetchPriceTypes,
  fetchStock,
  fetchWarehouses,
} from './prices'

export type PriceState = {
  ready: boolean
  types: PriceType[]
  /** Разрешённые типы цен (id, отсортированы) — для показа; сервер дублирует RLS. */
  allowedIds: number[]
  prices: PriceMap
  stock: StockMap
  warehouses: Warehouse[]
  updatedAtMax: string | null
  canSeeStock: boolean
  /** true, если справочник типов пришёл из БД (schema.sql выполнен). */
  dbReady: boolean
}

let state: PriceState = {
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
const subs = new Set<(s: PriceState) => void>()
let loadedFor: string | null | undefined = undefined // undefined — ещё не грузили
let inFlight = false

function setState(next: Partial<PriceState>) {
  state = { ...state, ...next }
  subs.forEach((fn) => fn(state))
}

async function reload(account: Account | null, force = false) {
  const uid = account?.id ?? null
  if (!force && loadedFor === uid) return
  if (inFlight) return
  inFlight = true
  loadedFor = uid
  setState({ ready: false })

  const isAdmin = account?.role === 'admin'
  const types = await fetchPriceTypes()
  const [{ map: prices, updatedAtMax }, myIds] = await Promise.all([
    fetchAllowedPrices(),
    uid ? fetchMyPriceTypeIds() : Promise.resolve(null),
  ])
  const allowedIds = !uid
    ? [types[0]?.id ?? 1]
    : isAdmin
      ? types.map((t) => t.id)
      : myIds && myIds.length
        ? [...myIds].sort((a, b) => a - b)
        : DEFAULT_ALLOWED

  let stock: StockMap = {}
  let warehouses: Warehouse[] = []
  let canSeeStock = false
  if (uid) {
    ;[warehouses, stock] = await Promise.all([fetchWarehouses(), fetchStock()])
    // Право на наличие: админ — всегда; остальные — флаг профиля
    // (RLS дополнительно режет данные на сервере, здесь — только для UI).
    canSeeStock = isAdmin || account?.seeAvailability !== false
  }

  setState({
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
  inFlight = false
}

/** Принудительное обновление (после правок в админке/импорте). */
export function refreshPriceData(): void {
  // сбрасываем метку «для кого загружено» и перезагружаем с текущим аккаунтом
  loadedFor = undefined
  void reload(lastAccount, true)
}

let lastAccount: Account | null = null

export function usePriceData(): PriceState {
  const { account, loading } = useAccount()
  const [local, setLocal] = useState<PriceState>(state)

  useEffect(() => {
    subs.add(setLocal)
    return () => {
      subs.delete(setLocal)
    }
  }, [])

  useEffect(() => {
    lastAccount = account
    if (!loading) void reload(account)
  }, [loading, account?.id, account?.role, account?.seeAvailability])

  return local
}
