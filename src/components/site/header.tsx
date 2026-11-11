'use client'

// Шапка: «О бренде» → «Новости» → «Продукция» (dropdown) → «Решения» → «Поддержка»
// → «Где купить» → «Регистрация проекта»; справа — аккаунт (Цены/Выйти) и «Запросить КП».

import { useEffect, useRef, useState } from 'react'
import { Battery, BatteryCharging, Cable, Cctv, ChevronDown, Flame, KeyRound, Lock, LogOut, Menu, Network, Package, Tag, X } from 'lucide-react'
import { withBase } from '@/lib/base-path'
import { Button } from './ui'
import { useAccount, signOutAccount } from '@/lib/account-store'

// ТЗ v2.0: меню «Продукция» — 8 плоских пунктов подряд, без вложенных подменю
const PRODUCT_MENU = [
  { href: '#/intercom', label: 'Домофонная система', desc: 'Станции вызова, мониторы, аксессуары', icon: <Cctv className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
  { href: '#/switches', label: 'Коммутаторы', desc: 'PoE, управляемые L2/L3, промышленные, SFP', icon: <Network className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
  { href: '#/nodes', label: 'Узлы коммутации', desc: 'Всепогодные шкафы SC-Box, IP66, с ИБП', icon: <Package className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
  { href: '#/rlock', label: 'Замки и доводчики R-Lock', desc: 'Электромагнитные замки, доводчики, кронштейны', icon: <Lock className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
  { href: '#/ptk-sks', label: 'СКС ПожТехКабель (ПТК)', desc: 'LAN-кабели, патч-панели, PDU, шкафы 19″', icon: <Cable className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
  { href: '#/ptk-akb', label: 'АКБ ПТК (PTK-BAT)', desc: 'Аккумуляторы AGM 12 В, 1,2–100 Ач', icon: <BatteryCharging className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
  { href: '#/vim-akb', label: 'АКБ VIM', desc: 'Аккумуляторы AGM 12 В, 1,2–40 Ач', icon: <Battery className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
  { href: '#/ptk-okl', label: 'ОКЛ PTK-Line (ПТК)', desc: 'ДМОУ, лотки, коробки, кабель-канал, трубы', icon: <Flame className="h-5 w-5 text-[#5c7a12]" aria-hidden /> },
]

const NAV = [
  { href: '#/solutions', label: 'Решения' },
  { href: '#/support', label: 'Поддержка' },
  { href: '#/where', label: 'Где купить' },
  { href: '#/project-reg', label: 'Регистрация проекта' },
]

export function Logo() {
  return (
    <a href="#/" className="inline-flex shrink-0 items-center outline-none focus-visible:ring-2 focus-visible:ring-[#a6ce39] rounded" aria-label="ПТК — на главную">
      <img src={withBase('/logo-ptk.png')} alt="ПТК — Политехкабель" className="h-10 w-auto sm:h-11" decoding="async" />
    </a>
  )
}

/** Кнопка аккаунта: «Цены» + логин + выход для авторизованных, «Войти» — для остальных. */
export function AccountButton({ onNavigate }: { onNavigate?: () => void }) {
  const { account } = useAccount()
  if (account)
    return (
      <div className="flex items-center gap-1.5">
        <a
          href="#/admin-prices"
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-[#111112] transition-colors hover:bg-[#f4f6ec]"
          title="Цены и наличие"
        >
          <Tag className="h-4 w-4 text-[#a6ce39]" aria-hidden /> Цены
        </a>
        <span className="max-w-24 truncate text-sm font-medium text-[#111112]" title={account.login}>
          {account.login}
        </span>
        <button
          type="button"
          onClick={() => void signOutAccount()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#707075] transition-colors hover:bg-[#f4f6ec] hover:text-[#111112]"
          aria-label="Выйти из аккаунта"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    )
  return (
    <a
      href="#/login"
      onClick={onNavigate}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-[#111112] transition-colors hover:bg-[#f4f6ec]"
    >
      <KeyRound className="h-4 w-4 text-[#5c7a12]" aria-hidden /> Войти
    </a>
  )
}

export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [prodOpen, setProdOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setProdOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <>
    <header
      className={`sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur transition-shadow ${
        scrolled ? 'border-[#e6e8de] shadow-sm' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        {/* Desktop: с xl (1280) — ниже бургер. При lg шапка переполнялась
            (логотип 165 + меню 734 + аккаунт-блок 314 у авторизованного > 1232
            потолка max-w-7xl), флекс сжимал логотип-ссылку без shrink-0 —
            дисторсия — и обрезал CTA (скрин владельца 06.11). */}
        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Основная навигация">
          <a href="#/about" className="whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-[#111112] transition-colors hover:bg-[#f4f6ec]">
            О бренде
          </a>
          <a href="#/news" className="whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-[#111112] transition-colors hover:bg-[#f4f6ec]">
            Новости
          </a>
          <div className="relative" ref={ddRef}>
            <button
              type="button"
              onClick={() => setProdOpen((v) => !v)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-[#111112] outline-none transition-colors hover:bg-[#f4f6ec] focus-visible:ring-2 focus-visible:ring-[#a6ce39]"
              aria-expanded={prodOpen}
              aria-haspopup="menu"
            >
              Продукция <ChevronDown className={`h-3.5 w-3.5 transition-transform ${prodOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {prodOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-[#e6e8de] bg-white p-2 shadow-lg">
                <div className="px-2 py-1.5 text-xs uppercase tracking-wide text-[#707075]">Продуктовые линейки</div>
                {PRODUCT_MENU.map((m) => (
                  <a key={m.href} href={m.href} onClick={() => setProdOpen(false)} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-[#f4f6ec]">
                    <span className="mt-0.5">{m.icon}</span>
                    <span>
                      <span className="block text-sm font-semibold text-[#111112]">{m.label}</span>
                      <span className="block text-xs text-[#707075]">{m.desc}</span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-[#111112] transition-colors hover:bg-[#f4f6ec]">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2.5 xl:flex">
          <AccountButton />
          <Button variant="default" href="#/where">Запросить КП</Button>
        </div>

        {/* Mobile */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#e6e8de] xl:hidden"
          aria-label="Открыть меню"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </header>

    {/* Оверлей мобильного меню — ВНЕ <header>: backdrop-blur шапки создаёт containing block
        для fixed-потомков, и «fixed inset-0» считался от 64-пиксельной шапки вместо вьюпорта —
        меню схлопывалось в полоску поверх бургера и закрывалось его же крестиком (баг от 03.11). */}
    {open && (
      <div className="fixed inset-0 z-[70] xl:hidden">
        <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
        <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#111112]">Меню</span>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-[#f4f6ec]" aria-label="Закрыть меню">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <a href="#/about" onClick={() => setOpen(false)} className="block rounded-md p-2.5 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]">
            О бренде
          </a>
          <a href="#/news" onClick={() => setOpen(false)} className="block rounded-md p-2.5 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]">
            Новости
          </a>
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[#707075]">Продукция</div>
          {PRODUCT_MENU.map((m) => (
            <a key={m.href} href={m.href} onClick={() => setOpen(false)} className="flex items-start gap-3 rounded-md p-2.5 hover:bg-[#f4f6ec]">
              <span className="mt-0.5">{m.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-[#111112]">{m.label}</span>
                <span className="block text-xs text-[#707075]">{m.desc}</span>
              </span>
            </a>
          ))}
          <div className="px-2 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-[#707075]">Разделы</div>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-md p-2.5 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]">
              {n.label}
            </a>
          ))}
          <div className="mt-3 space-y-2 border-t border-[#e6e8de] pt-3">
            <AccountButton onNavigate={() => setOpen(false)} />
            <Button variant="default" href="#/where" className="w-full" onClick={() => setOpen(false)}>
              Запросить КП
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
