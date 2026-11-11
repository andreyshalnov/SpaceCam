'use client'

/**
 * «Калькулятор ОКЛ» — третья вкладка секции «Калькуляторы решений» (#/solutions).
 * Реализация ТЗ «Калькулятор ОКЛ» (v1.0, 11.11.2026), этапы 1–2:
 *  - подбор состава ОКЛ по матрице решений (FR-9…FR-11) из инструкции
 *    ОКЛ ПТК (Таблица 2.1) с реквизитами сертификатов ССБК RU.ПБ10.Н00466/Н00476;
 *  - инженерные проверки: Iдоп, ΔU, заполнение КНС, термическая стойкость (FR-12…FR-15);
 *  - спецификация со сметой из живого каталога SpaceCam (FR-17…FR-19);
 *  - экспорт PDF (печать), CSV/JSON, импорт JSON (FR-21…FR-23);
 *  - deep-link и проекты в localStorage (FR-24, FR-25);
 *  - мультилиния (FR-8), дисклеймеры (FR-20), нормативная база в UI (FR-28).
 *
 * Все нормативные числа — только из src/data/okl-matrix.json / okl-norms.json
 * (FR-16). Данные каталога — только src/data/products.json, фильтр section === 'ptk-okl'.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Flame,
  Info,
  Link2,
  MinusCircle,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { Button } from './ui'
import { formatPrice } from './router'
import { livePrice, usePriceData } from '@/lib/price-store'
import type { Product } from '@/data/site'
import {
  FIRE_TIME_OPTIONS,
  OKL_MATRIX,
  OKL_NORMS,
  buildSpec,
  checkAmpacity,
  checkThermal,
  checkVoltageDrop,
  decodeState,
  deepLink,
  deleteProject,
  encodeState,
  listProjects,
  markOptions,
  matchSolutions,
  saveProject,
  specHasQuery,
  specToCsv,
  specTotal,
  suggestAlternatives,
  type Check,
  type CheckStatus,
  type MatchedSolution,
  type OklLine,
  type OklProject,
  type SavedState,
} from '@/lib/okl/engine'

// ─────────────────────────────────────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────────────────────────────────────

let idSeq = 0
function newLine(): OklLine {
  idSeq += 1
  return {
    id: `okl-${Date.now()}-${idSeq}`,
    name: `Линия ${idSeq}`,
    surfaceId: 'concrete',
    catId: 'signal',
    mark: 'КПСнг(А)-FRLS',
    cert: 'N00466',
    crossSection: '1.5',
    cores: '1–4 пары; 2–8 жил',
    cableCount: 1,
    diameterMm: 0,
    lengthM: 50,
    fireTimeMin: 60,
    loadMode: 'power',
    loadW: 0,
    loadA: 0,
    phases: 1,
    voltage: 230,
    cosPhi: 1,
    ikzKA: 0,
    tripTimeS: 0.1,
    reservePct: OKL_NORMS.fastening.reservePct,
  }
}

function fmtQty(n: number): string {
  const r = Math.round(n * 100) / 100
  return r.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const CHECK_ICON: Record<CheckStatus, React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-[#b8860b]" aria-hidden />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-[#dc2626]" aria-hidden />,
  na: <MinusCircle className="h-4 w-4 shrink-0 text-[#85878d]" aria-hidden />,
}

const CHECK_LABEL: Record<CheckStatus, string> = {
  ok: 'Выполнено',
  warn: 'Требует внимания',
  fail: 'Не выполнено',
  na: 'Не проверяется',
}

// ─────────────────────────────────────────────────────────────────────────────
// Мини-компоненты формы
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium text-[#111112]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-snug text-[#85878d]">{hint}</span>}
    </label>
  )
}

function Select({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string | number
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  ariaLabel?: string
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="w-full rounded-lg border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] outline-none transition-colors focus:border-[#a6ce39]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  placeholder,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  placeholder?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value === 0 ? '' : value}
      placeholder={placeholder ?? '0'}
      min={min}
      step={step}
      onChange={(e) => onChange(Math.max(min, parseFloat(e.target.value) || 0))}
      className="w-full rounded-lg border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] outline-none transition-colors focus:border-[#a6ce39]"
    />
  )
}

function Chips({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: number; label: string }[]
  value: number
  onChange: (v: number) => void
  ariaLabel: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === o.value
              ? 'bg-[#a6ce39] text-black'
              : 'border border-[#e6e8de] bg-white text-[#707075] hover:bg-[#f4f6ec]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Основной компонент
// ─────────────────────────────────────────────────────────────────────────────

export function OklCalculator({ products }: { products: Product[] }) {
  const [lines, setLines] = useState<OklLine[]>([newLine()])
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [projects, setProjects] = useState<OklProject[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const pd = usePriceData()

  // FR-2/FR-24: прямая ссылка #/solutions?calc=okl&s=<state>
  useEffect(() => {
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    const s = q.get('s')
    if (s) {
      const st = decodeState(s)
      if (st) {
        setLines(st.lines.map((l) => ({ ...newLine(), ...l })))
        setSelected(st.selected ?? {})
        setToast('Расчёт загружен по ссылке')
      } else {
        setToast('Ссылка на расчёт повреждена — параметры сброшены')
      }
    }
    setProjects(listProjects())
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const oklProducts = useMemo(
    () => products.filter((p) => p.section === 'ptk-okl'),
    [products],
  )

  const priceOf = (sku: string, fallback: number | null): number | null =>
    livePrice(pd.prices, sku, pd.allowedIds, fallback)

  // решения по каждой линии
  const solutionsByLine = useMemo(() => {
    const map: Record<string, MatchedSolution[]> = {}
    for (const l of lines) map[l.id] = matchSolutions(l)
    return map
  }, [lines])

  const chosenByLine = useMemo(() => {
    const map: Record<string, MatchedSolution | undefined> = {}
    for (const l of lines) {
      const list = solutionsByLine[l.id] ?? []
      const sel = selected[l.id]
      map[l.id] = list.find((s) => s.system === sel) ?? list[0]
    }
    return map
  }, [lines, solutionsByLine, selected])

  const checksByLine = useMemo(() => {
    const map: Record<string, Check[]> = {}
    for (const l of lines) {
      const checks: Check[] = [checkAmpacity(l), checkVoltageDrop(l), checkThermal(l)]
      const sol = chosenByLine[l.id]
      if (sol?.knsPick.fillPct !== undefined) {
        checks.push({
          id: 'fill',
          title: 'Заполнение КНС',
          status: sol.knsPick.fillStatus ?? 'na',
          value: `${sol.knsPick.fillPct} %`,
          detail: sol.knsPick.fillNote ?? '',
          source:
            sol.system.startsWith('ЛМ')
              ? OKL_NORMS.fill.traySource
              : OKL_NORMS.fill.pipeSource,
        })
      } else if (sol) {
        checks.push({
          id: 'fill',
          title: 'Заполнение КНС',
          status: 'na',
          value: '—',
          detail: sol.knsPick.fillNote ?? 'КНС не применяется',
          source: OKL_NORMS.fill.traySource,
        })
      }
      map[l.id] = checks
    }
    return map
  }, [lines, chosenByLine])

  // спецификация/смета (агрегированная по линиям)
  const spec = useMemo(
    () => buildSpec(lines, chosenByLine, oklProducts),
    [lines, chosenByLine, oklProducts],
  )

  const pricedSpec = useMemo(
    () =>
      spec.map((it) => {
        const p = oklProducts.find((x) => x.id === it.sku)
        return { ...it, price: it.price === null ? null : priceOf(it.sku, it.price) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, oklProducts, pd.prices, pd.allowedIds],
  )

  const total = specTotal(pricedSpec)
  const hasQuery = specHasQuery(pricedSpec)

  const patchLine = (id: string, patch: Partial<OklLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const addLine = () => setLines((prev) => [...prev, newLine()])
  const duplicateLine = (id: string) =>
    setLines((prev) => {
      const src = prev.find((l) => l.id === id)
      if (!src) return prev
      idSeq += 1
      const copy: OklLine = { ...src, id: `okl-${Date.now()}-${idSeq}`, name: `${src.name} (копия)` }
      return [...prev, copy]
    })
  const removeLine = (id: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))

  const state: SavedState = { v: 1, lines, selected }

  const copyLink = async () => {
    const link = deepLink(state)
    try {
      await navigator.clipboard.writeText(link)
      setToast('Ссылка на расчёт скопирована')
    } catch {
      window.prompt('Скопируйте ссылку на расчёт:', link)
    }
  }

  const exportCsv = () => {
    const meta = [
      `SpaceCam — спецификация ОКЛ (${new Date().toLocaleDateString('ru-RU')})`,
      `Матрица решений: ${OKL_MATRIX.version} от ${OKL_MATRIX.generated}; Нормативная база: ${OKL_NORMS.version} от ${OKL_NORMS.generated}`,
      ...lines.map(
        (l) =>
          `${l.name}: ${OKL_MATRIX.surfaces.find((x) => x.id === l.surfaceId)?.title ?? ''}; ${l.mark} (${l.cert}); время ≥ ${l.fireTimeMin} мин; ${chosenByLine[l.id]?.system ?? '—'}; L=${l.lengthM} м`,
      ),
      `Итого по смете: ${total.toFixed(2)} ₽`,
      OKL_NORMS.disclaimer,
    ]
    downloadFile(`spacecam-okl-spec-${new Date().toISOString().slice(0, 10)}.csv`, specToCsv(pricedSpec, meta), 'text/csv;charset=utf-8')
    setToast('CSV сохранён')
  }

  const exportJson = () => {
    downloadFile(
      `spacecam-okl-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ ...state, meta: { version: OKL_MATRIX.version, generated: OKL_MATRIX.generated, date: new Date().toISOString() } }, null, 1),
      'application/json',
    )
    setToast('JSON сохранён')
  }

  const importJson = (file: File) => {
    file
      .text()
      .then((txt) => {
        const obj = JSON.parse(txt)
        const st = obj && obj.v === 1 && Array.isArray(obj.lines) ? decodeState(encodeState({ v: 1, lines: obj.lines, selected: obj.selected ?? {} })) : null
        if (!st) throw new Error('bad')
        setLines(st.lines.map((l) => ({ ...newLine(), ...l })))
        setSelected(st.selected ?? {})
        setToast('Расчёт загружен из файла')
      })
      .catch(() => setToast('Файл не распознан: нужен JSON, сохранённый калькулятором'))
  }

  const saveProjectAs = () => {
    const name = window.prompt('Название проекта:', `Расчёт от ${new Date().toLocaleDateString('ru-RU')}`)
    if (!name) return
    const ok = saveProject({
      name,
      date: new Date().toLocaleDateString('ru-RU'),
      state,
    })
    setProjects(listProjects())
    setToast(ok === 'ok' ? `Проект «${name}» сохранён` : 'Не удалось сохранить: переполнено хранилище браузера')
  }

  const loadProject = (p: OklProject) => {
    setLines(p.state.lines.map((l) => ({ ...newLine(), ...l })))
    setSelected(p.state.selected ?? {})
    setToast(`Проект «${p.name}» загружен`)
  }

  const mailtoHref = useMemo(() => {
    const body = [
      'Запрос коммерческого предложения по спецификации ОКЛ PTK-Line',
      '',
      ...lines.map((l) => `${l.name}: ${l.mark}, ${OKL_MATRIX.surfaces.find((x) => x.id === l.surfaceId)?.title}, ≥${l.fireTimeMin} мин, L=${l.lengthM} м → ${chosenByLine[l.id]?.system ?? '-'}`),
      '',
      ...pricedSpec.map((s) => `${s.sku}; ${s.label}; ${fmtQty(s.qty)} ${s.unit}; ${s.price === null ? 'Цена по запросу' : `${fmtQty(s.price)} ₽`}`),
      `Итого: ${fmtQty(total)} ₽`,
    ].join('\n')
    return `mailto:support@layta.ru?subject=${encodeURIComponent('Запрос КП: спецификация ОКЛ PTK-Line')}&body=${encodeURIComponent(body.slice(0, 1800))}`
  }, [lines, chosenByLine, pricedSpec, total])

  return (
    <div className="space-y-6">
      {toast && (
        <div role="status" className="rounded-xl border border-[#c9d69a] bg-[#f8faf1] px-4 py-2.5 text-sm font-medium text-[#3c4a17]">
          {toast}
        </div>
      )}

      {/* Шапка калькулятора */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[#111112]">
            <Flame className="h-5 w-5 text-[#5c7a12]" aria-hidden />
            Подбор огнестойкой кабельной линии (ОКЛ) PTK-Line
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[#707075]">
            Способ прокладки, кабель и требуемое время работоспособности — калькулятор подберёт состав
            линии по Таблице 2.1 инструкции ОКЛ ПТК (сертификаты ССБК RU.ПБ10.Н00466 и RU.ПБ10.Н00476),
            выполнит проверки и соберёт спецификацию с ценами каталога.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="default" onClick={addLine}>
            <Plus aria-hidden /> Добавить линию
          </Button>
          <Button variant="outline" onClick={() => { setLines([newLine()]); setSelected({}); setToast('Расчёт сброшен') }}>
            Сбросить
          </Button>
        </div>
      </div>

      {/* Линии */}
      <div className="space-y-5">
        {lines.map((l) => {
          const solutions = solutionsByLine[l.id] ?? []
          const chosen = chosenByLine[l.id]
          const checks = checksByLine[l.id] ?? []
          const alts = suggestAlternatives(l)
          const isPower = l.catId === 'power' || l.catId === 'control'
          const markList = markOptions(l.catId)
          return (
            <article key={l.id} className="rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-5">
              {/* заголовок линии */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#a6ce39]/20 px-2 py-1 text-xs font-bold text-[#3c4a17]">
                  {lines.indexOf(l) + 1}
                </span>
                <input
                  value={l.name}
                  onChange={(e) => patchLine(l.id, { name: e.target.value })}
                  aria-label="Название линии"
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-bold text-[#111112] hover:border-[#e6e8de] focus:border-[#a6ce39] focus:outline-none"
                />
                <div className="flex gap-1 print:hidden">
                  <button type="button" onClick={() => duplicateLine(l.id)} aria-label="Дублировать линию" title="Дублировать"
                    className="rounded-md p-1.5 text-[#707075] hover:bg-[#f4f6ec] hover:text-[#111112]">
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => removeLine(l.id)} aria-label="Удалить линию" title="Удалить"
                    className="rounded-md p-1.5 text-[#707075] hover:bg-[#fee2e2] hover:text-[#dc2626]">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              {/* форма линии */}
              <div className="grid grid-cols-1 gap-x-5 gap-y-3.5 md:grid-cols-2 xl:grid-cols-3 print:hidden">
                <Field label="Способ прокладки / поверхность" hint={OKL_MATRIX.methodGroups[OKL_MATRIX.surfaces.find((x) => x.id === l.surfaceId)?.group ?? 'G1']?.slice(0, 90) + '…'}>
                  <Select
                    ariaLabel="Способ прокладки"
                    value={l.surfaceId}
                    onChange={(v) => patchLine(l.id, { surfaceId: v })}
                    options={OKL_MATRIX.surfaces.map((s) => ({ value: s.id, label: s.title }))}
                  />
                </Field>
                <Field label="Тип кабеля">
                  <Select
                    ariaLabel="Тип кабеля"
                    value={l.catId}
                    onChange={(v) => {
                      const first = markOptions(v)[0]
                      patchLine(l.id, { catId: v, mark: first?.mark ?? '', cert: first?.cert ?? l.cert })
                    }}
                    options={Object.entries(OKL_MATRIX.cableCategories).map(([k, v]) => ({ value: k, label: v.title }))}
                  />
                </Field>
                <Field label="Марка кабеля (по сертификату ОКЛ)">
                  <Select
                    ariaLabel="Марка кабеля"
                    value={l.mark}
                    onChange={(v) => {
                      const opt = markList.find((m) => m.mark === v)
                      patchLine(l.id, { mark: v, cert: opt?.cert ?? l.cert })
                    }}
                    options={markList.map((m) => ({ value: m.mark, label: `${m.mark} — ${m.producer}` }))}
                  />
                </Field>
                {isPower && (
                  <Field label="Сечение жилы, мм²" hint="для проверки Iдоп и ΔU (ГОСТ 31996-2012, табл. 19)">
                    <Select
                      ariaLabel="Сечение жилы"
                      value={l.crossSection}
                      onChange={(v) => patchLine(l.id, { crossSection: v })}
                      options={Object.keys(OKL_NORMS.ampacity.table).map((s) => ({ value: s, label: `${s} мм²` }))}
                    />
                  </Field>
                )}
                <Field label="Требуемое время работоспособности" hint="ФЗ-123 ст. 82: линия СПЗ должна сохранять работоспособность на время выполнения функций; уточняется проектом">
                  <Chips
                    ariaLabel="Время работоспособности"
                    options={FIRE_TIME_OPTIONS.map((t) => ({ value: t, label: `Е${t}` }))}
                    value={l.fireTimeMin}
                    onChange={(v) => patchLine(l.id, { fireTimeMin: v })}
                  />
                </Field>
                <Field label="Кабелей в линии (пучке)" hint={isPower ? 'влияет на Iдоп (пучки по табл. C.52.15)' : 'число кабелей, прокладываемых совместно'}>
                  <Chips
                    ariaLabel="Кабелей в линии"
                    options={[1, 2, 3, 4, 6, 8, 12].map((n) => ({ value: n, label: String(n) }))}
                    value={l.cableCount}
                    onChange={(v) => patchLine(l.id, { cableCount: v })}
                  />
                </Field>
                <Field label="Наружный диаметр кабеля, мм" hint="по маркировке производителя; 0 — не указан (подбор КНС недоступен)">
                  <NumberInput value={l.diameterMm} step={0.1} onChange={(v) => patchLine(l.id, { diameterMm: v })} placeholder="например 8.4" />
                </Field>
                <Field label="Длина линии, м">
                  <NumberInput value={l.lengthM} step={1} min={0} onChange={(v) => patchLine(l.id, { lengthM: v })} />
                </Field>
                <Field label="Запас крепежа, %" hint={OKL_NORMS.fastening.reserveSource}>
                  <NumberInput value={l.reservePct} step={5} onChange={(v) => patchLine(l.id, { reservePct: v })} />
                </Field>
                {isPower && (
                  <>
                    <Field label="Режим нагрузки">
                      <Select
                        ariaLabel="Режим нагрузки"
                        value={l.loadMode}
                        onChange={(v) => patchLine(l.id, { loadMode: v as OklLine['loadMode'] })}
                        options={[
                          { value: 'power', label: 'Мощность, Вт' },
                          { value: 'current', label: 'Ток, А' },
                        ]}
                      />
                    </Field>
                    {l.loadMode === 'power' ? (
                      <Field label="Мощность нагрузки, Вт">
                        <NumberInput value={l.loadW} step={50} onChange={(v) => patchLine(l.id, { loadW: v })} />
                      </Field>
                    ) : (
                      <Field label="Ток нагрузки, А">
                        <NumberInput value={l.loadA} step={0.5} onChange={(v) => patchLine(l.id, { loadA: v })} />
                      </Field>
                    )}
                    <Field label="Число фаз">
                      <Select
                        ariaLabel="Число фаз"
                        value={String(l.phases)}
                        onChange={(v) => patchLine(l.id, { phases: Number(v) === 3 ? 3 : 1 })}
                        options={[{ value: '1', label: '1ф (230 В)' }, { value: '3', label: '3ф (400 В)' }]}
                      />
                    </Field>
                    <Field label="cos φ">
                      <Select
                        ariaLabel="cos phi"
                        value={String(l.cosPhi)}
                        onChange={(v) => patchLine(l.id, { cosPhi: Number(v) })}
                        options={[1, 0.9, 0.8, 0.7].map((c) => ({ value: String(c), label: String(c) }))}
                      />
                    </Field>
                  </>
                )}
              </div>

              {/* эксперт: ток КЗ */}
              {isPower && (
                <details className="mt-3 rounded-lg border border-[#e6e8de] bg-[#f8faf1] px-3.5 py-2.5 print:hidden">
                  <summary className="cursor-pointer text-sm font-semibold text-[#111112]">
                    Эксперт: проверка термической стойкости (ток КЗ)
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Ток КЗ, кА" hint="при необходимости, по данным проекта">
                      <NumberInput value={l.ikzKA} step={0.5} onChange={(v) => patchLine(l.id, { ikzKA: v })} />
                    </Field>
                    <Field label="Время срабатывания защиты, с">
                      <NumberInput value={l.tripTimeS} step={0.05} onChange={(v) => patchLine(l.id, { tripTimeS: v })} />
                    </Field>
                  </div>
                </details>
              )}

              {/* результат подбора */}
              <div className="mt-4 rounded-xl border border-[#e6e8de] bg-[#f5f6f1] p-3.5 sm:p-4">
                <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#3c4a17]">
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Состав ОКЛ по Таблице 2.1 инструкции ПТК
                </h4>
                {solutions.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-[#f3d5d5] bg-[#fdf7f7] p-3.5">
                    <p className="text-sm font-semibold text-[#dc2626]">
                      Решений не найдено: для «{markList.find((m) => m.mark === l.mark)?.mark ?? l.mark}» и выбранного
                      способа прокладки нет сертификатного варианта на ≥ {l.fireTimeMin} мин.
                    </p>
                    {alts.length > 0 && (
                      <div className="mt-2.5">
                        <p className="text-xs text-[#707075]">Доступное время работоспособности для этой пары «марка × способ прокладки»:</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {alts.map((a) => (
                            <button
                              key={a.timeMin}
                              type="button"
                              onClick={() => patchLine(l.id, { fireTimeMin: Math.min(a.timeMin, 180) })}
                              className="rounded-md border border-[#e6e8de] bg-white px-2.5 py-1 text-xs font-semibold text-[#111112] hover:border-[#c9d69a] hover:bg-[#f4f6ec]"
                            >
                              Е{a.timeMin} · {a.timeMin} мин ({a.count} вар.)
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Варианты состава ОКЛ">
                      {solutions.map((s) => {
                        const active = chosen?.system === s.system
                        const warn = (checksByLine[l.id]?.find((c) => c.id === 'fill')?.status === 'fail')
                        return (
                          <button
                            key={s.system}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelected((prev) => ({ ...prev, [l.id]: s.system }))}
                            className={`rounded-lg px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                              active ? 'bg-[#a6ce39] text-black' : 'border border-[#e6e8de] bg-white text-[#707075] hover:bg-[#f4f6ec]'
                            }`}
                          >
                            <span className="block">PTK-Line-{s.system}</span>
                            <span className={`block text-[11px] font-medium ${active ? 'text-black/70' : 'text-[#85878d]'}`}>
                              {s.limit} · {s.minutes} мин{warn && s.knsPick.fillStatus === 'fail' ? ' · КНС!' : ''}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {chosen && (
                      <div className="rounded-lg border border-[#e6e8de] bg-white p-3.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-bold text-[#111112]">
                            PTK-Line-{chosen.system} — {chosen.systemTitle}
                          </p>
                          <span className="rounded-md bg-[#a6ce39]/20 px-2 py-0.5 text-xs font-bold text-[#3c4a17]">
                            {chosen.limit} · не менее {chosen.minutes} мин
                          </span>
                        </div>
                        {chosen.knsPick.size ? (
                          <p className="mt-1.5 text-sm text-[#4b4d45]">
                            КНС:{' '}
                            {'d' in chosen.knsPick.size
                              ? `Ø${chosen.knsPick.size.d} мм`
                              : `${chosen.knsPick.size.w}×${chosen.knsPick.size.h} мм`}{' '}
                            ({chosen.knsPick.size.sku}) — {chosen.knsPick.fillNote ?? ''}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-sm text-[#4b4d45]">{chosen.knsPick.fillNote}</p>
                        )}
                        <p className="mt-1 text-xs text-[#707075]">
                          Кабель: {l.mark} · {chosen.producer} · {chosen.tu}
                        </p>
                        <details className="mt-2" >
                          <summary className="cursor-pointer text-xs font-semibold text-[#5c7a12] hover:underline">
                            Почему так: сертификат и источник
                          </summary>
                          <div className="mt-1.5 space-y-1 text-xs leading-relaxed text-[#707075]">
                            <p>
                              Сертификат ОКЛ: {OKL_MATRIX.certificates[chosen.cert].reg} ({OKL_MATRIX.certificates[chosen.cert].std}),
                              срок действия {OKL_MATRIX.certificates[chosen.cert].validFrom} — {OKL_MATRIX.certificates[chosen.cert].validTo}.{' '}
                              <a href={OKL_MATRIX.certificates[chosen.cert].url} className="text-[#5c7a12] underline" target="_blank" rel="noreferrer">
                                Открыть скан сертификата
                              </a>
                            </p>
                            <p>Источник матрицы: {OKL_MATRIX.source.title}.</p>
                            {chosen.note && <p>Примечание инструкции: {chosen.note}</p>}
                            <p>
                              Сертификаты проверять на актуальность; производитель вправе изменять состав ОКЛ —
                              при монтаже сверяться с инструкцией {OKL_MATRIX.certificates[chosen.cert].instruction}.
                            </p>
                          </div>
                        </details>
                      </div>
                    )}

                    {/* проверки */}
                    <ul className="space-y-1.5">
                      {checks.map((c) => (
                        <li key={c.id} className="rounded-lg border border-[#e6e8de] bg-white px-3 py-2">
                          <div className="flex items-start gap-2">
                            {CHECK_ICON[c.status]}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#111112]">
                                {c.title}: <span className="font-medium text-[#4b4d45]">{c.value}</span>
                                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  c.status === 'ok' ? 'bg-[#eef4df] text-[#4a6b12]'
                                    : c.status === 'warn' ? 'bg-[#faf3e0] text-[#b8860b]'
                                    : c.status === 'fail' ? 'bg-[#fdeaea] text-[#dc2626]'
                                    : 'bg-[#f0f1ea] text-[#85878d]'
                                }`}>
                                  {CHECK_LABEL[c.status]}
                                </span>
                              </p>
                              <p className="mt-0.5 text-xs leading-snug text-[#707075]">{c.detail}</p>
                              {c.recommendation && (
                                <p className="mt-0.5 text-xs font-semibold text-[#b8860b]">{c.recommendation}</p>
                              )}
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[11px] text-[#85878d] hover:text-[#5c7a12]">
                                  обоснование и источник
                                </summary>
                                <p className="mt-1 text-[11px] leading-snug text-[#85878d]">{c.source}</p>
                              </details>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* Спецификация и смета */}
      <section className="rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-6" aria-label="Спецификация ОКЛ">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[#111112]">
            <FileText className="h-5 w-5 text-[#5c7a12]" aria-hidden /> Спецификация и предварительная смета
          </h3>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden /> PDF / печать
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download aria-hidden /> CSV
            </Button>
            <Button variant="outline" onClick={exportJson}>
              <Download aria-hidden /> JSON
            </Button>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#e6e8de] bg-white px-4 py-2 text-sm font-medium text-[#111112] shadow-xs transition-colors hover:bg-[#f4f6ec]">
              <Upload aria-hidden className="h-4 w-4" /> Импорт JSON
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) importJson(f)
                  e.currentTarget.value = ''
                }}
              />
            </label>
            <Button variant="outline" onClick={copyLink}>
              <Link2 aria-hidden /> Ссылка на расчёт
            </Button>
          </div>
        </div>

        {pricedSpec.length === 0 ? (
          <p className="mt-5 rounded-lg bg-[#f5f6f1] px-4 py-6 text-center text-sm text-[#707075]">
            Задайте параметры линии и выберите состав ОКЛ — спецификация соберётся автоматически из каталога
            SpaceCam (артикулы, количества, цены).
          </p>
        ) : (
          <>
            {/* мобильный: горизонтальный скролл */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-[#a6ce39] text-xs uppercase tracking-wide text-[#85878d]">
                    <th className="py-2 pr-3 font-semibold">Наименование</th>
                    <th className="py-2 pr-3 font-semibold">Артикул</th>
                    <th className="py-2 pr-3 text-right font-semibold">Кол-во</th>
                    <th className="py-2 pr-3 font-semibold">Ед.</th>
                    <th className="py-2 pr-3 text-right font-semibold">Цена</th>
                    <th className="py-2 text-right font-semibold">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {(['КНС и кабеленесущие системы', 'Коробки монтажные огнестойкие', 'Крепёж и держатели', 'Метизы'] as const).map(
                    (grp) => {
                      const rows = pricedSpec.filter((s) => s.group === grp)
                      if (!rows.length) return null
                      return (
                        <React.Fragment key={grp}>
                          <tr>
                            <td colSpan={6} className="pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-[#5c7a12]">
                              {grp}
                            </td>
                          </tr>
                          {rows.map((it) => (
                            <tr key={it.sku} className="border-b border-[#f0f1ea]">
                              <td className="py-2 pr-3">
                                <a href={`#/product/${it.sku}`} className="font-semibold text-[#111112] hover:text-[#5c7a12] hover:underline">
                                  {it.label}
                                </a>
                                {it.note && <div className="text-xs text-[#85878d]">{it.note}</div>}
                              </td>
                              <td className="py-2 pr-3 font-mono text-xs text-[#707075]">{it.sku}</td>
                              <td className="py-2 pr-3 text-right font-medium">{fmtQty(it.qty)}</td>
                              <td className="py-2 pr-3 text-[#707075]">{it.unit}</td>
                              <td className="py-2 pr-3 text-right">
                                {it.price === null ? (
                                  <span className="text-[#85878d]">Цена по запросу</span>
                                ) : (
                                  formatPrice(it.price)
                                )}
                              </td>
                              <td className="py-2 text-right font-bold text-[#111112]">
                                {it.price === null ? '—' : formatPrice(it.price * it.qty)}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    },
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#a6ce39]">
                    <td colSpan={5} className="py-3 text-sm font-bold uppercase tracking-wide text-[#111112]">
                      Итого по смете{hasQuery ? ' (без позиций «по запросу»)' : ''}
                    </td>
                    <td className="py-3 text-right text-xl font-extrabold text-[#5c7a12]">{formatPrice(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 print:hidden">
              <Button variant="default" href="#/where">
                Запросить КП по спецификации <ArrowRight aria-hidden />
              </Button>
              <Button variant="outline" href={mailtoHref}>
                Отправить в отдел продаж (e-mail)
              </Button>
              <Button variant="outline" onClick={saveProjectAs}>
                <Save aria-hidden /> Сохранить проект
              </Button>
            </div>

            {/* проекты в localStorage */}
            {projects.length > 0 && (
              <details className="mt-3 rounded-lg border border-[#e6e8de] bg-[#f8faf1] px-3.5 py-2.5 print:hidden">
                <summary className="cursor-pointer text-sm font-semibold text-[#111112]">
                  Мои проекты расчётов ({projects.length})
                </summary>
                <ul className="mt-2.5 space-y-1.5">
                  {projects.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-3 rounded-lg border border-[#e6e8de] bg-white px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[#111112]">{p.name}</span>
                        <span className="block text-xs text-[#85878d]">сохранён {p.date} · линий: {p.state.lines.length}</span>
                      </span>
                      <span className="flex shrink-0 gap-1.5">
                        <button type="button" onClick={() => loadProject(p)} className="rounded-md border border-[#e6e8de] bg-white px-2.5 py-1 text-xs font-semibold text-[#111112] hover:bg-[#f4f6ec]">
                          Загрузить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteProject(p.name)
                            setProjects(listProjects())
                          }}
                          aria-label={`Удалить проект ${p.name}`}
                          className="rounded-md p-1.5 text-[#707075] hover:bg-[#fee2e2] hover:text-[#dc2626]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {/* Дисклеймер + нормативная база */}
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#e6e8de] bg-[#f8faf1] p-4 print:block">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5c7a12]" aria-hidden />
          <div className="text-xs leading-relaxed text-[#707075]">
            <p>{OKL_NORMS.disclaimer}</p>
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-[#3c4a12] hover:underline">
                Нормативная база расчёта (версия {OKL_NORMS.version} от {OKL_NORMS.generated})
              </summary>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {OKL_NORMS.normativeBase.map((d) => (
                  <li key={d.doc}>
                    <span className="font-semibold text-[#4b4d45]">{d.doc}</span> — {d.about}
                  </li>
                ))}
                <li>
                  <span className="font-semibold text-[#4b4d45]">Матрица решений</span> — {OKL_MATRIX.source.title}; версия{' '}
                  {OKL_MATRIX.version} от {OKL_MATRIX.generated}.{' '}
                  <a href={OKL_MATRIX.source.url} target="_blank" rel="noreferrer" className="text-[#5c7a12] underline">
                    Инструкция ОКЛ (ptcab.ru)
                  </a>
                </li>
              </ul>
            </details>
          </div>
        </div>
      </section>

      {/* Печатная версия отчёта (FR-21) */}
      <div id="okl-print" className="hidden print:block">
        <style
          dangerouslySetInnerHTML={{
            __html:
              '@media print { body * { visibility: hidden !important; } #okl-print, #okl-print * { visibility: visible !important; } #okl-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 8mm; } @page { margin: 10mm; } }',
          }}
        />
        <p className="text-lg font-extrabold">SpaceCam — расчёт огнестойкой кабельной линии (ОКЛ) PTK-Line</p>
        <p className="mt-0.5 text-xs text-[#707075]">
          Дата: {new Date().toLocaleDateString('ru-RU')} · матрица {OKL_MATRIX.version} ({OKL_MATRIX.generated}) · нормы{' '}
          {OKL_NORMS.version} ({OKL_NORMS.generated})
        </p>
        {lines.map((l, i) => {
          const sol = chosenByLine[l.id]
          const surf = OKL_MATRIX.surfaces.find((x) => x.id === l.surfaceId)
          return (
            <div key={l.id} className="mt-3 border-t border-[#e6e8de] pt-2 text-xs">
              <p className="font-bold">
                {i + 1}. {l.name}
              </p>
              <p>
                Прокладка: {surf?.title} ({OKL_MATRIX.methodGroups[surf?.group ?? 'G1']}); кабель {l.mark} ({l.cert});
                требуемое время ≥ {l.fireTimeMin} мин; длина {l.lengthM} м; кабелей {l.cableCount}
                {l.diameterMm ? `; Ø${l.diameterMm} мм` : ''}; состав: PTK-Line-{sol?.system ?? '—'} ({sol?.limit},{' '}
                {sol?.minutes} мин)
              </p>
              {sol && (
                <p className="text-[#707075]">
                  Обоснование: {OKL_MATRIX.certificates[sol.cert].reg}, {OKL_MATRIX.certificates[sol.cert].std}, срок{' '}
                  {OKL_MATRIX.certificates[sol.cert].validFrom}—{OKL_MATRIX.certificates[sol.cert].validTo}; {sol.tu}
                </p>
              )}
              <ul className="mt-1 space-y-0.5">
                {(checksByLine[l.id] ?? []).map((c) => (
                  <li key={c.id}>
                    {CHECK_LABEL[c.status]}: {c.title} — {c.value}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-black/40 font-bold">
              <th className="py-1 pr-2">Наименование</th>
              <th className="py-1 pr-2">Артикул</th>
              <th className="py-1 pr-2">Кол-во</th>
              <th className="py-1">Цена / Сумма</th>
            </tr>
          </thead>
          <tbody>
            {pricedSpec.map((it) => (
              <tr key={it.sku} className="align-top">
                <td className="py-1 pr-2">{it.label}</td>
                <td className="py-1 pr-2">{it.sku}</td>
                <td className="py-1 pr-2">
                  {fmtQty(it.qty)} {it.unit}
                </td>
                <td className="py-1">
                  {it.price === null ? 'Цена по запросу' : `${fmtQty(it.price)} ₽ / ${fmtQty(it.price * it.qty)} ₽`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 font-bold">Итого по смете: {fmtQty(total)} ₽</p>
        <p className="mt-2 text-[10px] leading-snug text-[#707075]">{OKL_NORMS.disclaimer}</p>
      </div>
    </div>
  )
}
