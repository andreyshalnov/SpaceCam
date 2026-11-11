'use client'

import React from 'react'
import { ArrowRight, Building2, CheckCircle2, ExternalLink, FileText, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { Button } from './ui'
import { ABOUT, BRANDS, CONTACTS, PROJECTS, WHERE } from '@/data/site'
import { withBase } from '@/lib/base-path'

export function PageHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <section className="sc-pattern-dark bg-[#0b0b0c] py-12 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-xs font-medium uppercase tracking-wider text-[#a6ce39]">{kicker}</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {sub && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#b8bab0] sm:text-base">{sub}</p>}
      </div>
    </section>
  )
}

export function About() {
  return (
    <>
      <PageHeader kicker="О бренде" title="SpaceCam — инженерные системы безопасности" />
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl space-y-4">
            {ABOUT.intro.map((b, i) => (
              <p key={i} className="text-sm leading-relaxed text-[#4b4d45] sm:text-base">
                {b.lead && <strong className="text-[#111112]">{b.lead}</strong>}
                {b.rest}
              </p>
            ))}
          </div>

          {/* Семейство брендов ПТК — каждому бренду своё лого (брендбук ПТК 2025) */}
          <h2 className="mt-12 text-xl font-bold text-[#111112] sm:text-2xl">Семейство брендов ПТК</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {BRANDS.map((b) => (
              <div key={b.name} className="flex items-center gap-5 rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-5">
                <div className="flex h-20 w-44 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-2">
                  <img src={withBase(b.logo)} alt={`Логотип ${b.name}`} className="max-h-16 max-w-full object-contain" loading="lazy" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#111112]">{b.name}</span>
                    {b.primary && <span className="rounded bg-[#a6ce39] px-1.5 py-0.5 text-[10px] font-semibold text-black">Профильный</span>}
                  </div>
                  <p className="mt-1 text-sm text-[#4b4d45]">{b.desc}</p>
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#5c7a12] hover:underline"
                    >
                      {b.linkLabel || b.url} <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Button variant="default" href="#/intercom">
              Каталог SpaceCam <ArrowRight aria-hidden />
            </Button>
            <Button variant="outline" href="https://layta.ru" target="_blank" rel="noopener noreferrer">
              Витрина layta.ru <ExternalLink aria-hidden />
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}

export function Projects() {
  return (
    <>
      <PageHeader kicker="Проекты" title="Объекты на оборудовании SpaceCam" sub="Городская среда, спортивные объекты, жилые комплексы — единая сетевая инфраструктура для видеонаблюдения, СКУД и домофонии." />
      <section className="bg-[#f5f6f1] py-12 sm:py-16">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 sm:px-6 lg:grid-cols-3">
          {PROJECTS.map((pr) => (
            <div key={pr.title} className="flex flex-col rounded-xl border border-[#e6e8de] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap gap-1.5">
                {pr.tags.map((t) => (
                  <span key={t} className="rounded bg-[#f4f8e4] px-2 py-0.5 text-[11px] font-medium text-[#4a6b12]">{t}</span>
                ))}
              </div>
              <h2 className="mt-3 text-lg font-bold text-[#111112]">{pr.title}</h2>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#707075]">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {pr.place}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#4b4d45]">{pr.text}</p>
              <div className="mt-4 rounded-lg bg-[#fafaf6] p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111112]">
                  <Building2 className="h-3.5 w-3.5 text-[#5c7a12]" aria-hidden /> {pr.equip}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#707075]">{pr.equipText}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

export function Support() {
  return (
    <>
      <PageHeader
        kicker="Поддержка"
        title="Поддержка"
        sub="Общая почта для вопросов о продукции и контакты ответственных специалистов по направлениям."
      />
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-xl border border-[#e6e8de] bg-[#f8faf1] p-6">
            <h2 className="text-lg font-bold text-[#111112]">Связаться с командой</h2>
            <a
              href="mailto:products@layta.ru"
              className="mt-3 inline-flex items-center gap-2.5 text-base font-semibold text-[#111112] hover:text-[#5c7a12]"
            >
              <Mail className="h-5 w-5 text-[#5c7a12]" aria-hidden /> products@layta.ru
            </a>
            <p className="mt-2 text-sm leading-relaxed text-[#4b4d45]">
              Единый адрес для запросов о продукции SpaceCam, R-Lock, ПТК СКС, ПТК АКБ, ПТК VIM и ПТК ОКЛ: цены, наличие, документация, гарантия и сервис.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-[#e6e8de] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#111112]">Виктор П. Батищев</h3>
              <div className="mt-1 text-sm font-medium text-[#707075]">Эксперт по продукту SpaceCam и R-Lock</div>
              <ul className="mt-4 space-y-3 text-sm text-[#4b4d45]">
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="tel:+78452392171" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    +7 (845) 239-21-71 доб. 002-436
                  </a>
                </li>
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="mailto:BatishchevVP@ptcab.ru" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    BatishchevVP@ptcab.ru
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <span>г. Саратов, ул. Ульяновская, д. 28</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-[#e6e8de] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#111112]">Андрей И. Шальнов</h3>
              <div className="mt-1 text-sm font-medium text-[#707075]">Руководитель направлений SpaceCam и R-Lock</div>
              <ul className="mt-4 space-y-3 text-sm text-[#4b4d45]">
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="tel:88004443500" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    8 (800) 444-35-00 доб. 011-116
                  </a>
                </li>
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="mailto:ShalnovAI@ptcab.ru" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    ShalnovAI@ptcab.ru
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <span>Москва, Рябиновая 45А, стр. 24</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-[#e6e8de] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#111112]">Алексей В. Михалев</h3>
              <div className="mt-1 text-sm font-medium text-[#707075]">Менеджер по развитию продукта ПТК СКС</div>
              <ul className="mt-4 space-y-3 text-sm text-[#4b4d45]">
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="tel:88004443500" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    8 (800) 444-35-00 доб. 002-825
                  </a>
                </li>
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="mailto:mihalevav@ptcab.ru" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    mihalevav@ptcab.ru
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <span>г. Саратов, ул. Ульяновская, д. 28</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-[#e6e8de] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#111112]">Игорь Латышев</h3>
              <div className="mt-1 text-sm font-medium text-[#707075]">Менеджер по развитию продуктов ПТК ОКЛ</div>
              <ul className="mt-4 space-y-3 text-sm text-[#4b4d45]">
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="tel:88004443500" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    8 (800) 444-35-00 доб. 002-441
                  </a>
                </li>
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <a href="mailto:latyshevid@layta.ru" className="font-semibold text-[#111112] hover:text-[#5c7a12]">
                    latyshevid@layta.ru
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
                  <span>г. Саратов, ул. Ульяновская, д. 28</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export function Where() {
  const showcase = WHERE.dealers.find((d) => d.links)
  const partners = WHERE.dealers.filter((d) => !d.links)
  return (
    <>
      <PageHeader kicker="Где купить" title="Купить оборудование SpaceCam и R-Lock" />
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {showcase && (
            <div className="rounded-xl border border-[#e6e8de] bg-[#fafaf6] p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                {showcase.logo && (
                  <a
                    href="https://layta.ru"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-12 shrink-0 items-center rounded-lg bg-white px-3"
                  >
                    <img src={withBase(showcase.logo)} alt={`Логотип ${showcase.name}`} className="max-h-10 w-auto" loading="lazy" />
                  </a>
                )}
                <span className="rounded bg-[#a6ce39] px-2 py-0.5 text-[10px] font-semibold text-black">Витрина производителя</span>
                <a href="https://layta.ru" target="_blank" rel="noopener noreferrer" className="text-base font-bold text-[#111112] hover:text-[#5c7a12]">
                  layta.ru
                </a>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#4b4d45]">{showcase.text}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(showcase.links || []).map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-lg border border-[#e6e8de] bg-white px-4 py-3 text-sm transition-colors hover:border-[#a6ce39] hover:bg-[#f4f8e4]"
                  >
                    <span className="font-medium text-[#111112]">{l.label}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#5c7a12] group-hover:underline">
                      Каталог <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-lg font-bold text-[#111112]">Партнёры и дистрибьюторы</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4b4d45]">
              Продукция SpaceCam и R-Lock также доступна у федеральных дистрибьюторов и региональных партнёров.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {partners.map((d) => (
                <a
                  key={d.url}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-lg border border-[#e6e8de] p-4 transition-colors hover:border-[#a6ce39]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {d.logo ? (
                      <img src={withBase(d.logo)} alt={`Логотип ${d.name}`} className="h-8 w-auto max-w-[120px] shrink-0 object-contain" loading="lazy" />
                    ) : (
                      <span
                        className="flex h-8 shrink-0 items-center rounded bg-[#1f3a5f] px-2 text-xs font-bold tracking-wide text-white"
                        aria-hidden
                      >
                        {d.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 4).toUpperCase()}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-[#111112]">{d.name}</span>
                    <span className="rounded bg-[#f4f8e4] px-1.5 py-0.5 text-[10px] font-semibold text-[#4a6b12]">{d.brand}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#707075]">{d.text}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#5c7a12] group-hover:underline">
                    {d.linkLabel} <ExternalLink className="h-3 w-3" aria-hidden />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
