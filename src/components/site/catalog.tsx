'use client'

import React, { useMemo, useState } from 'react'
import { ArrowDownWideNarrow, Search } from 'lucide-react'
import { ProductCard } from './product-card'
import { SECTIONS } from '@/data/site'
import type { Product } from '@/data/site'

type SortKey = 'stock' | 'price_asc' | 'price_desc' | 'sku'

// Сортировка по доступному количеству: в наличии сначала, больше остаток — выше
const sorters: Record<SortKey, (a: Product, b: Product) => number> = {
  stock: (a, b) => {
    const sa = a.stock_status === 'in_stock' ? 0 : 1
    const sb = b.stock_status === 'in_stock' ? 0 : 1
    if (sa !== sb) return sa - sb
    if ((b.stock_qty || 0) !== (a.stock_qty || 0)) return (b.stock_qty || 0) - (a.stock_qty || 0)
    return a.sku.localeCompare(b.sku, 'ru')
  },
  price_asc: (a, b) => (a.price || 0) - (b.price || 0) || a.sku.localeCompare(b.sku, 'ru'),
  price_desc: (a, b) => (b.price || 0) - (a.price || 0) || a.sku.localeCompare(b.sku, 'ru'),
  sku: (a, b) => a.sku.localeCompare(b.sku, 'ru'),
}

const SORT_LABELS: [SortKey, string][] = [
  ['stock', 'По количеству на складе'],
  ['price_asc', 'Сначала дешевле'],
  ['price_desc', 'Сначала дороже'],
  ['sku', 'По артикулу А→Я'],
]

export function SectionPage({ section, products }: { section: string; products: Product[] }) {
  const meta = SECTIONS.find((s) => s.id === section)!
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('stock')
  const [stock, setStock] = useState<'all' | 'in_stock' | 'pre_order'>('all')
  const [sub, setSub] = useState<string>('all')

  const all = useMemo(() => products.filter((p) => p.section === section), [products, section])
  const subcats = useMemo(() => Array.from(new Set(all.map((p) => p.subcategory).filter(Boolean))), [all])

  const found = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = all.filter((p) => {
      if (stock !== 'all' && p.stock_status !== stock) return false
      if (sub !== 'all' && p.subcategory !== sub) return false
      if (!query) return true
      const hay = [p.sku, p.title, p.description, ...(p.features || []), ...(p.specs || []).map((s) => `${s.name} ${s.value}`)]
        .join(' ')
        .toLowerCase()
      return hay.includes(query)
    })
    return [...list].sort(sorters[sort])
  }, [all, q, stock, sub, sort])

  return (
    <>
      <section className="sc-pattern-dark bg-[#0b0b0c] py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-xs font-medium uppercase tracking-wider text-[#a6ce39]">Каталог</div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{meta.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#b8bab0] sm:text-base">{meta.desc}</p>
        </div>
      </section>

      <section className="bg-[#f5f6f1] py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[#e6e8de] bg-white p-4 shadow-sm md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#85878d]" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск по артикулу, названию, характеристике…"
                className="h-10 w-full rounded-md border border-[#e6e8de] bg-white pl-9 pr-3 text-sm text-[#111112] outline-none focus:border-[#a6ce39] focus-visible:ring-2 focus-visible:ring-[#a6ce39]"
                aria-label="Поиск по каталогу"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-[#707075]">Сортировка</span>
              <span className="relative">
                <ArrowDownWideNarrow className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#85878d]" aria-hidden />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-10 appearance-none rounded-md border border-[#e6e8de] bg-white pl-8 pr-3 text-sm font-medium text-[#111112] outline-none focus:border-[#a6ce39] focus-visible:ring-2 focus-visible:ring-[#a6ce39]"
                  aria-label="Сортировка товаров"
                >
                  {SORT_LABELS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-[#707075]">Фильтр наличия</span>
              {(
                [
                  ['all', 'Все'],
                  ['in_stock', 'В наличии'],
                  ['pre_order', 'Под заказ'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStock(v)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    stock === v ? 'border-[#a6ce39] bg-[#f4f8e4] text-[#4a6b12]' : 'border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {subcats.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#707075]">Подкатегории</span>
              <button
                type="button"
                onClick={() => setSub('all')}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${sub === 'all' ? 'border-[#a6ce39] bg-[#f4f8e4] text-[#4a6b12]' : 'border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]'}`}
              >
                Все
              </button>
              {subcats.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSub(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${sub === s ? 'border-[#a6ce39] bg-[#f4f8e4] text-[#4a6b12]' : 'border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="mb-4 text-sm text-[#707075]">
            Найдено: <span className="font-semibold text-[#111112]">{found.length}</span>
          </div>
          {found.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#c9cbbf] bg-white p-10 text-center text-sm text-[#707075]">
              Ничего не найдено — измените параметры поиска.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {found.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
