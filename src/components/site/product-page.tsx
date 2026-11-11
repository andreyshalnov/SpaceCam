'use client'

import React, { useState } from 'react'
import { ChevronRight, Download, FileText, ShieldCheck, BadgeCheck, Mail } from 'lucide-react'
import { formatPrice } from './router'
import { Badge } from './ui'
import { withBase } from '@/lib/base-path'
import { CONTACTS, NEW_SECTIONS, stockOf } from '@/data/site'
import type { Product } from '@/data/site'
import { normalizeSku, shortTypeName, stockTotal, usePriceData } from '@/lib/price-store'

// Актуальность остатков (выгрузка витрины 11.11.2026) — fallback, пока нет обновлений в БД
const STOCK_AS_OF = '11.11.2026'

/** Срок поставки под заказ: узлы коммутации — от 2 недель, остальное — от 3 мес. */
function leadTime(section: string): string {
  return section === 'nodes' ? 'от 2 недель' : 'от 3 мес.'
}

// Сертификация/гарантия (задача владельца 09.11):
//  - ТУ и декларация ЕАЭС — только у «Узлов коммутации» (nodes), в остальных
//    карточках убраны;
//  - гарантия: домофоны 12 мес., коммерческие коммутаторы 36 мес.,
//    промышленные коммутаторы 60 мес., замки и доводчики 12 мес.;
//    узлы коммутации — без изменений («до 60 месяцев»).
const CERTS_NODES = [
  { icon: <BadgeCheck className="h-4 w-4 text-[#5c7a12]" aria-hidden />, text: 'ТУ 26.30.23-002-02123310-2023' },
  { icon: <ShieldCheck className="h-4 w-4 text-[#5c7a12]" aria-hidden />, text: 'Декларация ЕАЭС N RU Д-RU.РА10.В.82587/23' },
  { icon: <BadgeCheck className="h-4 w-4 text-[#5c7a12]" aria-hidden />, text: 'Гарантия до 60 месяцев' },
]

function warrantyMonths(p: Product): number {
  if (p.section === 'intercom') return 12
  if (p.section === 'rlock') return 12
  // switches: промышленные подсекции — 60, остальные (коммерческие и SFP) — 36
  return /^промышленн/i.test(p.subcategory || '') ? 60 : 36
}

function docMailto(sku: string, what: string, brand = 'SpaceCam') {
  const subject = `${what}: ${sku}`
  const body = `Здравствуйте!\nПрошу направить ${what.toLowerCase()} по товару ${sku} (${brand}).\nЗаранее спасибо.`
  return `mailto:${CONTACTS.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ТЗ v2.0: производители новых разделов (данные — из декларации ЕАЭС и брендбука ПТК)
const MANUFACTURER: Record<string, string> = {
  intercom: 'SpaceCam · ООО «Технолайт», Россия',
  switches: 'SpaceCam · ООО «Технолайт», Россия',
  nodes: 'SpaceCam · ООО «Технолайт», Россия',
  rlock: 'R-Lock · семейство брендов ПТК, Россия',
  'ptk-sks': 'ПожТехКабель (ПТК) · ООО «Технолайт», Россия',
  'ptk-akb': 'ПожТехКабель (ПТК) · ООО «Технолайт», Россия',
  'vim-akb': 'VIM · заявитель ООО «Технолайт», Россия',
  'ptk-okl': 'ПожТехКабель (ПТК) · ООО «Технолайт», Россия',
}

// Сноска об источнике цены — для позиций ТЗ v2.0
function priceNote(p: Product): string {
  if (p.priceSource === 'layta') return `Цена layta.ru с НДС · наличие на ${STOCK_AS_OF}`
  if (p.priceSource === 'ptcab-price-2025-09-18') return 'Цена по прайс-листу ОКЛ ПТК от 18.09.2025 (ptcab.ru)'
  if (p.section === 'ptk-okl') return 'Реестр номенклатуры ptcab.ru · цена и срок поставки — по запросу'
  return `Наличие и цена актуальны на ${STOCK_AS_OF}`
}

// ТЗ v2.0: CTA «Запросить КП» для позиций без цены (почта КП ptcab.ru)
function kpMailto(p: Product): string {
  const subject = `Запрос КП: ${p.sku}`
  const body = `Здравствуйте!\nПрошу направить коммерческое предложение по позиции ${p.sku} — ${p.title} (${p.subcategory}).\nЗаранее спасибо.`
  return `mailto:opr@layta.ru?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// Декларация ЕАЭС на АКБ AGM 12 В (PTK-BAT и VIM, действ. до 21.04.2027)
const AKB_CERTS = [
  { icon: <ShieldCheck className="h-4 w-4 text-[#5c7a12]" aria-hidden />, text: 'Декларация ЕАЭС № РОСС RU Д-CN.PA01.В.16643/24' },
  { icon: <BadgeCheck className="h-4 w-4 text-[#5c7a12]" aria-hidden />, text: 'Технология AGM, 12 В' },
]

export function ProductPage({ p, sectionTitle }: { p: Product; sectionTitle: string }) {
  const [active, setActive] = useState(0)
  const pd = usePriceData()

  // Живая цена: первая доступная из разрешённых типов цен (fallback — статическая)
  const priceRow = pd.prices[normalizeSku(p.sku)]
  const livePrices: Array<{ type: { id: number; name: string }; value: number }> = []
  if (priceRow) {
    for (const id of pd.allowedIds) {
      const v = priceRow[String(id)]
      const t = pd.types.find((x) => x.id === id)
      if (typeof v === 'number' && v > 0 && t) livePrices.push({ type: t, value: v })
    }
  }
  const primary = livePrices[0]
  const stockSum = pd.ready && pd.canSeeStock ? stockTotal(pd.stock, p.sku) : null

  const images = p.images || []
  const title = p.title || p.sku
  const docs = p.documents || []
  const specs = p.specs || []
  const features = p.features || []

  return (
    <>
      {/* Хлебные крошки */}
      <div className="border-b border-[#f0f1ea] bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-3 text-xs text-[#707075] sm:px-6" aria-label="Хлебные крошки">
          <a href="#/" className="hover:text-[#5c7a12]">Главная</a>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <a href={`#/${p.section}`} className="hover:text-[#5c7a12]">{sectionTitle}</a>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="font-mono text-[#111112]">{p.sku}</span>
        </div>
      </div>

      <section className="bg-white py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            {/* Галерея */}
            <div>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-[#e6e8de] bg-white p-6">
                {images.length > 0 ? (
                  <img
                    src={withBase(images[Math.min(active, images.length - 1)])}
                    alt={`${title} — изображение ${Math.min(active, images.length - 1) + 1}`}
                    className="max-h-full max-w-full object-contain"
                    decoding="async"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-[#85878d]">
                    <span className="text-sm font-medium">Скоро в каталоге</span>
                    <span className="text-xs">Фото готовит отдел маркетинга</span>
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Галерея изображений">
                  {images.map((im, i) => (
                    <button
                      key={im}
                      type="button"
                      onClick={() => setActive(i)}
                      className={`h-16 w-16 overflow-hidden rounded-lg border bg-white p-1 ${i === active ? 'border-[#a6ce39] ring-1 ring-[#a6ce39]' : 'border-[#e6e8de] hover:border-[#c9d69a]'}`}
                      aria-label={`Миниатюра ${i + 1}`}
                    >
                      <img src={withBase(im)} alt={`Миниатюра ${i + 1}`} className="h-full w-full object-contain" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Инфо — макет по образцу карточки товара tinko.ru */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {p.flags?.isNew && <Badge className="bg-[#a6ce39] text-black hover:bg-[#a6ce39]">Новинка</Badge>}
                {p.flags?.isHit && <Badge className="border border-[#e6e8de] bg-white text-[#111112]">Хит</Badge>}
                {p.status === 'placeholder' && <Badge className="border border-[#e3c98a] bg-[#faf3e0] text-[#8a6d1f]">Скоро в каталоге</Badge>}
              </div>

              {/* Код + производитель (как в блоке «Информация о товаре» на Tinko) */}
              <dl className="mt-3 space-y-1 text-xs text-[#707075]">
                <div className="flex gap-2">
                  <dt className="shrink-0">Код товара:</dt>
                  <dd className="font-mono font-medium text-[#111112]">{p.sku}</dd>
                </div>
                {/* ОКПД2/ТНВЭД — в каждой карточке (задача владельца 06.11); коды лежат
                    в статическом каталоге products.json (окопд2/тнвэд-таблиц в БД нет —
                    проверено живым пробингом PostgREST 06.11), нет значения — «не назначен». */}
                <div className="flex gap-2">
                  <dt className="shrink-0">Код ОКПД 2:</dt>
                  <dd className={p.okpd2 ? 'font-mono font-medium text-[#111112]' : 'text-[#85878d]'}>{p.okpd2 || 'не назначен'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0">Код ТН ВЭД:</dt>
                  <dd className={p.tnved ? 'font-mono font-medium text-[#111112]' : 'text-[#85878d]'}>{p.tnved || 'не назначен'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0">Производитель:</dt>
                  <dd className="font-medium text-[#111112]">{MANUFACTURER[p.section] || 'SpaceCam · ООО «Технолайт», Россия'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0">Раздел каталога:</dt>
                  <dd><a href={`#/${p.section}`} className="font-medium text-[#5c7a12] hover:underline">{sectionTitle}</a> · {p.subcategory}</dd>
                </div>
              </dl>

              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#111112] sm:text-3xl">{title}</h1>

              {/* Цена и наличие — ТЗ v2.0: 3 состояния ценового блока */}
              {NEW_SECTIONS.includes(p.section) ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {p.price !== null ? (
                    <span className="text-3xl font-extrabold text-[#111112]">
                      {formatPrice(p.price)}
                      <span className="ml-1 text-sm font-medium text-[#707075]">/ {p.priceUnit || 'шт'}</span>
                    </span>
                  ) : (
                    <span className="text-3xl font-extrabold text-[#111112]">Цена по запросу</span>
                  )}
                  {p.priceSource === 'layta' && (
                    <Badge className="border border-[#e6e8de] bg-white text-[#4b4d45]">layta, с НДС</Badge>
                  )}
                  {(p.priceSource === 'ptcab-price-2025-09-18' || p.priceSource === 'ptcab-catalog') && (
                    <Badge className="border border-[#e6e8de] bg-white text-[#4b4d45]">Прайс ОКЛ 18.09.2025</Badge>
                  )}
                  {stockOf(p) === 'in_stock' ? (
                    <Badge className="bg-[#eef6d8] text-[#4a6b12] border border-[#cfe39a]">В наличии</Badge>
                  ) : (
                    <Badge className="border border-[#e3c98a] bg-[#faf3e0] text-[#8a6d1f]">Под заказ</Badge>
                  )}
                  {p.price === null && (
                    <a
                      href={kpMailto(p)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#a6ce39] px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#95bb31]"
                    >
                      <Mail className="h-4 w-4" aria-hidden /> Запросить КП
                    </a>
                  )}
                  <p className="mt-1.5 w-full text-xs text-[#85878d]">{priceNote(p)}</p>
                </div>
              ) : (
              /* Исходные разделы: живые данные из базы цен */
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-3xl font-extrabold text-[#111112]">
                  {formatPrice(primary ? primary.value : p.price)}
                  <span className="ml-1 text-sm font-medium text-[#707075]">/ шт</span>
                </span>
                <Badge className="border border-[#e6e8de] bg-white text-[#4b4d45]">
                  {primary ? shortTypeName(primary.type.name) : 'РРЦ'}
                </Badge>
                {pd.ready && pd.canSeeStock ? (
                  stockSum == null ? (
                    <Badge className="border border-[#e6e8de] bg-white text-[#85878d]">Нет информации</Badge>
                  ) : stockSum > 0 ? (
                    <Badge className="bg-[#eef6d8] text-[#4a6b12] border border-[#cfe39a]">В наличии: {stockSum} шт</Badge>
                  ) : (
                    <Badge className="border border-[#e3c98a] bg-[#faf3e0] text-[#8a6d1f]">Под заказ, срок поставки {leadTime(p.section)}</Badge>
                  )
                ) : null}
              </div>
              )}
              {/* Уровни цен — свёрнуты под шапку, как «Наличие по складам РФ» (09.11); ТЗ v2.0 — только исходные разделы */}
              {!NEW_SECTIONS.includes(p.section) && livePrices.length > 1 && (
                <details className="mt-3 max-w-md rounded-lg border border-[#e6e8de] bg-[#fafaf6] px-4 py-2.5">
                  <summary className="cursor-pointer text-sm font-semibold text-[#111112]">Все уровни цен</summary>
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                    {livePrices.map(({ type, value }) => (
                      <React.Fragment key={type.id}>
                        <dt className="text-[#707075]">{shortTypeName(type.name)}</dt>
                        <dd className="text-right font-semibold text-[#111112]">{formatPrice(value)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </details>
              )}
              {!NEW_SECTIONS.includes(p.section) && pd.ready && pd.canSeeStock && pd.warehouses.length > 0 && stockSum != null && (
                <details className="mt-3 max-w-md rounded-lg border border-[#e6e8de] bg-[#fafaf6] px-4 py-2.5">
                  <summary className="cursor-pointer text-sm font-semibold text-[#111112]">Наличие по складам РФ</summary>
                  <ul className="mt-2 space-y-1">
                    {pd.warehouses.map((w) => {
                      const q = pd.stock[normalizeSku(p.sku)]?.[String(w.id)] ?? 0
                      return (
                        <li key={w.id} className="flex items-center justify-between gap-4 text-sm">
                          <span className="text-[#707075]">{w.name}</span>
                          <span className={q > 0 ? 'font-semibold text-[#111112]' : 'text-[#85878d]'}>{q > 0 ? `${q} шт` : '—'}</span>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}
              {!NEW_SECTIONS.includes(p.section) && (
              <p className="mt-1.5 text-xs text-[#85878d]">
                {pd.ready && pd.canSeeStock
                  ? pd.updatedAtMax
                    ? `Цены и наличие обновлены: ${(() => {
                        try {
                          return new Date(pd.updatedAtMax).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        } catch {
                          return pd.updatedAtMax
                        }
                      })()}`
                    : `Наличие и цена актуальны на ${STOCK_AS_OF}`
                  : 'Розничная цена. Наличие и персональные цены — после входа в аккаунт или у менеджеров.'}
              </p>
              )}

              {/* Документация — активные ссылки на скачивание из карточки */}
              <div className="mt-6 rounded-xl border border-[#e6e8de] bg-[#fafaf6] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#111112]">Документация и сертификаты</div>
                  <FileText className="h-4 w-4 shrink-0 text-[#85878d]" aria-hidden />
                </div>
                {docs.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {docs.map((d, i) => {
                      const href = withBase(d.public_path || d.url || '#')
                      return (
                        <li key={i}>
                          <a
                            href={href}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-3 rounded-lg border border-[#e6e8de] bg-white px-3 py-2.5 text-sm transition-colors hover:border-[#c9d69a] hover:bg-[#f4f8e4]"
                          >
                            <span className="inline-flex min-w-0 items-center gap-2 text-[#111112]">
                              <Download className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                              <span className="truncate font-medium">{d.name || 'Паспорт изделия'}</span>
                              <span className="shrink-0 text-xs text-[#85878d]">PDF{(d.size_kb ? ` · ${d.size_kb} КБ` : '')}</span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold text-[#5c7a12]">Скачать</span>
                          </a>
                        </li>
                      )
                    })}
                    <li>
                      <a
                        href={docMailto(p.sku, 'Копии сертификатов', p.section === 'rlock' ? 'R-Lock' : NEW_SECTIONS.includes(p.section) ? 'ПТК' : 'SpaceCam')}
                        className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-[#5c7a12] hover:underline"
                      >
                        <Mail className="h-4 w-4" aria-hidden />
                        Запросить копии сертификатов
                      </a>
                    </li>
                  </ul>
                ) : null}
                {/* Нет документов — раздел пуст (без «по запросу», задача 09.11) */}
              </div>

              {/* Сертификация и гарантия — ТЗ v2.0: для АКБ декларация ЕАЭС, для СКС/ОКЛ документы выше */}
              {(p.section === 'ptk-akb' || p.section === 'vim-akb') ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {AKB_CERTS.map((c) => (
                    <Badge key={c.text} className="border border-[#e6e8de] bg-white text-[#4b4d45]">
                      {c.icon} {c.text}
                    </Badge>
                  ))}
                </div>
              ) : p.section === 'ptk-sks' || p.section === 'ptk-okl' ? null : (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {(p.section === 'nodes'
                    ? CERTS_NODES
                    : [{ icon: <BadgeCheck className="h-4 w-4 text-[#5c7a12]" aria-hidden />, text: `Гарантия ${warrantyMonths(p)} месяцев` }]
                  ).map((c) => (
                    <Badge key={c.text} className="border border-[#e6e8de] bg-white text-[#4b4d45]">
                      {c.icon} {c.text}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Характеристики и описание */}
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold text-[#111112]">Характеристики</h2>
              {specs.length > 0 ? (
                <dl className="mt-3 overflow-hidden rounded-xl border border-[#e6e8de] bg-white">
                  {specs.map((s, i) => (
                    <div key={i} className={`flex items-start justify-between gap-4 px-4 py-2.5 text-sm ${i % 2 === 1 ? 'bg-[#fafaf6]' : 'bg-white'}`}>
                      <dt className="text-[#707075]">{s.name}</dt>
                      <dd className="text-right font-medium text-[#111112]">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-[#707075]">
                  Характеристики приведены в описании. Полный лист технических данных — по запросу через проектный отдел.
                </p>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#111112]">Описание</h2>
              {p.description ? (
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#4b4d45]">
                  {p.description.split('\n').filter(Boolean).map((par, i) => (
                    <p key={i}>{par}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-[#707075]">
                  Позиция входит в номенклатуру раздела. Технические данные, цену и срок поставки уточняйте через проектный отдел — подготовим подбор аналогов и коммерческое предложение.
                </p>
              )}
              {features.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#4b4d45]">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a6ce39]" aria-hidden="true" /> {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
