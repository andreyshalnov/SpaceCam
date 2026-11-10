'use client'

import { formatPrice } from './router'
import { Badge } from './ui'
import { withBase } from '@/lib/base-path'
import { NEW_SECTIONS, stockOf } from '@/data/site'
import type { Product } from '@/data/site'
import { livePrice, usePriceData } from '@/lib/price-store'
import { Trophy, Sparkles } from 'lucide-react'

// ТЗ v2.0: в новых разделах числитель остатков не рендерится; исходные разделы — как раньше
function StockBadge({ p }: { p: Product }) {
  const s = stockOf(p)
  if (!NEW_SECTIONS.includes(p.section)) {
    return s === 'in_stock' ? (
      <Badge className="bg-[#eef6d8] text-[#4a6b12] border border-[#cfe39a] hover:bg-[#eef6d8]">
        В наличии: {p.stock_qty} шт
      </Badge>
    ) : (
      // T2: срок производства узлов коммутации — 2–4 недели
      <Badge className="border border-[#e3c98a] bg-[#faf3e0] text-[#8a6d1f]">Под заказ · 2–4 недели</Badge>
    )
  }
  return s === 'in_stock' ? (
    <Badge className="bg-[#eef6d8] text-[#4a6b12] border border-[#cfe39a] hover:bg-[#eef6d8]">В наличии</Badge>
  ) : (
    <Badge className="border border-[#e3c98a] bg-[#faf3e0] text-[#8a6d1f]">Под заказ</Badge>
  )
}

// ТЗ v2.0: ценовой блок карточки (3 состояния цены)
function CardPrice({ p }: { p: Product }) {
  const pd = usePriceData()
  const price = livePrice(pd.prices, p.sku, pd.allowedIds, p.price)
  if (price === null) {
    return <span className="text-xs font-semibold text-[#707075]">Цена по запросу</span>
  }
  return (
    <span className="text-sm font-bold text-[#111112]">
      {p.priceSource !== undefined ? formatPrice(price) : `от ${formatPrice(price)}`}
      {p.priceUnit && p.priceUnit !== 'шт' && (
        <span className="ml-0.5 text-xs font-medium text-[#707075]">/{p.priceUnit}</span>
      )}
    </span>
  )
}

// ТЗ v2.0: слой registry — компактный рендер в списке (без блока фото)
export function ProductCard({ p }: { p: Product }) {
  const img = p.images[0] ? withBase(p.images[0]) : null
  const compact = p.layer === 'registry'

  if (compact) {
    return (
      <a
        href={`#/product/${p.id}`}
        className="group block h-full outline-none focus-visible:ring-2 focus-visible:ring-[#a6ce39] rounded-xl"
        aria-label={`${p.sku} — ${p.title || p.sku}`}
      >
        <div className="flex h-full flex-col justify-between gap-3 rounded-xl border border-[#e6e8de] bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-[11px] tracking-wide text-[#707075]">{p.sku}</div>
              {p.flags?.isNew && <Badge className="bg-[#a6ce39] text-black hover:bg-[#a6ce39]"><Sparkles aria-hidden /> Новинка</Badge>}
            </div>
            <h3 className="mt-1.5 line-clamp-3 text-sm font-semibold leading-snug text-[#111112]">
              {p.title || p.sku}
            </h3>
            <p className="mt-1 line-clamp-1 text-xs text-[#85878d]">{p.subcategory}</p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[#f0f1ea] pt-3">
            <StockBadge p={p} />
            <CardPrice p={p} />
          </div>
        </div>
      </a>
    )
  }

  return (
    <a
      href={`#/product/${p.id}`}
      className="group block h-full outline-none focus-visible:ring-2 focus-visible:ring-[#a6ce39] rounded-xl"
      aria-label={`${p.sku} — ${p.title || p.sku}`}
    >
      <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm transition-shadow hover:shadow-md h-full">
        <div className="relative flex items-center justify-center bg-white p-4 h-44">
          {img ? (
            <img
              src={img}
              alt={p.title || p.sku}
              loading="lazy"
              className="object-contain max-h-36 max-w-full transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#85878d]">
              <span className="text-xs font-medium">Скоро в каталоге</span>
              <span className="text-[11px]">Фото готовит отдел маркетинга</span>
            </div>
          )}
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {p.flags?.isNew && (
              <Badge className="bg-[#a6ce39] text-black hover:bg-[#a6ce39]">
                <Sparkles aria-hidden /> Новинка
              </Badge>
            )}
            {p.flags?.isHit && (
              <Badge className="border border-[#e6e8de] bg-white text-[#111112]">
                <Trophy className="text-[#a6ce39]" aria-hidden /> Хит
              </Badge>
            )}
          </div>
        </div>
        <div className="p-4 pt-3">
          <div className="font-mono text-[11px] tracking-wide text-[#707075]">{p.sku}</div>
          <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-[#111112]">
            {p.title || p.sku}
          </h3>
          <p className="mt-1.5 line-clamp-1 text-xs text-[#707075]">{p.features[0] || p.subcategory}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#f0f1ea] px-4 pt-4">
          <StockBadge p={p} />
          <CardPrice p={p} />
        </div>
      </div>
    </a>
  )
}
