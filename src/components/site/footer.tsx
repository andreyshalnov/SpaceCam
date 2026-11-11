'use client'

import { Battery, BatteryCharging, Cable, Cctv, Flame, Globe, Lock, Mail, MapPin, Network, Package, Phone } from 'lucide-react'
import { withBase } from '@/lib/base-path'
import { CONTACTS } from '@/data/site'

export function Footer() {
  return (
    <footer className="mt-auto bg-[#0b0b0c] text-[#b8bab0]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <a href="#/" className="inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-[#a6ce39] rounded" aria-label="ПТК — на главную">
            <span className="inline-flex items-center rounded-md bg-white px-2.5 py-2">
              <img src={withBase('/logo-ptk.png')} alt="ПТК — Политехкабель" className="h-8 w-auto sm:h-9" decoding="async" />
            </span>
          </a>
          <p className="mt-4 text-sm leading-relaxed">
            Сетевое оборудование для систем безопасности и IP-домофония. Производство — Санкт-Петербург,
            владелец бренда — ООО «Технолайт» (layta.ru).
          </p>
        </div>

        <nav aria-label="Продукция в футере">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Продукция</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="#/intercom" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <Cctv className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> Домофонная система
              </a>
            </li>
            <li>
              <a href="#/switches" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <Network className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> Коммутаторы
              </a>
            </li>
            <li>
              <a href="#/nodes" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <Package className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> Узлы коммутации
              </a>
            </li>
            <li>
              <a href="#/rlock" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <Lock className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> Замки и доводчики R-Lock
              </a>
            </li>
            <li>
              <a href="#/ptk-sks" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <Cable className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> СКС ПожТехКабель (ПТК)
              </a>
            </li>
            <li>
              <a href="#/ptk-akb" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <BatteryCharging className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> АКБ ПТК (PTK-BAT)
              </a>
            </li>
            <li>
              <a href="#/vim-akb" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <Battery className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> АКБ VIM
              </a>
            </li>
            <li>
              <a href="#/ptk-okl" className="inline-flex items-center gap-2 hover:text-[#a6ce39]">
                <Flame className="h-3.5 w-3.5 text-[#a6ce39]" aria-hidden /> ОКЛ PTK-Line (ПТК)
              </a>
            </li>
            <li>
              <a href="#/solutions" className="hover:text-[#a6ce39]">Решения и калькуляторы</a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Компания и поддержка в футере">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Компания</h3>
          <ul className="space-y-2 text-sm">
            <li><a href="#/about" className="hover:text-[#a6ce39]">О бренде</a></li>
            <li><a href="#/news" className="hover:text-[#a6ce39]">Новости</a></li>
            <li><a href="#/support" className="hover:text-[#a6ce39]">Поддержка</a></li>
            <li><a href="#/where" className="hover:text-[#a6ce39]">Где купить</a></li>
            <li><a href="#/project-reg" className="hover:text-[#a6ce39]">Регистрация проекта</a></li>
            <li>
              <a href="https://layta.ru" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#a6ce39]">
                <Globe className="h-3.5 w-3.5" aria-hidden /> Интернет-витрина layta.ru
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Контакты</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 text-[#a6ce39]" aria-hidden />
              <a href={CONTACTS.phoneHref} className="font-semibold text-white hover:text-[#a6ce39]">{CONTACTS.phone}</a>
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 shrink-0 text-[#a6ce39]" aria-hidden />
              <a href={`mailto:${CONTACTS.email}`} className="hover:text-[#a6ce39]">{CONTACTS.email}</a>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#a6ce39]" aria-hidden />
              {/* T3: единый адрес бренда */}
              <span>{CONTACTS.production}<br />{CONTACTS.office}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[#232325]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-[#85878d] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2026 ООО «Технолайт». Бренд SpaceCam. Все права защищены.</span>
          <span>Пилотная версия сайта · Цены и наличие — по выгрузкам от 20.10 и 29.10.2026</span>
        </div>
      </div>
    </footer>
  )
}
