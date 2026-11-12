'use client'

// Форма и карточка просмотра «Объект строительства».
// Адресный автокомплит — DaData (справочник ФИАС): ключ задаёт администратор
// в настройках раздела; без ключа адрес работает как обычное поле ввода.

import React, { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  FileDown,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  Account,
  AddressSuggestion,
  CURRENCIES,
  CURRENCY_SIGN,
  FormData,
  OBJECT_STATUSES,
  ObjectSpec,
  Project,
  PROTECTION_OPTIONS,
  SOURCE_OPTIONS,
  ValidationErrors,
  fetchAddressSuggestions,
  formatDateInput,
  formatRuMoney,
  ruDateTime,
  specToText,
} from '@/lib/registry'
import { Button } from './ui'

export const INPUT_CLS =
  'w-full rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm text-[#111112] placeholder:text-[#a3a5ab] outline-none transition-colors focus:border-[#a6ce39] focus:ring-2 focus:ring-[#a6ce39]/25'

export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[#111112]">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
        {children}
      </label>
      {hint && !error && <p className="mt-1 text-xs leading-snug text-[#707075]">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

// Цвета бейджа статуса (те же классы использует список в project-registry.tsx)
const STATUS_BADGE: Record<string, string> = {
  Новый: 'bg-sky-50 text-sky-700',
  'В работе': 'bg-amber-50 text-amber-700',
  Реализация: 'bg-emerald-50 text-emerald-700',
  'Объект оснащен': 'bg-[#e7f0fb] text-[#1d4f91]',
  Заморожен: 'bg-gray-100 text-gray-600',
  Отклонен: 'bg-red-50 text-red-600',
}

// Сумма в ₽: 530162.25 → «530 162,25 ₽»
function rub(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return ''
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'
}

// Данные бренд-строки CRM (импорт выгрузки 1С 12.11.2026): план/факт/прибыль и ответственные
function renderSpecExtra(s: ObjectSpec): React.ReactNode {
  const e = s.extra
  if (!e && s.sum == null) return null
  const money: Array<[string, number | undefined]> = [
    ['План', s.sum ?? undefined],
    ['Факт', e?.fact],
    ['Осталось отгрузить', e?.remain],
    ['Валовая прибыль', e?.profit],
  ]
  const people: Array<[string, string | undefined]> = [
    ['Техспециалист', e?.tech],
    ['Поставщик', e?.supplier],
    ['Закупщик', e?.buyer],
  ]
  return (
    <div className="mt-2 space-y-1 border-t border-[#f0f1ea] pt-2">
      {(money.some(([, v]) => v != null) || e?.margin != null) && (
        <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs text-[#4b4d45]">
          {money
            .filter(([, v]) => v != null)
            .map(([k, v]) => (
              <span key={k}>
                <span className="text-[#707075]">{k}:</span>{' '}
                <span className="font-semibold text-[#111112]">{rub(v)}</span>
              </span>
            ))}
          {e?.margin != null && (
            <span>
              <span className="text-[#707075]">Рентабельность:</span>{' '}
              <span className="font-semibold text-[#111112]">
                {e.margin.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} %
              </span>
            </span>
          )}
        </div>
      )}
      {people.some(([, v]) => v) && (
        <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs text-[#707075]">
          {people
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <span key={k}>
                {k}: <span className="text-[#4b4d45]">{v}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ n, title, desc }: { n: number; title: string; desc?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4f8e4] text-sm font-bold text-[#4a6b12]">
        {n}
      </span>
      <div>
        <h3 className="pt-1 text-base font-bold text-[#111112] sm:text-lg">{title}</h3>
        {desc && <p className="mt-0.5 text-xs text-[#707075]">{desc}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Адрес с подсказками DaData (справочник ФИАС)
// ---------------------------------------------------------------------------

function AddressAutocomplete({
  value,
  onChange,
  onPick,
  dadataKey,
  error,
}: {
  value: string
  onChange: (v: string) => void
  onPick: (s: AddressSuggestion) => void
  dadataKey: string
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Дебаунс 300 мс; запрос только при заданном ключе и длине от 3 символов
  useEffect(() => {
    const q = value.trim()
    if (!dadataKey || q.length < 3) {
      setOpts([])
      setLoading(false)
      return
    }
    setLoading(true)
    let alive = true
    const t = window.setTimeout(async () => {
      const list = await fetchAddressSuggestions(q, dadataKey)
      if (!alive) return
      setOpts(list)
      setLoading(false)
    }, 300)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [value, dadataKey])

  return (
    <div className="sc-addr relative" ref={wrap}>
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a6ce39]"
          aria-hidden
        />
        <input
          className={INPUT_CLS + ' pl-9' + (error ? ' border-red-400' : '')}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => opts.length > 0 && setOpen(true)}
          placeholder="Страна, область, город, улица, дом"
          autoComplete="off"
        />
        {loading && (
          <Loader2
            className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#707075]"
            aria-hidden
          />
        )}
      </div>
      {open && opts.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-[#e6e8de] bg-white shadow-lg">
          {opts.map((o, i) => (
            <button
              key={i}
              type="button"
              className="block w-full px-3 py-2 text-left text-xs leading-snug text-[#111112] hover:bg-[#f4f6ec]"
              onClick={() => {
                onPick(o)
                setOpen(false)
                setOpts([])
              }}
            >
              {o.value}
            </button>
          ))}
          <div className="border-t border-[#e6e8de] bg-[#fafaf6] px-3 py-1.5 text-[10px] leading-snug text-[#707075]">
            Подсказки DaData · справочник адресов ФИАС
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Форма карточки объекта
// ---------------------------------------------------------------------------

export function ProjectForm({
  value: d,
  onChange,
  errs,
  types,
  dadataKey,
  isAdmin,
  ownerOptions,
  ownerId,
  onOwnerId,
}: {
  value: FormData
  onChange: (f: FormData) => void
  errs: ValidationErrors
  types: Array<{ id: number; name: string }>
  dadataKey: string
  isAdmin: boolean
  ownerOptions: Account[]
  ownerId: string
  onOwnerId: (id: string) => void
}) {
  const set = <K extends keyof FormData>(k: K, v: FormData[K]) => onChange({ ...d, [k]: v })
  const items = d.specItems

  return (
    <div className="space-y-6">
      {/* 1. Объект строительства */}
      <div className="rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-6">
        <SectionTitle n={1} title="Объект строительства" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div data-err={errs.objectName ? '1' : undefined}>
            <Field label="Название объекта" required error={errs.objectName}>
              <input
                className={INPUT_CLS}
                value={d.objectName}
                onChange={(e) => set('objectName', e.target.value)}
                placeholder="Например: ЖК «Северный», корпус 3"
                autoComplete="off"
              />
            </Field>
          </div>
          <Field label="Тип объекта">
            <select className={INPUT_CLS} value={d.typeId} onChange={(e) => set('typeId', e.target.value)}>
              <option value="">— не указан —</option>
              {types.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2" data-err={errs.address ? '1' : undefined}>
            <Field
              label="Адрес объекта"
              required
              error={errs.address}
              hint={
                dadataKey
                  ? 'Адрес по справочнику ФИАС — подсказки DaData'
                  : 'Ключ DaData не задан — подсказки отключены (настройки админки)'
              }
            >
              <AddressAutocomplete
                value={d.address}
                onChange={(v) => onChange({ ...d, address: v, addressData: null })}
                onPick={(sug) => onChange({ ...d, address: sug.value, addressData: sug.data })}
                dadataKey={dadataKey}
                error={errs.address}
              />
            </Field>
          </div>
          <Field label="Планируемый срок сдачи" hint="Необязательно, формат ДД.ММ.ГГГГ">
            <input
              className={INPUT_CLS}
              value={d.deadline}
              onChange={(e) => set('deadline', formatDateInput(e.target.value))}
              placeholder="ДД.ММ.ГГГГ"
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>
          <Field label="Контрагент">
            <input
              className={INPUT_CLS}
              value={d.contractor}
              onChange={(e) => set('contractor', e.target.value)}
              placeholder="ООО «Подрядчик» / АО «Заказчик»"
              autoComplete="off"
            />
          </Field>
          <Field label="Статус">
            <select className={INPUT_CLS} value={d.status} onChange={(e) => set('status', e.target.value)}>
              {OBJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* 2. Дополнительно (гибрид) */}
      <div className="rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-6">
        <SectionTitle n={2} title="Дополнительно (гибрид)" desc="Поля прежней формы регистрации проекта" />
        <div className="mt-4 grid grid-cols-1 gap-4">
          <Field label="Суть проекта">
            <textarea
              className={INPUT_CLS + ' min-h-24'}
              value={d.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="Краткое описание: что за объект, объёмы, особенности…"
            />
          </Field>

          <Field label="Бюджет" error={errs.budgetAmount} hint="Сумма и валюта">
            <div className="flex gap-2">
              <input
                className={INPUT_CLS}
                value={d.budgetAmount}
                onChange={(e) => set('budgetAmount', e.target.value.replace(/[^\d\s,.]/g, ''))}
                placeholder="1 500 000"
                inputMode="decimal"
              />
              <select
                className={INPUT_CLS + ' w-28 shrink-0'}
                value={d.budgetCurrency}
                onChange={(e) => set('budgetCurrency', e.target.value)}
                aria-label="Валюта"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} {CURRENCY_SIGN[c] ?? ''}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <Field
            label="Планируемая спецификация"
            hint="Перечень номенклатуры и количество — добавьте позиции списком"
          >
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={INPUT_CLS}
                    value={it.name}
                    onChange={(e) =>
                      set(
                        'specItems',
                        items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    placeholder={i === 0 ? 'Наименование (например, SC-L2-24GP-385-4G(A))' : 'Наименование'}
                  />
                  <input
                    className={INPUT_CLS + ' w-24 shrink-0'}
                    value={it.qty}
                    onChange={(e) =>
                      set(
                        'specItems',
                        items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                      )
                    }
                    placeholder="Кол-во"
                    inputMode="numeric"
                    aria-label="Количество"
                  />
                  <button
                    type="button"
                    onClick={() => set('specItems', items.filter((_, j) => j !== i))}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e6e8de] text-[#707075] hover:bg-[#f4f6ec]"
                    aria-label="Удалить позицию"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set('specItems', [...items, { name: '', qty: '' }])}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#c8ccba] px-3 py-1.5 text-sm font-medium text-[#5c7a12] hover:bg-[#f4f8e4]"
              >
                <Plus className="h-4 w-4" aria-hidden /> Добавить позицию
              </button>
            </div>
          </Field>
        </div>
      </div>

      {/* 3. Владелец карточки (только администратор) */}
      {isAdmin && (
        <div className="rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-6">
          <SectionTitle n={3} title="Владелец карточки" desc="Кому принадлежит объект" />
          <div className="mt-4 sm:max-w-md">
            <Field label="Владелец" hint="По умолчанию — вы">
              <select className={INPUT_CLS} value={ownerId} onChange={(e) => onOwnerId(e.target.value)}>
                {ownerOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.profile.managerName || a.login || a.company}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Карточка объекта (просмотр)
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-[#f0f1ea] py-2.5 last:border-0 sm:grid-cols-[minmax(180px,32%)_1fr] sm:gap-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[#707075]">{label}</div>
      <div className="whitespace-pre-line text-sm text-[#111112]">{value}</div>
    </div>
  )
}

const EMPTY_SPEC_DRAFT: ObjectSpec = {
  specNo: '',
  specDate: '',
  source: '',
  protection: '',
  items: [{ name: '', qty: '' }],
}

export function ProjectCardView({
  p,
  isAdmin,
  types = [],
  specs,
  accounts,
  participants,
  onSaveParticipants,
  onAddSpec,
  onDeleteSpec,
  onEdit,
  onDelete,
  onBack,
  onExportJson,
  busy,
}: {
  p: Project
  isAdmin: boolean
  types?: Array<{ id: number; name: string }>
  specs: ObjectSpec[]
  accounts: Account[]
  participants: string[]
  onSaveParticipants: (userIds: string[]) => Promise<boolean>
  onAddSpec: (s: ObjectSpec) => Promise<boolean>
  onDeleteSpec: (id: string) => Promise<boolean>
  onEdit: () => void
  onDelete: () => void
  onBack: () => void
  onExportJson: () => void
  busy: boolean
}) {
  const full = p.access === 'full'

  // Соучастники: черновик правит админ, сохраняет кнопкой «Сохранить доступы»
  const [partIds, setPartIds] = useState<string[]>(participants)
  const [addUserId, setAddUserId] = useState('')
  const [partBusy, setPartBusy] = useState(false)
  const [partErr, setPartErr] = useState('')
  useEffect(() => setPartIds(participants), [participants])

  // Спецификации: черновик встроенного редактора
  const [specOpen, setSpecOpen] = useState(false)
  const [draft, setDraft] = useState<ObjectSpec>(EMPTY_SPEC_DRAFT)
  const [specErr, setSpecErr] = useState('')
  const [specBusy, setSpecBusy] = useState(false)

  const accountLabel = (a?: Account) => (a ? a.profile.managerName || a.login || a.company : '')
  const owner = accounts.find((a) => a.id === p.ownerId)
  const type = types.find((t) => String(t.id) === p.typeId)
  const ad = p.addressData
  const addrExtra = [ad?.postal_code, ad?.region, ad?.city].filter(Boolean).join(', ')

  const partNames = participants
    .map((id) => {
      const a = accounts.find((x) => x.id === id)
      return accountLabel(a) || (a ? a.email : '') || 'Участник'
    })
    .join(', ')

  async function saveParts() {
    setPartBusy(true)
    setPartErr('')
    const ok = await onSaveParticipants(partIds)
    setPartBusy(false)
    if (!ok) setPartErr('Не удалось сохранить доступы — попробуйте ещё раз')
  }

  async function saveSpecDraft() {
    if (!draft.specNo.trim()) {
      setSpecErr('Укажите номер спецификации')
      return
    }
    setSpecErr('')
    setSpecBusy(true)
    const ok = await onAddSpec({
      ...draft,
      specNo: draft.specNo.trim(),
      items: draft.items.filter((i) => i.name.trim()),
    })
    setSpecBusy(false)
    if (ok) {
      setSpecOpen(false)
      setDraft(EMPTY_SPEC_DRAFT)
    }
  }

  async function removeSpec(id: string) {
    if (!window.confirm('Удалить спецификацию?')) return
    await onDeleteSpec(id)
  }

  return (
    <div className="space-y-5">
      {/* Шапка карточки */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5c7a12] hover:underline"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> К списку
          </button>
          <span className="rounded bg-[#eef4d9] px-3 py-1 font-mono text-xl font-bold text-[#4a6b12]">
            {p.objectCode || '—'}
          </span>
          {p.status && (
            <span
              className={
                'rounded-md px-2.5 py-1 text-xs font-semibold ' +
                (STATUS_BADGE[p.status] ?? 'bg-[#f4f6ec] text-[#4b4d45]')
              }
            >
              {p.status}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#707075]">Создан: {ruDateTime(p.createdAt)}</span>
          {full && (
            <>
              <Button variant="default" onClick={onEdit}>
                <Pencil aria-hidden /> Редактировать
              </Button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#e6e8de] bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Удалить
              </button>
            </>
          )}
        </div>
      </div>

      {/* Основная карточка */}
      <div className="rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-6">
        <div className="text-xs font-medium uppercase tracking-wider text-[#a6ce39]">Карточка объекта</div>
        <h2 className="mt-1 text-xl font-bold text-[#111112] sm:text-2xl">{p.objectName || 'Без названия'}</h2>

        {!full && (
          <>
            <div className="mt-4">
              <Row label="Адрес" value={p.address} />
              <Row label="Создан" value={ruDateTime(p.createdAt)} />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-md border border-[#e9d9a0] bg-[#fdf8e7] px-3 py-2.5 text-sm text-[#5b4a12]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Полная информация доступна владельцу, соучастникам проекта и администратору.</span>
            </div>
          </>
        )}

        {full && (
          <>
            <div className="mt-5">
              <Row label="Название" value={p.objectName} />
              <Row label="Адрес" value={p.address} />
              <Row label="Индекс/регион" value={addrExtra} />
              <Row label="Дата внесения" value={p.entryDate} />
              <Row label="Тип" value={type ? type.name : p.typeId} />
              <Row label="Срок сдачи" value={p.deadline} />
              <Row label="Контрагент" value={p.contractor} />
              <Row label="Суть проекта" value={p.summary} />
              <Row label="Бюджет" value={p.budgetAmount ? formatRuMoney(p.budgetAmount, p.budgetCurrency) : ''} />
              <Row label="Спецификация" value={specToText(p.specItems)} />
              <Row label="Владелец" value={owner ? accountLabel(owner) || owner.email : ''} />

              {/* Соучастники */}
              <div className="grid grid-cols-1 gap-0.5 border-b border-[#f0f1ea] py-2.5 last:border-0 sm:grid-cols-[minmax(180px,32%)_1fr] sm:gap-4">
                <div className="text-xs font-medium uppercase tracking-wide text-[#707075]">Соучастники</div>
                <div>
                  <div className="text-sm text-[#111112]">{partNames || '—'}</div>
                  {isAdmin && (
                    <div className="mt-2 rounded-md border border-[#e6e8de] bg-[#fafaf6] p-3">
                      {partIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {partIds.map((id) => {
                            const a = accounts.find((x) => x.id === id)
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 rounded-full bg-[#f4f8e4] px-2.5 py-1 text-xs font-medium text-[#3c5210]"
                              >
                                {accountLabel(a) || (a ? a.email : '') || 'Пользователь ' + id.slice(0, 6)}
                                <button
                                  type="button"
                                  onClick={() => setPartIds(partIds.filter((x) => x !== id))}
                                  className="text-[#707075] hover:text-[#111112]"
                                  aria-label="Убрать соучастника"
                                >
                                  <X className="h-3 w-3" aria-hidden />
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          className={INPUT_CLS + ' sm:max-w-xs'}
                          value={addUserId}
                          onChange={(e) => setAddUserId(e.target.value)}
                          aria-label="Выберите пользователя"
                        >
                          <option value="">— выберите пользователя —</option>
                          {accounts
                            .filter((a) => !partIds.includes(a.id))
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {accountLabel(a) || a.login} ({a.login})
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (!addUserId) return
                            setPartIds([...partIds, addUserId])
                            setAddUserId('')
                          }}
                          disabled={!addUserId}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec] disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" aria-hidden /> Добавить
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveParts()}
                          disabled={partBusy || busy}
                          className="inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-black shadow-xs hover:bg-[#95bb31] disabled:opacity-60"
                        >
                          {partBusy ? 'Сохраняем…' : 'Сохранить доступы'}
                        </button>
                      </div>
                      {partErr && <p className="mt-2 text-xs font-medium text-red-600">{partErr}</p>}
                    </div>
                  )}
                </div>
              </div>

              <Row label="Создан" value={ruDateTime(p.createdAt)} />
              <Row label="Обновлён" value={ruDateTime(p.updatedAt)} />
            </div>

            <div className="mt-4 border-t border-[#f0f1ea] pt-4">
              <button
                type="button"
                onClick={onExportJson}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
              >
                <FileDown className="h-4 w-4" aria-hidden /> Скачать JSON
              </button>
            </div>
          </>
        )}
      </div>

      {/* Спецификации (1С) — только полный доступ */}
      {full && (
        <div className="rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#111112]">Спецификации (1С)</h3>
            <button
              type="button"
              onClick={() => {
                setSpecOpen((v) => !v)
                setSpecErr('')
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#c8ccba] px-3 py-1.5 text-sm font-medium text-[#5c7a12] hover:bg-[#f4f8e4]"
            >
              <Plus className="h-4 w-4" aria-hidden /> {specOpen ? 'Скрыть форму' : 'Добавить спецификацию'}
            </button>
          </div>

          {!specs.length && (
            <p className="mt-3 text-sm text-[#707075]">Спецификаций пока нет — добавьте первую из выгрузки 1С.</p>
          )}

          <div className="mt-3 space-y-3">
            {specs.map((s, idx) => (
              <div key={s.id ?? s.specNo + idx} className="rounded-lg border border-[#e6e8de] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#eef4d9] px-2 py-0.5 font-mono text-sm font-bold text-[#4a6b12]">
                    {s.specNo || '—'}
                  </span>
                  {s.specDate && <span className="text-xs text-[#707075]">{s.specDate}</span>}
                  {s.source && (
                    <span className="rounded bg-[#f4f6ec] px-2 py-0.5 text-[11px] font-semibold text-[#4b4d45]">
                      {s.source}
                    </span>
                  )}
                  {s.protection && (
                    <span className="rounded bg-[#fdf3d7] px-2 py-0.5 text-[11px] font-semibold text-[#8a6d1a]">
                      {s.protection}
                    </span>
                  )}
                  {s.id && (
                    <button
                      type="button"
                      onClick={() => void removeSpec(s.id as string)}
                      disabled={busy}
                      className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-[#707075] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label="Удалить спецификацию"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
                {s.items.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {s.items.map((it, i) => (
                      <li key={i} className="text-sm text-[#111112]">
                        {it.name}
                        {it.qty ? ` × ${it.qty}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {renderSpecExtra(s)}
              </div>
            ))}
          </div>

          {specOpen && (
            <div className="mt-4 rounded-lg border border-[#cfe3a0] bg-[#fbfdf5] p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Номер спецификации" required>
                  <input
                    className={INPUT_CLS + ' font-mono'}
                    value={draft.specNo}
                    onChange={(e) => setDraft({ ...draft, specNo: e.target.value })}
                    placeholder="М00090123"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Дата спецификации" hint="ДД.ММ.ГГГГ ЧЧ:ММ:СС">
                  <input
                    className={INPUT_CLS}
                    value={draft.specDate}
                    onChange={(e) => setDraft({ ...draft, specDate: formatDateInput(e.target.value) })}
                    placeholder="ДД.ММ.ГГГГ"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Источник">
                  <select
                    className={INPUT_CLS}
                    value={draft.source}
                    onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                  >
                    <option value="">—</option>
                    {SOURCE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Защита проекта">
                  <select
                    className={INPUT_CLS}
                    value={draft.protection}
                    onChange={(e) => setDraft({ ...draft, protection: e.target.value })}
                  >
                    <option value="">—</option>
                    {PROTECTION_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-4">
                <div className="space-y-2">
                  {draft.items.map((it, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className={INPUT_CLS}
                        value={it.name}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            items: draft.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          })
                        }
                        placeholder="Наименование"
                      />
                      <input
                        className={INPUT_CLS + ' w-24 shrink-0'}
                        value={it.qty}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            items: draft.items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                          })
                        }
                        placeholder="Кол-во"
                        inputMode="numeric"
                        aria-label="Количество"
                      />
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e6e8de] text-[#707075] hover:bg-[#f4f6ec]"
                        aria-label="Удалить позицию"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, items: [...draft.items, { name: '', qty: '' }] })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#c8ccba] px-3 py-1.5 text-sm font-medium text-[#5c7a12] hover:bg-[#f4f8e4]"
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Добавить позицию
                  </button>
                </div>
              </div>

              {specErr && <p className="mt-3 text-xs font-medium text-red-600">{specErr}</p>}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void saveSpecDraft()}
                  disabled={specBusy || busy}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#a6ce39] px-5 py-2.5 text-sm font-semibold text-black shadow-xs transition-colors hover:bg-[#95bb31] disabled:opacity-60"
                >
                  {specBusy ? 'Сохраняем…' : 'Сохранить спецификацию'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpecOpen(false)
                    setSpecErr('')
                    setDraft(EMPTY_SPEC_DRAFT)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-[#e6e8de] bg-white px-5 py-2.5 text-sm font-medium text-[#111112] transition-colors hover:bg-[#f4f6ec]"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
