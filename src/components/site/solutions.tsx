'use client'

// Страница «Решения» (#/solutions): типовые решения по обзору «24 типовые схемы
// организации» + калькуляторы решений (домофония, коммутаторы) с ценами каталога.

import React, { useMemo, useState } from 'react'
import {
  ArrowRight,
  Building2,
  Calculator as CalculatorIcon,
  CheckCircle2,
  Cctv,
  FileText,
  Flame,
  Info,
  Lock,
  Network,
  Package,
  Printer,
  ShieldCheck,
  Layers,
} from 'lucide-react'
import { Button } from './ui'
import { formatPrice } from './router'
import { Projects } from './static-pages'
import { withBase } from '@/lib/base-path'
import { livePrice, normalizeSku, usePriceData } from '@/lib/price-store'
import type { Product } from '@/data/site'
import { OklCalculator } from './okl-calculator'

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function spec(p: Product, name: string): string {
  const item = (p.specs || []).find((s) => s.name === name)
  return item ? String(item.value ?? '').trim() : ''
}

function panelModules(apartments: number): number {
  return apartments <= 8 ? 1 : Math.ceil(apartments / 8)
}

function slugFromSku(sku: string): string {
  return sku
    .toLowerCase()
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ---------------------------------------------------------------------------
// Данные типовых решений
// ---------------------------------------------------------------------------

type SolutionItem = { sku: string; label: string }
type Solution = {
  id: string
  tag: string
  fromReview: boolean
  title: string
  desc: string
  img: string
  alt: string
  items: SolutionItem[]
  links: { href: string; label: string }[]
}

const SOLUTION_ICONS: Record<string, React.ReactNode> = {
  cottage: <Building2 className="h-4 w-4" aria-hidden />,
  mkd: <Building2 className="h-4 w-4" aria-hidden />,
  'poe-video': <Cctv className="h-4 w-4" aria-hidden />,
  'sc-box': <Package className="h-4 w-4" aria-hidden />,
  rlock: <Lock className="h-4 w-4" aria-hidden />,
  complex: <ShieldCheck className="h-4 w-4" aria-hidden />,
}

const SOLUTIONS: Solution[] = [
  {
    id: 'cottage',
    tag: 'Домофония · R-Lock',
    fromReview: true,
    title: 'Домофония для коттеджа',
    desc: 'Схема из обзора решений: основная станция вызова у входной двери, дополнительные станции на калитке, в гараже или мастерской, PoE-коммутатор и основное с дополнительными абонентскими устройствами. Мониторы с Wi-Fi работают с мобильным приложением для жильцов.',
    img: '/solutions/solutions-cottage.png',
    alt: 'Коттедж с IP-домофонией: станция вызова, монитор, PoE-коммутатор',
    items: [
      { sku: 'SC-INT-D100-1-MSB', label: 'Основная станция вызова' },
      { sku: 'SC-INT-D100-2-MSB', label: 'Доп. станция вызова (калитка, гараж)' },
      { sku: 'SC-INT-V007-2-LWB', label: 'Абонентский монитор 7", Wi-Fi, PoE' },
      { sku: 'SC-8GP-120-2G(A)', label: 'PoE-коммутатор 8 портов, 120 Вт' },
      { sku: 'RL-EM280-L0S', label: 'Электромагнитный замок R-Lock' },
      { sku: 'RL-DCM-EN2-00S', label: 'Доводчик двери R-Lock' },
    ],
    links: [
      { href: '#/intercom', label: 'Домофонная система' },
      { href: '#/rlock', label: 'Замки и доводчики' },
    ],
  },
  {
    id: 'mkd',
    tag: 'Домофония · SC-Box',
    fromReview: true,
    title: 'Домофония для квартир и ЖК',
    desc: 'Схема из обзора решений: многоабонентские станции вызова у входов зданий (UTP + RVV на электрозамки), этажные PoE-коммутаторы и ядро LAN, абонентские устройства в квартирах — по одному коммутатору на квартиру, терминал консьержа, IP-камеры и CMS, мобильное приложение для жильцов.',
    img: '/solutions/solutions-apartment.png',
    alt: 'Многоквартирный дом: многоабонентская панель вызова, мониторы в квартирах',
    items: [
      { sku: 'SC-INT-D004-2-MFB', label: 'Многоабонентская панель (4 аб.)' },
      { sku: 'SC-INT-D008-1-MFB', label: 'Многоабонентская панель (8 аб.)' },
      { sku: 'SC-INT-V007-2-LWB', label: 'Мониторы в квартирах 7"' },
      { sku: 'SC-INT-V010-1-AXB', label: 'Терминал консьержа 10", Android' },
      { sku: 'SC-L2-24GP-385-4G(A)', label: 'Управляемый PoE-коммутатор 24' },
      { sku: 'SC-Box-8GP-240-2G-UPS(A)', label: 'Уличный узел коммутации с ИБП' },
    ],
    links: [
      { href: '#/intercom', label: 'Домофонная система' },
      { href: '#/nodes', label: 'Узлы коммутации' },
    ],
  },
  {
    id: 'poe-video',
    tag: 'Коммутаторы · PoE',
    fromReview: false,
    title: 'PoE-видеонаблюдение на коммутаторах SpaceCam',
    desc: 'Дополнение к схеме обзора с IP-камерами и CMS: каждая камера подключается отдельной линией к PoE-коммутатору SpaceCam (звезда, без гирлянд) и получает питание по тому же кабелю. Управляемые L2/L3 выделяют VLAN видеонаблюдения, этажные узлы агрегируются по оптике SFP в ядро сети.',
    img: '/solutions/solutions-poe-network.png',
    alt: 'PoE-коммутатор с подключёнными по отдельным линиям IP-камерами',
    items: [
      { sku: 'SC-16GP-285-2G(A)', label: 'Неуправляемый PoE, 16 портов' },
      { sku: 'SC-L2-24GP-385-4G(A)', label: 'Управляемый PoE 24×G + 4×SFP' },
      { sku: 'SC-L2-48GP-680-6XG(A)', label: 'Агрегация: 48 PoE + 6×SFP+' },
      { sku: 'SC-Box-8GP-240-2G-UPS(A)', label: 'Уличный узел с ИБП' },
    ],
    links: [
      { href: '#/switches', label: 'Коммутаторы' },
      { href: '#/nodes', label: 'Узлы коммутации' },
    ],
  },
  {
    id: 'sc-box',
    tag: 'Узлы коммутации · IP66',
    fromReview: false,
    title: 'Уличные узлы коммутации SC-Box',
    desc: 'Дополнение к уличной части схемы: всепогодные шкафы SC-Box со встроенным коммутатором PoE, ИБП и терморегулированием. Все кабельные вводы — через гермовводы в нижней стенке шкафа: монтаж без свисающих проводов и без заводки через дверцу. Питание и защита камер, домофонии и точек доступа — в том числе в промышленном исполнении до −60 °C.',
    img: '/solutions/solutions-sc-box.png',
    alt: 'Всепогодный шкаф SC-Box на стойке: коммутатор и ИБП внутри, гермовводы снизу',
    items: [
      { sku: 'SC-Box-L2-4GP-120-2G-UPS(A)', label: 'SC-Box 4×PoE, 120 Вт, ИБП' },
      { sku: 'SC-Box-L2-8GP-240-2G-UPS(A)', label: 'SC-Box 8×PoE, 240 Вт, ИБП' },
      { sku: 'SC-Box-L2-16GP-480-2G-UPS(A)', label: 'SC-Box 16×PoE, 480 Вт, ИБП' },
      { sku: 'SC-I-L2-8GP-240-2G(A)', label: 'Промышленный коммутатор −40…+85 °C' },
    ],
    links: [
      { href: '#/nodes', label: 'Узлы коммутации' },
      { href: '#/switches', label: 'Коммутаторы' },
    ],
  },
  {
    id: 'rlock',
    tag: 'СКУД · R-Lock',
    fromReview: false,
    title: 'СКУД на электромагнитных замках R-Lock',
    desc: 'Дополнение к точке прохода на схеме обзора: электромагнитный замок из каталога R-Lock (180–1200 кг удержания), доводчик и кнопка выхода. Замок открывается со станции вызова домофонии или контроллера СКУД — входная группа закрывается в единой сети с видеонаблюдением.',
    img: '/solutions/solutions-access.png',
    alt: 'Дверь с электромагнитным замком R-Lock, доводчиком, считывателем и кнопкой выхода',
    items: [
      { sku: 'RL-EM180-L0S', label: 'Электромагнитный замок 180 кг' },
      { sku: 'RL-EM280-L0S', label: 'Электромагнитный замок 280 кг' },
      { sku: 'RL-DCM-EN2-00S', label: 'Доводчик двери EN2' },
    ],
    links: [
      { href: '#/rlock', label: 'Замки и доводчики' },
      { href: '#/intercom', label: 'Домофонная система' },
    ],
  },
  {
    id: 'complex',
    tag: 'Комплексное решение',
    fromReview: false,
    title: 'Единая сеть безопасности объекта',
    desc: 'Обобщение обеих схем обзора: домофония, видеонаблюдение, СКУД и PoE-инфраструктура в одной сети — от абонентского монитора и замка до уличного узла коммутации с ИБП. Этажные PoE-узлы агрегируются в ядро, уличные сегменты — на SC-Box и промышленных коммутаторах SC-I.',
    img: '/solutions/solutions-complex.png',
    alt: 'Жилой комплекс с единой сетью: камеры, домофония, узлы коммутации',
    items: [
      { sku: 'SC-Box-L2-16GP-480-2G-UPS(A)', label: 'Агрегация улицы: SC-Box 16×PoE' },
      { sku: 'SC-L2-48GP-680-6XG(A)', label: 'Ядро сети: 48 PoE + 6×SFP+' },
      { sku: 'SC-I-L2-16GP-380-4G(A)', label: 'Промышленный сегмент' },
      { sku: 'SC-INT-D008-1-MFB', label: 'Домофония: панели на 8 абонентов' },
      { sku: 'SC-INT-V010-1-AWB', label: 'Мониторы 10", Android, Wi-Fi' },
    ],
    links: [
      { href: '#/intercom', label: 'Домофонная система' },
      { href: '#/switches', label: 'Коммутаторы' },
      { href: '#/nodes', label: 'Узлы коммутации' },
      { href: '#/rlock', label: 'Замки и доводчики' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Константы калькулятора домофонии
// ---------------------------------------------------------------------------

const MONITOR_STD = 'SC-INT-V007-2-LWB' // 7", Linux, Wi-Fi
const MONITOR_PREMIUM = 'SC-INT-V010-1-AWB' // 10", Android, Wi-Fi

/** PoE-коммутатор по числу портов. */
function switchForPorts(n: number): { sku: string; label: string } | null {
  if (n <= 0) return null
  if (n <= 8) return { sku: 'SC-8GP-120-2G(A)', label: 'PoE-коммутатор 8 портов, 120 Вт' }
  if (n <= 16) return { sku: 'SC-16GP-285-2G(A)', label: 'PoE-коммутатор 16 портов, 285 Вт' }
  return { sku: 'SC-24P-285-2G(A)', label: 'PoE-коммутатор 24 порта, 285 Вт' }
}

/** Управляемый PoE-коммутатор на подъезд (домофония + камеры этажа). */
function managedSwitchForPorts(n: number): { sku: string; label: string; qty: number } {
  if (n <= 8) return { sku: 'SC-L2-8GP-120-2G(A)', label: 'Управляемый PoE-коммутатор 8 портов, 120 Вт', qty: 1 }
  if (n <= 24) return { sku: 'SC-L2-24GP-285-4G(A)', label: 'Управляемый PoE-коммутатор 24 порта, 285 Вт', qty: 1 }
  return {
    sku: 'SC-L2-24GP-385-4G(A)',
    label: 'Управляемый PoE-коммутатор 24 порта, 385 Вт',
    qty: Math.ceil(n / 24),
  }
}

// ---------------------------------------------------------------------------
// Формы калькуляторов
// ---------------------------------------------------------------------------

function Counter({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  hint?: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)))
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#111112]">{label}</span>
        <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8de] bg-white">
          <button
            type="button"
            aria-label="Уменьшить"
            onClick={() => onChange(clamp(value - 1))}
            className="px-2.5 text-lg font-bold leading-none text-[#707075] transition-colors hover:bg-[#f4f6ec] hover:text-[#111112]"
          >
            −
          </button>
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            aria-label={label}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) onChange(clamp(n))
            }}
            className="w-14 border-x border-[#e6e8de] bg-white px-1 py-1.5 text-center text-sm font-semibold text-[#111112] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Увеличить"
            onClick={() => onChange(clamp(value + 1))}
            className="px-2.5 text-lg font-bold leading-none text-[#707075] transition-colors hover:bg-[#f4f6ec] hover:text-[#111112]"
          >
            +
          </button>
        </div>
      </div>
      {hint && <div className="mt-1 text-xs text-[#85878d]">{hint}</div>}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#111112]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] outline-none transition-colors focus:border-[#a6ce39]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ToggleField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#111112]">{label}</span>
        <div className="flex overflow-hidden rounded-lg border border-[#e6e8de]" role="group" aria-label={label}>
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
              value ? 'bg-[#a6ce39] text-black' : 'bg-white text-[#707075] hover:bg-[#f4f6ec]'
            }`}
          >
            Да
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
              !value ? 'bg-[#a6ce39] text-black' : 'bg-white text-[#707075] hover:bg-[#f4f6ec]'
            }`}
          >
            Нет
          </button>
        </div>
      </div>
      {hint && <div className="mt-1 text-xs text-[#85878d]">{hint}</div>}
    </div>
  )
}

/** Смета: позиции с ценами и предварительным бюджетом (с сравнением по МРЦ, если есть). */
function EstimateTable({ items, mrcOf }: { items: EstimateItem[]; mrcOf?: (sku: string) => number | null }) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0)
  const hasMrc = !!mrcOf && items.some((i) => mrcOf(i.sku) != null)
  const mrcTotal = items.reduce((s, i) => s + (mrcOf ? (mrcOf(i.sku) ?? i.price) : i.price) * i.qty, 0)
  return (
    <div>
      <ul className="divide-y divide-[#f0f1ea]">
        {items.map((i) => (
          <li key={i.sku} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <a
                href={`#/product/${i.id || slugFromSku(i.sku)}`}
                className="truncate text-sm font-semibold text-[#111112] hover:text-[#5c7a12] hover:underline"
              >
                {i.label}
              </a>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-[#707075]">
                <span className="font-mono">{i.sku}</span>
                {i.note && <span>· {i.note}</span>}
                <span>
                  · {i.qty} × {formatPrice(i.price)}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold text-[#111112]">{formatPrice(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t-2 border-[#a6ce39] pt-3">
        <div className="text-sm font-bold uppercase tracking-wide text-[#111112]">Предварительный бюджет</div>
        {hasMrc ? (
          <>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="text-sm text-[#707075]">Итого:</span>
              <span className="text-xl font-extrabold text-[#dc2626] line-through decoration-2">{formatPrice(total)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-[#111112]">Итого по ценам МРЦ:</span>
              <span className="text-xl font-extrabold text-[#5c7a12]">{formatPrice(mrcTotal)}</span>
            </div>
          </>
        ) : (
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-sm text-[#707075]">Итого:</span>
            <span className="text-xl font-extrabold text-[#5c7a12]">{formatPrice(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

type EstimateItem = { sku: string; label: string; qty: number; price: number; note?: string; id?: string }

// ---------------------------------------------------------------------------
// Калькулятор домофонии
// ---------------------------------------------------------------------------

function IntercomCalculator({ products }: { products: Product[] }) {
  const [objType, setObjType] = useState('cottage')
  const [entrances, setEntrances] = useState(1) // основные станции вызова
  const [extraStations, setExtraStations] = useState(0) // доп. станции (калитка/гараж)
  const [monitors, setMonitors] = useState(1) // абонентских устройств (коттедж)
  const [monitorClass, setMonitorClass] = useState('std')
  const [locksCottage, setLocksCottage] = useState(true)

  const [buildings, setBuildings] = useState(1) // зданий в комплексе
  const [porches, setPorches] = useState(1) // подъездов
  const [floors, setFloors] = useState(5)
  const [flats, setFlats] = useState(4) // квартир на этаже
  const [monPerFlat, setMonPerFlat] = useState(1)
  const [concierge, setConcierge] = useState(0)
  const [gates, setGates] = useState(0) // калиток/въездных групп
  const [scBox, setScBox] = useState(true)
  const [locksMkd, setLocksMkd] = useState(true)

  const pd = usePriceData()
  const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products])
  const priceOf = (sku: string) =>
    bySku.get(sku) ? livePrice(pd.prices, sku, pd.allowedIds, bySku.get(sku)!.price) ?? 0 : 0

  const items: EstimateItem[] = []
  const push = (sku: string, qty: number, label: string, note?: string) => {
    const p = bySku.get(sku)
    if (qty > 0 && p) items.push({ sku, label, qty, price: priceOf(sku), note, id: p.id })
  }

  const monitorSku = monitorClass === 'std' ? MONITOR_STD : MONITOR_PREMIUM
  const monitorLabel = `Абонентский монитор ${monitorClass === 'std' ? '7", Linux, Wi-Fi' : '10", Android, Wi-Fi'}`

  if (objType === 'cottage') {
    const stations = entrances + extraStations
    push('SC-INT-D100-1-MSB', entrances, 'Основная станция вызова (1 кнопка)', 'у входной двери')
    push('SC-INT-D100-2-MSB', extraStations, 'Дополнительная станция вызова', 'калитка / гараж / мастерская')
    push(monitorSku, monitors, monitorLabel, 'основное и доп. устройства')
    const sw = switchForPorts(stations + monitors)
    if (sw) push(sw.sku, 1, sw.label)
    if (locksCottage) {
      push('RL-EM280-L0S', stations, 'Электромагнитный замок R-Lock, 280 кг', 'на входные группы')
      push('RL-DCM-EN2-00S', stations, 'Доводчик двери R-Lock, EN2', 'на входные группы')
    }
  } else {
    const complexes = objType === 'zhk' ? buildings : 1
    const flatsPerPorch = floors * flats
    const panels = flatsPerPorch <= 8 ? 1 : Math.ceil(flatsPerPorch / 8)
    push(
      flatsPerPorch <= 4 ? 'SC-INT-D004-2-MFB' : 'SC-INT-D008-1-MFB',
      panels * porches * complexes,
      'Многоабонентская станция вызова',
      `${flatsPerPorch <= 4 ? 'до 4 абонентов' : 'до 8 абонентов'}, модульная сборка`,
    )
    push(monitorSku, porches * complexes * flatsPerPorch * monPerFlat, monitorLabel, 'в квартиры')
    push('SC-INT-V010-1-AXB', concierge, 'Терминал консьержа 10", Android', 'посты охраны/консьержа')
    const ports = panels + flatsPerPorch * monPerFlat + concierge
    const sw = managedSwitchForPorts(ports)
    push(sw.sku, sw.qty * porches * complexes, sw.label, 'на подъезд (VLAN домофонии)')
    if (scBox)
      push(
        'SC-Box-8GP-240-2G-UPS(A)',
        porches * complexes,
        'Всепогодный узел коммутации с ИБП',
        'уличный монтаж IP66',
      )
    if (locksMkd) {
      const locksQty = porches * complexes + gates
      push('RL-EM280-L0S', locksQty, 'Электромагнитный замок R-Lock, 280 кг', 'подъезды и калитки')
      push('RL-DCM-EN2-00S', locksQty, 'Доводчик двери R-Lock, EN2', 'подъезды и калитки')
    }
  }

  const isZhk = objType === 'zhk'
  const flatsPerPorch = floors * flats
  const poeDevices =
    (objType === 'cottage' ? 0 : panelModules(flatsPerPorch)) + flatsPerPorch * monPerFlat + concierge

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-xl border border-[#e6e8de] bg-white p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-[#111112]">
          <CalculatorIcon className="h-5 w-5 text-[#5c7a12]" aria-hidden /> Параметры объекта
        </h3>
        <div className="mt-4">
          <SelectField
            label="Тип объекта"
            value={objType}
            onChange={setObjType}
            options={[
              { value: 'cottage', label: 'Коттедж' },
              { value: 'mkd', label: 'Многоквартирный дом' },
              { value: 'zhk', label: 'Жилой комплекс' },
            ]}
          />
        </div>

        {objType === 'cottage' ? (
          <div className="mt-5 space-y-4">
            <Counter
              label="Входных групп (основные станции вызова)"
              value={entrances}
              min={1}
              max={3}
              onChange={setEntrances}
              hint="калитка считается отдельной станцией ниже"
            />
            <Counter
              label="Дополнительные станции вызова"
              value={extraStations}
              min={0}
              max={3}
              onChange={setExtraStations}
              hint="калитка, гараж, мастерская"
            />
            <Counter
              label="Абонентских устройств (мониторов)"
              value={monitors}
              min={1}
              max={6}
              onChange={setMonitors}
              hint="основное + дополнительные в помещениях"
            />
            <SelectField
              label="Класс мониторов"
              value={monitorClass}
              onChange={setMonitorClass}
              options={[
                { value: 'std', label: 'Стандарт (7", Linux)' },
                { value: 'premium', label: 'Премиум (10", Android)' },
              ]}
            />
            <ToggleField
              label="Замки и доводчики на входные группы"
              value={locksCottage}
              onChange={setLocksCottage}
              hint="электромагнитный замок R-Lock 280 кг + доводчик"
            />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {isZhk && (
              <Counter label="Зданий в комплексе" value={buildings} min={1} max={6} onChange={setBuildings} />
            )}
            <Counter label="Подъездов в здании" value={porches} min={1} max={12} onChange={setPorches} />
            <Counter label="Этажей" value={floors} min={1} max={25} onChange={setFloors} />
            <Counter
              label="Квартир на этаже"
              value={flats}
              min={1}
              max={10}
              onChange={setFlats}
              hint={isZhk ? `итого ${flatsPerPorch * porches * buildings} квартир` : `итого ${flatsPerPorch * porches} квартир`}
            />
            <Counter label="Мониторов в квартире" value={monPerFlat} min={1} max={2} onChange={setMonPerFlat} />
            <Counter
              label="Постов консьержа / охраны"
              value={concierge}
              min={0}
              max={5}
              onChange={setConcierge}
              hint='терминал 10", Android'
            />
            <Counter
              label="Калиток / въездных групп"
              value={gates}
              min={0}
              max={10}
              onChange={setGates}
              hint="для замков, если включены ниже"
            />
            <SelectField
              label="Класс мониторов"
              value={monitorClass}
              onChange={setMonitorClass}
              options={[
                { value: 'std', label: 'Стандарт (7", Linux)' },
                { value: 'premium', label: 'Премиум (10", Android)' },
              ]}
            />
            <ToggleField
              label="Уличные узлы коммутации SC-Box с ИБП"
              value={scBox}
              onChange={setScBox}
              hint="по одному на подъезд: IP66, ИБП, терморегулирование"
            />
            <ToggleField label="Замки и доводчики (подъезды + калитки)" value={locksMkd} onChange={setLocksMkd} />
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-xl border border-[#e6e8de] bg-[#f8faf1] p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-[#111112]">
          <FileText className="h-5 w-5 text-[#5c7a12]" aria-hidden /> Рекомендуемый комплект
        </h3>
        {objType !== 'cottage' && (
          <p className="mt-2 text-xs leading-relaxed text-[#707075]">
            Расчёт на подъезд: {flatsPerPorch} квартир, {panelModules(flatsPerPorch)} панел.
            {flatsPerPorch > 8 ? ` (${Math.ceil(flatsPerPorch / 8)} модуля)` : ''} {poeDevices} PoE-устройств.
            {isZhk && ` Комплекс: ${buildings} зд.`}
          </p>
        )}
        <div className="mt-4 rounded-xl border border-[#e6e8de] bg-white p-4">
          {items.length > 0 ? (
            <EstimateTable
              items={items}
              mrcOf={(sku) => {
                const mrcId = pd.types.find((t) => t.code === 'mrc')?.id ?? 8
                return pd.prices[normalizeSku(sku)]?.[String(mrcId)] ?? null
              }}
            />
          ) : (
            <p className="py-6 text-center text-sm text-[#707075]">
              Задайте параметры объекта — расчёт появится автоматически.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="default" href="#/where">
            Запросить точное КП <ArrowRight aria-hidden />
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden /> Печать расчёта
          </Button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[#85878d]">
          Расчёт предварительный, не является публичной офертой. Кабельная инфраструктура, монтаж, пусконаладка, ПО
          мобильного приложения и серверная часть рассчитываются проектным отделом под конкретный объект.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Конфигуратор коммутаторов
// ---------------------------------------------------------------------------

function SwitchConfigurator({ products }: { products: Product[] }) {
  const [poe, setPoe] = useState('any')
  const [budget, setBudget] = useState('any')
  const [mgmt, setMgmt] = useState('any')
  const [env, setEnv] = useState('any')
  const [sfp, setSfp] = useState('any')

  const pd = usePriceData()
  const models = useMemo(() => {
    return products
      .filter((p) => p.section === 'switches' && p.subcategory !== 'SFP-модули')
      .map((p) => {
        const poePorts = Number.parseInt(spec(p, 'PoE-порты'), 10) || 0
        const poeBudget =
          Number.parseInt(spec(p, 'Общая мощность PoE, Вт'), 10) || Number.parseInt(spec(p, 'Общая мощность PoE, Вт.'), 10) || 0
        const management = spec(p, 'Управление') || 'Неуправляемый'
        const environment = p.subcategory.startsWith('промышленные') ? 'Промышленный' : 'Настольный, 19"'
        const hasSfp =
          spec(p, 'Наличие SFP') === 'Да' ||
          (Number.parseInt(spec(p, 'Combo-порты'), 10) || 0) > 0 ||
          /GX|XG/i.test(p.sku)
        return {
          p,
          poePorts,
          budget: poeBudget,
          mgmt: management,
          env: environment,
          sfp: hasSfp,
          price: livePrice(pd.prices, p.sku, pd.allowedIds, p.price) ?? 0,
        }
      })
      .sort((a, b) => a.price - b.price)
      .filter((m) => {
        if (poe !== 'any' && m.poePorts < Number(poe)) return false
        if (budget !== 'any' && m.budget < Number(budget)) return false
        if (mgmt !== 'any' && m.mgmt !== mgmt) return false
        if (env !== 'any' && m.env !== env) return false
        if (sfp === 'yes' && !m.sfp) return false
        if (sfp === 'no' && m.sfp) return false
        return true
      })
  }, [products, poe, budget, mgmt, env, sfp, pd.prices, pd.allowedIds])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-xl border border-[#e6e8de] bg-white p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-[#111112]">
          <Layers className="h-5 w-5 text-[#5c7a12]" aria-hidden /> Параметры подбора
        </h3>
        <div className="mt-4 space-y-4">
          <SelectField
            label="Количество PoE-портов (минимум)"
            value={poe}
            onChange={setPoe}
            options={[{ value: 'any', label: 'Любое' }, ...['4', '8', '16', '24', '48'].map((v) => ({ value: v, label: `от ${v}` }))]}
          />
          <SelectField
            label="PoE-бюджет, Вт (минимум)"
            value={budget}
            onChange={setBudget}
            options={[
              { value: 'any', label: 'Любой' },
              ...['68', '120', '240', '285', '380', '480', '680'].map((v) => ({ value: v, label: `от ${v} Вт` })),
            ]}
          />
          <SelectField
            label="Тип управления"
            value={mgmt}
            onChange={setMgmt}
            options={[
              { value: 'any', label: 'Любой' },
              { value: 'Неуправляемый', label: 'Неуправляемый' },
              { value: 'Управляемый L2', label: 'Управляемый L2' },
              { value: 'Управляемый L2+', label: 'Управляемый L2+' },
              { value: 'Управляемый L3', label: 'Управляемый L3' },
            ]}
          />
          <SelectField
            label="Исполнение"
            value={env}
            onChange={setEnv}
            options={[
              { value: 'any', label: 'Любое' },
              { value: 'Настольный, 19"', label: 'Настольный / 19" стойка' },
              { value: 'Промышленный', label: 'Промышленное (−40…+85 °C)' },
            ]}
          />
          <SelectField
            label="Аплинки SFP / Combo"
            value={sfp}
            onChange={setSfp}
            options={[
              { value: 'any', label: 'Любые' },
              { value: 'yes', label: 'Нужны SFP' },
              { value: 'no', label: 'Только RJ45' },
            ]}
          />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[#85878d]">
          Подбор по реальным характеристикам каталога: количество PoE-портов, бюджет мощности, тип управления и
          климатическое исполнение берутся из спецификаций SpaceCam.
        </p>
      </div>

      <div className="rounded-xl border border-[#e6e8de] bg-[#f8faf1] p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-[#111112]">
          <Network className="h-5 w-5 text-[#5c7a12]" aria-hidden /> Подходящие модели
          <span className="rounded-full bg-[#a6ce39] px-2 py-0.5 text-xs font-bold text-black">
            {models.length}
          </span>
        </h3>
        <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
          {models.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#d8dcc8] bg-white p-8 text-center">
              <p className="text-sm font-semibold text-[#111112]">Ничего не найдено</p>
              <p className="mt-1 text-xs text-[#707075]">
                Ослабьте требования — например, уменьшите PoE-бюджет или снимите ограничение по исполнению.
              </p>
            </div>
          )}
          {models.map(({ p, poePorts, budget: b, mgmt: mg, env: en, sfp: hasSfp, price }) => (
            <a
              key={p.id}
              href={`#/product/${p.id}`}
              className="block rounded-xl border border-[#e6e8de] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#c9d69a] hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-[#5c7a12]">{p.sku}</div>
                  <div className="mt-0.5 truncate text-sm font-bold text-[#111112]">{p.title}</div>
                </div>
                <span className="shrink-0 text-base font-extrabold text-[#111112]">{formatPrice(price)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded bg-[#f4f8e4] px-1.5 py-0.5 text-[10px] font-medium text-[#4a6b12]">
                  {p.subcategory}
                </span>
                <span className="rounded bg-[#f4f6ec] px-1.5 py-0.5 text-[10px] font-medium text-[#4b4d45]">{mg}</span>
                {poePorts > 0 ? (
                  <span className="rounded bg-[#f4f6ec] px-1.5 py-0.5 text-[10px] font-medium text-[#4b4d45]">
                    PoE: {poePorts} порт.{b > 0 ? ` · ${b} Вт` : ''}
                  </span>
                ) : (
                  <span className="rounded bg-[#f4f6ec] px-1.5 py-0.5 text-[10px] font-medium text-[#4b4d45]">
                    без PoE
                  </span>
                )}
                {hasSfp && (
                  <span className="rounded bg-[#f4f6ec] px-1.5 py-0.5 text-[10px] font-medium text-[#4b4d45]">
                    SFP/Combo
                  </span>
                )}
                <span className="rounded bg-[#f4f6ec] px-1.5 py-0.5 text-[10px] font-medium text-[#4b4d45]">{en}</span>
              </div>
            </a>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-[#85878d]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a6ce39]" aria-hidden />
          Итоговый выбор за вами: карточка модели открывает полные характеристики, документы и фото.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Страница
// ---------------------------------------------------------------------------

export function SolutionsPage({ products }: { products: Product[] }) {
  const scrollTo = (id: string) => () =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // FR-2: прямая ссылка #/solutions?calc=okl открывает вкладку «Калькулятор ОКЛ»
  const [calc, setCalc] = useState<'intercom' | 'switches' | 'okl'>(() =>
    typeof window !== 'undefined' && window.location.hash.includes('calc=okl') ? 'okl' : 'intercom',
  )

  return (
    <>
      {/* Герой */}
      <section className="sc-pattern-dark bg-[#0b0b0c] py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-xs font-medium uppercase tracking-wider text-[#a6ce39]">Решения</div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Типовые решения и калькуляторы SpaceCam
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#b8bab0] sm:text-base">
            Готовые схемы организации домофонии, видеонаблюдения, СКУД и сетевой инфраструктуры — от коттеджа до
            жилого комплекса. Основа — корпоративный обзор «24 типовые схемы организации», дополненный линейками
            коммутаторов, узлов коммутации SC-Box и замков R-Lock.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="default" onClick={scrollTo('typical')}>
              Типовые решения <ArrowRight aria-hidden />
            </Button>
            <Button variant="darkOutline" onClick={scrollTo('calculators')}>
              Калькуляторы решений
            </Button>
          </div>
        </div>
      </section>

      {/* Калькуляторы */}
      <section id="calculators" className="bg-[#f5f6f1] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl">
            <div className="mb-3 h-1 w-12 rounded bg-[#a6ce39]" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight text-[#111112] sm:text-3xl">Калькуляторы решений</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#707075] sm:text-base">
              Предварительный расчёт состава и бюджета по реальному каталогу SpaceCam: цены и характеристики берутся
              из карточек товаров. Итог — ориентировочная смета и кнопка запроса коммерческого предложения.
            </p>
          </div>
          <div
            className="mb-6 flex flex-wrap overflow-hidden rounded-xl border border-[#e6e8de] bg-white max-w-full"
            role="tablist"
            aria-label="Калькуляторы"
          >
            <button
              type="button"
              role="tab"
              aria-selected={calc === 'intercom'}
              onClick={() => setCalc('intercom')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors sm:px-6 sm:py-2.5 sm:text-sm ${
                calc === 'intercom' ? 'bg-[#a6ce39] text-black' : 'text-[#707075] hover:bg-[#f4f6ec]'
              }`}
            >
              <Building2 className="h-4 w-4" aria-hidden /> Калькулятор домофонии
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={calc === 'switches'}
              onClick={() => setCalc('switches')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors sm:px-6 sm:py-2.5 sm:text-sm ${
                calc === 'switches' ? 'bg-[#a6ce39] text-black' : 'text-[#707075] hover:bg-[#f4f6ec]'
              }`}
            >
              <Network className="h-4 w-4" aria-hidden /> Конфигуратор коммутаторов
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={calc === 'okl'}
              onClick={() => setCalc('okl')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors sm:px-6 sm:py-2.5 sm:text-sm ${
                calc === 'okl' ? 'bg-[#a6ce39] text-black' : 'text-[#707075] hover:bg-[#f4f6ec]'
              }`}
            >
              <Flame className="h-4 w-4" aria-hidden /> Калькулятор ОКЛ
            </button>
          </div>
          {calc === 'intercom' ? (
            <IntercomCalculator products={products} />
          ) : calc === 'switches' ? (
            <SwitchConfigurator products={products} />
          ) : (
            <OklCalculator products={products} />
          )}
          <p className="mt-6 text-xs leading-relaxed text-[#85878d]">
            Все расчёты предварительные и не являются публичной офертой. Окончательная стоимость, комплектация и
            технические решения фиксируются в коммерческом предложении или договоре поставки.
          </p>
        </div>
      </section>

      {/* Типовые решения */}
      <section id="typical" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl">
            <div className="mb-3 h-1 w-12 rounded bg-[#a6ce39]" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight text-[#111112] sm:text-3xl">Типовые решения</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#707075] sm:text-base">
              Домофония для квартир и коттеджей — по схемам из обзора решений; видеонаблюдение, уличные узлы и СКУД —
              дополнены продукцией SpaceCam. В каждом решении — реальный состав оборудования из каталога.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {SOLUTIONS.map((sol) => (
              <SolutionCard key={sol.id} sol={sol} products={products} />
            ))}
          </div>
          <div className="mt-8 flex items-start gap-2 rounded-xl border border-[#e6e8de] bg-[#f8faf1] p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
            <p className="text-xs leading-relaxed text-[#707075]">
              Схемы и состав носят рекомендательный характер: точную конфигурацию (число этажных узлов, оптические
              линки, VLAN, питающие линии) рассчитывает проектный отдел. Изображения — концептуальные иллюстрации
              типовых схем, а не чертежи проекта.
            </p>
          </div>
        </div>
      </section>

      <Projects />

      {/* CTA */}
      <section className="bg-[#a6ce39]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">
              Нужен расчёт под ваш объект?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#3c4a17] sm:text-base">
              Проектный отдел SpaceCam рассчитает состав оборудования, бюджет PoE и схему сети по параметрам
              конкретного здания или территории.
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

// ---------------------------------------------------------------------------
// Карточка решения
// ---------------------------------------------------------------------------

function SolutionCard({ sol, products }: { sol: Solution; products: Product[] }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[#e6e8de] bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/9] overflow-hidden bg-[#f8faf1]">
        <img src={withBase(sol.img)} alt={sol.alt} loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-[#4a6b12] shadow-sm backdrop-blur">
          {SOLUTION_ICONS[sol.id]} {sol.tag}
        </span>
        <span
          className={`absolute right-3 top-3 rounded-md px-2 py-1 text-[10px] font-semibold shadow-sm ${
            sol.fromReview ? 'bg-[#a6ce39] text-black' : 'bg-[#111112] text-[#a6ce39]'
          }`}
        >
          {sol.fromReview ? 'Из обзора «24 схемы»' : 'Дополнено SpaceCam'}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="text-lg font-bold text-[#111112]">{sol.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#707075]">{sol.desc}</p>
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#85878d]">Состав решения</div>
          <ul className="mt-2 space-y-1.5">
            {sol.items.map((item) => {
              const p = item.sku ? products.find((x) => x.sku === item.sku) : undefined
              return (
                <li key={item.label} className="flex items-start gap-2 text-sm text-[#4b4d45]">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a6ce39]" aria-hidden />
                  {p ? (
                    <a
                      href={`#/product/${p.id}`}
                      className="hover:text-[#5c7a12] hover:underline"
                    >
                      {item.label}{' '}
                      <span className="font-mono text-xs text-[#85878d]">{p.sku}</span>
                    </a>
                  ) : (
                    <span>
                      {item.label}{' '}
                      {item.sku && <span className="font-mono text-xs text-[#85878d]">{item.sku}</span>}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {sol.links.map((l) => (
            <a
              key={l.href + l.label}
              href={l.href}
              className="inline-flex items-center gap-1 rounded-md border border-[#e6e8de] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111112] transition-colors hover:border-[#c9d69a] hover:bg-[#f4f6ec] hover:text-[#5c7a12]"
            >
              {l.label} <ArrowRight className="h-3 w-3" aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </article>
  )
}
