'use client'

import React, { useEffect, useState } from 'react'
import { ArrowRight, Building2, ShieldCheck, Zap, Network, Layers, Award, Lock } from 'lucide-react'
import { Button } from './ui'
import { ProductCard } from './product-card'
import { SECTIONS, FEATURES, PROJECTS, SCHEME } from '@/data/site'
import type { Product } from '@/data/site'
import { withBase } from '@/lib/base-path'
import { normalizeSku } from '@/lib/price-store'
import { supabase } from '@/lib/supabase'

const SECTION_ICONS: Record<string, React.ReactNode> = {
  intercom: <Building2 className="h-6 w-6 text-[#5c7a12]" aria-hidden />,
  switches: <Network className="h-6 w-6 text-[#5c7a12]" aria-hidden />,
  nodes: <ShieldCheck className="h-6 w-6 text-[#5c7a12]" aria-hidden />,
  rlock: <Lock className="h-6 w-6 text-[#5c7a12]" aria-hidden />,
}
const FEATURE_ICONS = [
  <ShieldCheck key="0" className="h-5 w-5 text-[#a6ce39]" aria-hidden />,
  <Zap key="1" className="h-5 w-5 text-[#a6ce39]" aria-hidden />,
  <Network key="2" className="h-5 w-5 text-[#a6ce39]" aria-hidden />,
  <Layers key="3" className="h-5 w-5 text-[#a6ce39]" aria-hidden />,
  <Layers key="4" className="h-5 w-5 text-[#a6ce39]" aria-hidden />,
  <Award key="5" className="h-5 w-5 text-[#a6ce39]" aria-hidden />,
]

const FLAGSHIPS = ['sc-l2-24gp-385-4g-a', 'sc-8gp-120-2g-a', 'sc-box-l2-4gp-120-2g-ups-a', 'sc-int-v007-2-lwb']
const HITS = ['sc-l2-24gp-385-4g-a', 'sc-8gp-120-2g-a', 'sc-box-l2-4gp-120-2g-ups-a', 'sc-int-v007-2-lwb']

export function Home({ products }: { products: Product[] }) {
  const visible = products
  const byId = new Map(visible.map((p) => [p.id, p]))
  const bySku = new Map(visible.map((p) => [normalizeSku(p.sku), p]))
  const flagships = FLAGSHIPS.map((id) => byId.get(id)).filter(Boolean) as Product[]
  // «Популярное» — лидеры продаж из sc_popular_products; пока нет данных — HITS.
  const [popularRows, setPopularRows] = useState<Array<{ sku: string; sold: number }> | null>(null)
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.from('sc_popular_products').select('sku,sold').order('sold', { ascending: false }).limit(8)
        if (Array.isArray(data) && data.length) setPopularRows(data as Array<{ sku: string; sold: number }>)
      } catch {
        /* без статистики показываем HITS */
      }
    })()
  }, [])
  const hits = (
    popularRows
      ? popularRows.map((r) => bySku.get(normalizeSku(r.sku)) || byId.get(r.sku)).filter(Boolean)
      : (HITS.map((id) => byId.get(id)).filter(Boolean) as Product[])
  ).slice(0, 4) as Product[]
  const count = (sec: string) => visible.filter((p) => p.section === sec).length

  return (
    <>
      {/* Герой */}
      <section className="sc-pattern-dark bg-[#0b0b0c] text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <span className="mb-5 inline-flex items-center justify-center rounded-md border border-[#3f4a2a] bg-[#1c2110] px-2 py-0.5 text-xs font-medium text-[#a6ce39] w-fit whitespace-nowrap">
              Производится в России · Санкт-Петербург
            </span>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Сетевое оборудование и IP-домофония <span className="text-[#a6ce39]">для систем безопасности</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#b8bab0] sm:text-lg">
              Коммутаторы с PoE, всепогодные узлы коммутации SC-Box, домофонная система SpaceCam и замки R-Lock.
              Единая сеть для видеонаблюдения, контроля доступа и домофонии — от квартиры до промышленного объекта.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="default" href="#/intercom">
                Смотреть каталог <ArrowRight aria-hidden />
              </Button>
              <Button variant="darkOutline" href="#/switches">
                Коммутаторы и узлы
              </Button>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                [String(visible.length), 'SKU в каталоге'],
                ['300+', 'объектов с SpaceCam'],
                ['до 60 мес', 'гарантия'],
                ['IP66', 'узлы SC-Box'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dd className="text-2xl font-extrabold text-[#a6ce39]">{v}</dd>
                  <dd className="mt-1 text-xs text-[#85878d]">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-[#26271f] bg-[#121310] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#85878d]">Флагманы линейки</span>
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-[#a6ce39]" />
                  <span className="h-2 w-2 rounded-full bg-[#3a3b38]" />
                  <span className="h-2 w-2 rounded-full bg-[#3a3b38]" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {flagships.map((p) => (
                  <a
                    key={p.id}
                    href={`#/product/${p.id}`}
                    className="group rounded-xl bg-white p-3 transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex h-24 items-center justify-center overflow-hidden">
                      {p.images[0] ? (
                        <img
                          src={withBase(p.images[0])}
                          alt={p.title || p.sku}
                          loading="lazy"
                          className="max-h-24 object-contain transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <span className="text-[10px] text-[#85878d]">Фото готовит отдел маркетинга</span>
                      )}
                    </div>
                    <div className="mt-2 truncate font-mono text-[10px] text-[#707075]">{p.sku}</div>
                    <div className="truncate text-xs font-semibold text-[#111112]">{p.title || p.sku}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Три линейки */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl">
            <div className="mb-3 h-1 w-12 rounded bg-[#a6ce39]" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-[#111112]">Продуктовые линейки</h2>
            <p className="mt-2 text-sm leading-relaxed sm:text-base text-[#707075]">
              Полный цикл: от абонентского монитора и замка R-Lock до уличного узла коммутации с ИБП и термостабилизацией.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={s.href}
                className="group rounded-xl border border-[#e6e8de] bg-white p-6 hover:-translate-y-0.5 hover:border-[#c9d69a]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#f4f8e4]">{SECTION_ICONS[s.id]}</div>
                <h3 className="mt-4 text-lg font-bold text-[#111112]">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#707075]">{s.desc}</p>
                <ul className="mt-4 space-y-1.5">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-[#4b4d45]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#a6ce39]" aria-hidden="true" /> {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-center justify-between border-t border-[#f0f1ea] pt-4">
                  <span className="text-sm font-semibold text-[#5c7a12]">{count(s.id)} товаров</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#111112] group-hover:text-[#5c7a12]">
                    Перейти <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Готовое решение */}
      <section className="bg-[#f5f6f1] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl">
            <div className="mb-3 h-1 w-12 rounded bg-[#a6ce39]" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-[#111112]">
              Готовое решение: IP-домофония жилого комплекса
            </h2>
            <p className="mt-2 text-sm leading-relaxed sm:text-base text-[#707075]">
              Единая сеть из домофонии, видеонаблюдения и СКУД на узлах SpaceCam. Проверено на объекте: 5 секций,
              этажи −2…+12, 110+ абонентов.
            </p>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-[820px] items-stretch gap-0">
              {SCHEME.map((step, i) => (
                <React.Fragment key={step.title}>
                  {i > 0 && (
                    <div className="mx-2 flex flex-col items-center justify-center" aria-hidden="true">
                      <div className="h-0.5 w-8 bg-[#a6ce39]" />
                      <span className="mt-1 whitespace-nowrap text-[10px] font-medium text-[#707075]">
                        {i === 1 || i === 3 ? 'UTP / PoE' : 'SFP 1G'}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-1 items-center">
                    <div className="w-full rounded-xl border border-[#e6e8de] bg-white p-4 shadow-sm">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4f8e4] text-[#5c7a12]">
                        {SECTION_ICONS[i === 0 ? 'intercom' : i === 3 ? 'intercom' : 'switches']}
                      </div>
                      <div className="mt-3 text-sm font-bold text-[#111112]">{step.title}</div>
                      <div className="mt-1 font-mono text-[11px] text-[#707075]">{step.code}</div>
                      <div className="mt-2 inline-block rounded bg-[#f4f8e4] px-1.5 py-0.5 text-[10px] font-medium text-[#4a6b12]">
                        {step.tag}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <p className="mt-3 text-xs text-[#85878d]">
              Пример конфигурации жилого комплекса: 44 этажных узла PoE, 5 агрегаторов, оптические линки 1G между
              секциями, 3 АРМ. Состав под конкретный объект рассчитывает проектный отдел.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="default" href="#/solutions">
              Все типовые решения <ArrowRight aria-hidden />
            </Button>
            <Button variant="outline" href="#/where">
              Запросить расчёт под объект
            </Button>
          </div>
        </div>
      </section>

      {/* Популярное */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl">
            <div className="mb-3 h-1 w-12 rounded bg-[#a6ce39]" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-[#111112]">Популярное оборудование</h2>
            <p className="mt-2 text-sm leading-relaxed sm:text-base text-[#707075]">
              Лидеры продаж по данным учёта остатков на складах.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {hits.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      </section>

      {/* Преимущества */}
      <section className="bg-[#0b0b0c] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl">
            <div className="mb-3 h-1 w-12 rounded bg-[#a6ce39]" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">Преимущества SpaceCam</h2>
            <p className="mt-2 text-sm leading-relaxed sm:text-base text-[#b8bab0]">
              Инженерные решения для объектов любого масштаба — от небольших офисов до крупных жилых комплексов и
              предприятий.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="rounded-xl border border-[#26271f] bg-[#121310] p-6 transition-colors hover:border-[#3a3f2a]">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1c2110]">{FEATURE_ICONS[i]}</div>
                <h3 className="mt-4 font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#b8bab0]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Проекты */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl">
            <div className="mb-3 h-1 w-12 rounded bg-[#a6ce39]" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-[#111112]">Проекты</h2>
            <p className="mt-2 text-sm leading-relaxed sm:text-base text-[#707075]">
              Оборудование SpaceCam работает в жилых комплексах, спортивных объектах и городской среде.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PROJECTS.map((pr) => (
              <div key={pr.title} className="rounded-xl border border-[#e6e8de] p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f4f8e4] text-[#5c7a12]">
                  <Building2 className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-bold text-[#111112]">{pr.title}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[#707075]">
                  <Layers className="h-3.5 w-3.5" aria-hidden /> {pr.place}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#4b4d45]">{pr.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button variant="outline" href="#/projects">
              Все проекты <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#a6ce39]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">Подберём оборудование под ваш объект</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#3c4a17] sm:text-base">
              Проектный отдел рассчитает состав, бюджет PoE и схему сети. Пилотная версия каталога — актуальное наличие
              и цены по выгрузкам от 20.10.2026.
            </p>
          </div>
          <Button variant="limeOutline" href="#/where">
            Запросить КП
          </Button>
        </div>
      </section>
    </>
  )
}
