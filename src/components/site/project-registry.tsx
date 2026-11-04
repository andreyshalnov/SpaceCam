'use client'

// Раздел «Объекты строительства» (#/project-reg).
// Бэкенд — Supabase (Postgres + Auth), данные общие для всех устройств.
// Аккаунты создаёт администратор в Supabase Dashboard; без входа раздел
// недоступен. Партнёр видит свои и соучастные объекты полностью, остальные —
// в базовом виде; администратор — все объекты и настройки раздела.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Building2,
  FileDown,
  FilePlus2,
  FolderKanban,
  Info,
  KeyRound,
  LifeBuoy,
  Lock,
  LogIn,
  LogOut,
  MailQuestion,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { CONTACTS } from '@/data/site'
import type { Product } from '@/data/site'
import { Field, INPUT_CLS, ProjectCardView, ProjectForm } from './registry-form'
import { normalizeSku } from '@/lib/price-store'
import { supabase } from '@/lib/supabase'
import { buildReport, REPORT_SECTIONS, type CatalogEntry, type ReportObject } from '@/lib/objects-report'
import {
  Account,
  DADATA_KEY_SETTING,
  FormData,
  OBJECT_STATUSES,
  ObjectSpec,
  Project,
  SpecItemRow,
  ValidationErrors,
  changeOwnPassword,
  deleteObject,
  deleteSpec,
  downloadFile,
  dmyToIsoDate,
  emptyForm,
  exportObjectJson,
  fetchAccounts,
  fetchAllSpecItems,
  fetchObjectTypes,
  fetchObjects,
  fetchParticipants,
  fetchSetting,
  fetchSpecs,
  formatDateInput,
  getSessionAccount,
  importObjectsCsv,
  objectsToCsv,
  requestPasswordReset,
  ruDateTime,
  saveObject,
  saveSetting,
  saveSpec,
  setParticipants as setObjectParticipants,
  signIn,
  signOut,
  toForm,
  updateProfileFields,
  validateProject,
} from '@/lib/registry'

type Tab = 'objects' | 'accounts' | 'report' | 'profile' | 'settings'
type MainView = { kind: 'list' } | { kind: 'form'; id: string | null } | { kind: 'card'; id: string }

const STATUS_BADGE: Record<string, string> = {
  Новый: 'bg-sky-50 text-sky-700',
  'В работе': 'bg-amber-50 text-amber-700',
  Реализация: 'bg-emerald-50 text-emerald-700',
  Заморожен: 'bg-gray-100 text-gray-600',
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ' + className}>
      {children}
    </span>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <section className="sc-pattern-dark bg-[#0b0b0c] py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-xs font-medium uppercase tracking-wider text-[#a6ce39]">Для партнёров</div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Объекты строительства</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#b8bab0] sm:text-base">
            Ведите базу объектов строительства: названия, адреса (подсказки DaData по справочнику ФИАС), типы,
            сроки сдачи, контрагентов, бюджеты и спецификации 1С. Доступ к разделу — по учётной записи; аккаунты
            выдаёт администратор. Карточки хранятся на защищённом сервере и доступны с любого устройства.
          </p>
        </div>
      </section>
      <section className="min-h-[50vh] bg-[#f5f6f1] py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">{children}</div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Вход / восстановление пароля
// ---------------------------------------------------------------------------

function LoginView({ onLogin }: { onLogin: (acc: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'recover'>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    setMsg('')
    if (mode === 'recover') {
      const res = await requestPasswordReset(email)
      setBusy(false)
      if (!res.ok) setErr(res.error ?? 'Не удалось отправить письмо')
      else
        setMsg(
          'Если такой e-mail зарегистрирован, письмо для восстановления пароля отправлено. Проверьте почту и следуйте ссылке в письме.',
        )
      return
    }
    const res = await signIn(email, pass)
    setBusy(false)
    if (!res.ok || !res.account) {
      setErr(res.error ?? 'Не удалось выполнить вход')
      return
    }
    onLogin(res.account)
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border border-[#e6e8de] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-[#f4f8e4]">
            {mode === 'login' ? (
              <LogIn className="h-6 w-6 text-[#5c7a12]" aria-hidden />
            ) : (
              <LifeBuoy className="h-6 w-6 text-[#5c7a12]" aria-hidden />
            )}
          </div>
          <h2 className="text-xl font-bold text-[#111112]">
            {mode === 'login' ? 'Вход в раздел' : 'Восстановление пароля'}
          </h2>
          <p className="mt-1 text-sm text-[#707075]">
            {mode === 'login'
              ? 'Для работы с объектами строительства требуется учётная запись. Право создания аккаунтов имеет только администратор — свяжитесь с нами, чтобы получить доступ.'
              : 'Укажите e-mail, на который выдана учётная запись, — мы отправим ссылку для смены пароля.'}
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <Field label="E-mail" required>
              <input
                className={INPUT_CLS}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.ru"
                autoComplete="email"
                autoFocus
              />
            </Field>
            {mode === 'login' && (
              <Field label="Пароль" required>
                <input
                  className={INPUT_CLS}
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </Field>
            )}
            {err && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {err}
              </div>
            )}
            {msg && (
              <div className="rounded-md border border-[#cfe3a0] bg-[#f4f8e4] px-3 py-2 text-sm font-medium text-[#3c5210]">
                {msg}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#a6ce39] px-5 py-2.5 text-sm font-semibold text-black shadow-xs transition-colors hover:bg-[#95bb31] disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {busy ? 'Отправляем…' : mode === 'login' ? 'Войти' : 'Отправить письмо'}
            </button>
          </form>
          <div className="mt-5 flex flex-col gap-2 border-t border-[#e6e8de] pt-4 text-sm">
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode('recover')
                    setErr('')
                    setMsg('')
                  }}
                  className="inline-flex items-center gap-1.5 font-medium text-[#5c7a12] hover:underline"
                >
                  <MailQuestion className="h-4 w-4" aria-hidden /> Забыли пароль?
                </button>
                <span className="text-[#707075]">
                  Запросить аккаунт:{' '}
                  <a
                    className="font-semibold text-[#5c7a12] hover:underline"
                    href={`mailto:${CONTACTS.email}?subject=Запрос аккаунта для раздела «Объекты строительства»`}
                  >
                    {CONTACTS.email}
                  </a>
                </span>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setErr('')
                  setMsg('')
                }}
                className="inline-flex items-center gap-1.5 font-medium text-[#5c7a12] hover:underline"
              >
                <LogIn className="h-4 w-4" aria-hidden /> Вернуться ко входу
              </button>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Аккаунты (администратор): профили партнёров в Supabase
// ---------------------------------------------------------------------------

function AccountsView({
  me,
  accounts,
  objects,
  onRefresh,
  onSaveProfile,
}: {
  me: Account
  accounts: Account[]
  objects: Project[]
  onRefresh: () => Promise<void>
  onSaveProfile: (
    id: string,
    patch: { company: string; managerName: string; phone: string; email: string },
  ) => Promise<string | null>
}) {
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ company: '', managerName: '', phone: '', email: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  function startEdit(a: Account) {
    setEditId(editId === a.id ? null : a.id)
    setErr('')
    setDraft({
      company: a.company,
      managerName: a.profile.managerName,
      phone: a.profile.phone,
      email: a.profile.email,
    })
  }

  async function save(a: Account) {
    setBusy(true)
    setErr('')
    const error = await onSaveProfile(a.id, draft)
    setBusy(false)
    if (error) {
      setErr(error)
      return
    }
    setEditId(null)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <div className="rounded-xl border border-[#e6e8de] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-[#5c7a12]" aria-hidden />
          <h3 className="text-base font-bold text-[#111112]">Как завести аккаунт партнёра</h3>
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-[#4b4d45]">
          <li>
            Откройте Supabase Dashboard → проект <span className="font-semibold">spacecam</span> → Authentication →
            Users → <span className="font-semibold">Add user</span>.
          </li>
          <li>Введите e-mail партнёра и стартовый пароль (минимум 6 символов), отметьте «Auto Confirm User» и сохраните.</li>
          <li>
            Пользователь появится в таблице справа (логин — часть e-mail до «@»). Нажмите «Редактировать» и укажите
            название компании и ФИО менеджера — они будут подтягиваться в карточки этого партнёра.
          </li>
          <li>Передайте партнёру e-mail и пароль — он сможет войти на сайте и сразу сменить пароль в профиле.</li>
        </ol>
        <p className="mt-3 rounded-md bg-[#fafaf6] px-3 py-2 text-xs leading-relaxed text-[#707075]">
          Пароли и удаление пользователей — в Supabase Dashboard (Authentication → Users → «…» у нужной строки:
          сброс пароля письмом или смена вручную). Карточки объектов при удалении пользователя стираются автоматически.
        </p>
        <button
          type="button"
          onClick={async () => {
            setRefreshing(true)
            await onRefresh()
            setRefreshing(false)
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#e6e8de] bg-white px-4 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
        >
          <RefreshCw className={'h-4 w-4' + (refreshing ? ' animate-spin' : '')} aria-hidden /> Обновить список
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#e6e8de] bg-white shadow-sm">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#e6e8de] bg-[#fafaf6] text-xs uppercase tracking-wide text-[#707075]">
              <th className="px-4 py-3 font-semibold">Логин</th>
              <th className="px-4 py-3 font-semibold">Компания</th>
              <th className="px-4 py-3 font-semibold">Роль</th>
              <th className="px-4 py-3 font-semibold">Объектов</th>
              <th className="px-4 py-3 font-semibold">Создан</th>
              <th className="px-4 py-3 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const cnt = objects.filter((p) => p.ownerId === a.id).length
              const editing = editId === a.id
              return (
                <React.Fragment key={a.id}>
                  <tr className="border-b border-[#f0f1ea] last:border-0 hover:bg-[#fafaf6]">
                    <td className="px-4 py-3 font-semibold text-[#111112]">
                      {a.login}
                      {a.id === me.id && <div className="text-[10px] font-medium uppercase text-[#a3a5ab]">это вы</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4b4d45]">{a.company || '—'}</td>
                    <td className="px-4 py-3">
                      {a.role === 'admin' ? (
                        <Badge className="bg-[#111112] text-white">
                          <ShieldCheck className="h-3 w-3" aria-hidden /> Администратор
                        </Badge>
                      ) : (
                        <Badge className="bg-[#f4f8e4] text-[#4a6b12]">Партнёр</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4b4d45]">{a.role === 'admin' ? '—' : String(cnt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-[#707075]">{ruDateTime(a.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(a)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#5c7a12] hover:bg-[#f4f8e4]"
                        >
                          {editing ? <X className="h-3.5 w-3.5" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
                          {editing ? 'Отмена' : 'Редактировать'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing && (
                    <tr className="border-b border-[#f0f1ea] bg-[#fafaf6]">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Field label="Название компании-партнёра" required>
                            <input
                              className={INPUT_CLS}
                              value={draft.company}
                              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                              placeholder="ООО «Партнёр»"
                            />
                          </Field>
                          <Field label="ФИО ответственного менеджера">
                            <input
                              className={INPUT_CLS}
                              value={draft.managerName}
                              onChange={(e) => setDraft({ ...draft, managerName: e.target.value })}
                              placeholder="Иванов Иван Иванович"
                            />
                          </Field>
                          <Field label="Контактный телефон">
                            <input
                              className={INPUT_CLS}
                              value={draft.phone}
                              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                              placeholder="+7 900 000-00-00"
                            />
                          </Field>
                          <Field label="E-mail">
                            <input
                              className={INPUT_CLS}
                              value={draft.email}
                              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                              placeholder="name@company.ru"
                              inputMode="email"
                            />
                          </Field>
                        </div>
                        {err && (
                          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                            {err}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => save(a)}
                          className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-black shadow-xs hover:bg-[#95bb31] disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" aria-hidden /> {busy ? 'Сохраняем…' : 'Сохранить профиль'}
                        </button>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {!accounts.filter((a) => a.role === 'partner').length && (
          <p className="px-4 py-4 text-sm text-[#707075]">
            Пока нет аккаунтов партнёров — создайте первого в Supabase Dashboard по инструкции слева.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Профиль
// ---------------------------------------------------------------------------

function ProfileView({
  me,
  onSaveProfile,
  onChangePassword,
}: {
  me: Account
  onSaveProfile: (patch: { company: string; managerName: string; phone: string; email: string }) => Promise<string | null>
  onChangePassword: (cur: string, next: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [company, setCompany] = useState(me.company)
  const [profile, setProfile] = useState(me.profile)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [curPass, setCurPass] = useState('')
  const [nextPass, setNextPass] = useState('')
  const [passMsg, setPassMsg] = useState('')
  const [passErr, setPassErr] = useState('')
  const [passBusy, setPassBusy] = useState(false)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-[#e6e8de] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-[#5c7a12]" aria-hidden />
          <h3 className="text-base font-bold text-[#111112]">Данные для карточек объектов</h3>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#707075]">
          Эти данные подтягиваются в раздел как имя владельца и подписи соучастников.
          Логин: <span className="font-semibold text-[#111112]">{me.login}</span>
          {me.email ? <> · e-mail: <span className="font-semibold text-[#111112]">{me.email}</span></> : null}
        </p>
        <div className="mt-4 space-y-4">
          <Field label="Название компании-партнёра" required>
            <input
              className={INPUT_CLS}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="ООО «Партнёр»"
            />
          </Field>
          <Field label="ФИО ответственного менеджера">
            <input className={INPUT_CLS} value={profile.managerName} onChange={(e) => setProfile({ ...profile, managerName: e.target.value })} placeholder="Иванов Иван Иванович" />
          </Field>
          <Field label="Контактный телефон">
            <input className={INPUT_CLS} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+7 900 000-00-00" />
          </Field>
          <Field label="E-mail">
            <input className={INPUT_CLS} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="name@company.ru" inputMode="email" />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setSaveErr('')
                const error = await onSaveProfile({ company, managerName: profile.managerName, phone: profile.phone, email: profile.email })
                setBusy(false)
                if (error) {
                  setSaveErr(error)
                  return
                }
                setSaved(true)
                window.setTimeout(() => setSaved(false), 2500)
              }}
              className="inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-black shadow-xs hover:bg-[#95bb31] disabled:opacity-60"
            >
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {saved && <span className="text-sm font-medium text-[#5c7a12]">Сохранено</span>}
          </div>
          {saveErr && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{saveErr}</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#e6e8de] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[#5c7a12]" aria-hidden />
          <h3 className="text-base font-bold text-[#111112]">Смена пароля</h3>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Текущий пароль" required>
            <input className={INPUT_CLS} type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="Новый пароль" required hint="Минимум 6 символов">
            <input className={INPUT_CLS} type="password" value={nextPass} onChange={(e) => setNextPass(e.target.value)} autoComplete="new-password" />
          </Field>
          {passErr && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{passErr}</div>}
          {passMsg && <div className="rounded-md border border-[#cfe3a0] bg-[#f4f8e4] px-3 py-2 text-sm font-medium text-[#3c5210]">{passMsg}</div>}
          <button
            type="button"
            disabled={passBusy}
            onClick={async () => {
              setPassErr('')
              setPassMsg('')
              setPassBusy(true)
              const res = await onChangePassword(curPass, nextPass)
              setPassBusy(false)
              if (!res.ok) setPassErr(res.error ?? 'Не удалось изменить пароль')
              else {
                setPassMsg('Пароль изменён')
                setCurPass('')
                setNextPass('')
              }
            }}
            className="inline-flex items-center gap-2 rounded-md border border-[#3f4a2a] bg-transparent px-4 py-2 text-sm font-semibold text-[#3c5210] hover:bg-[#f4f8e4] disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" aria-hidden /> {passBusy ? 'Меняем…' : 'Изменить пароль'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#e6e8de] bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-[#5c7a12]" aria-hidden />
          <h3 className="text-base font-bold text-[#111112]">Поддержка</h3>
        </div>
        <p className="mt-2 text-sm text-[#707075]">
          Если нужна помощь с доступом, объектами или выгрузками — свяжитесь с нами:{' '}
          <a href={`mailto:${CONTACTS.email}`} className="font-semibold text-[#5c7a12] hover:underline">
            {CONTACTS.email}
          </a>{' '}
          · <span className="font-semibold text-[#111112]">{CONTACTS.phone}</span>
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Настройки (только администратор)
// ---------------------------------------------------------------------------

function SettingsView({
  dadataKey,
  onSave,
}: {
  dadataKey: string
  onSave: (value: string) => Promise<string | null>
}) {
  const [value, setValue] = useState(dadataKey)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setValue(dadataKey)
  }, [dadataKey])

  return (
    <div className="max-w-2xl rounded-xl border border-[#e6e8de] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-[#5c7a12]" aria-hidden />
        <h3 className="text-base font-bold text-[#111112]">Ключ DaData</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#707075]">
        Ключ включает подсказки адреса в форме объекта (справочник ФИАС). Получите бесплатный ключ на{' '}
        <a href="https://dadata.ru" target="_blank" rel="noreferrer" className="font-semibold text-[#5c7a12] hover:underline">
          dadata.ru
        </a>{' '}
        → «API-ключи» — бесплатно до 10 000 запросов в день.
      </p>
      <div className="mt-4 space-y-3">
        <Field label="API-ключ DaData" hint="После сохранения подсказки адреса заработают у всех пользователей раздела.">
          <input
            className={INPUT_CLS}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Вставьте ключ DaData"
            autoComplete="off"
          />
        </Field>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setErr('')
              const error = await onSave(value.trim())
              setBusy(false)
              if (error) {
                setErr(error)
                return
              }
              setSaved(true)
              window.setTimeout(() => setSaved(false), 2500)
            }}
            className="inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-black shadow-xs hover:bg-[#95bb31] disabled:opacity-60"
          >
            {busy ? 'Сохраняем…' : 'Сохранить ключ'}
          </button>
          {saved && <span className="text-sm font-medium text-[#5c7a12]">Сохранено</span>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Отчёт по оборудованию в проектах (только администратор):
// группировка «статус проекта × тип оборудования × артикул», фильтры по
// периоду создания (дата из 1С) и сроку реализации (срок сдачи), сводка
// прогноза по кварталам срока сдачи. Логика агрегации — src/lib/objects-report.ts
// ---------------------------------------------------------------------------

const REPORT_INPUT_CLS =
  'h-9 rounded-md border border-[#e6e8de] bg-white px-2.5 text-sm text-[#111112] outline-none focus:border-[#a6ce39]'

function ReportView({ objects }: { objects: Project[] }) {
  const [items, setItems] = useState<SpecItemRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fCreated, setFCreated] = useState({ from: '', to: '' })
  const [fDeadline, setFDeadline] = useState({ from: '', to: '' })

  // Позиции спецификаций 1С по всем объектам (RLS отдаёт доступные)
  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      const r = await fetchAllSpecItems()
      if (r.error) setError(r.error)
      setItems(r.items)
      setLoading(false)
    })()
  }, [])

  // Справочник каталога — для типа оборудования и «красивых» артикулов
  useEffect(() => {
    void import('@/data/products.json').then((m) => setProducts(m.default as unknown as Product[]))
  }, [])

  const report = useMemo(() => {
    const catalog = new Map<string, CatalogEntry>()
    for (const p of products) {
      const n = normalizeSku(p.sku)
      if (n && !catalog.has(n)) catalog.set(n, { sku: p.sku, title: p.title, section: p.section })
    }
    const objs: ReportObject[] = objects.map((o) => ({
      id: o.id,
      objectCode: o.objectCode,
      status: o.status,
      createdIso: dmyToIsoDate(o.entryDate) || String(o.createdAt || '').slice(0, 10),
      deadlineIso: dmyToIsoDate(o.deadline) || '',
    }))
    // позиции из «простой спецификации» формы (сейчас пустые, учитываем на будущее)
    const formItems = objects.flatMap((o) =>
      (o.specItems || [])
        .map((i) => ({
          objectId: o.id,
          name: i.name,
          qty: Number(String(i.qty).replace(/\s/g, '').replace(',', '.')) || 0,
        }))
        .filter((i) => i.qty > 0 && i.name.trim()),
    )
    return buildReport(objs, items, formItems, catalog, {
      createdFrom: fCreated.from,
      createdTo: fCreated.to,
      deadlineFrom: fDeadline.from,
      deadlineTo: fDeadline.to,
    })
  }, [objects, items, products, fCreated, fDeadline])

  const fmt = (n: number) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
  const today = new Date().toISOString().slice(0, 10)

  function downloadCsv() {
    try {
      const head = ['Статус проекта;Тип оборудования;Артикул;Наименование;Кол-во, шт;Проектов']
      const lines: string[] = []
      for (const st of report.statuses)
        for (const sec of st.sections)
          for (const r of sec.rows)
            lines.push(
              [st.status, sec.label, r.sku.toUpperCase(), r.title, r.qty, r.objects]
                .map((v) => String(v).replace(/;/g, ','))
                .join(';'),
            )
      const blob = new Blob(['\ufeff' + head.concat(lines).join('\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `sc-otchet-proekty_${today.replace(/-/g, '')}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      /* экспорт необязателен */
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-[#e6e8de] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#5c7a12]" aria-hidden />
          <h3 className="text-base font-bold text-[#111112]">Отчёт по оборудованию в проектах</h3>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#707075]">
          Суммы по артикулам из спецификаций 1С и их количеству, с группировкой по статусу проекта и типу
          оборудования. Фильтры — период создания проекта (дата внесения из 1С) и срок реализации (планируемый
          срок сдачи) — формируют прогноз заказов на оборудование в заложенных проектах.
        </p>
      </div>

      {/* Фильтры: период создания + срок реализации */}
      <div className="mb-4 rounded-xl border border-[#e6e8de] bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#707075]">
              Период создания проекта (дата из 1С)
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="date"
                className={REPORT_INPUT_CLS}
                value={fCreated.from}
                onChange={(e) => setFCreated((v) => ({ ...v, from: e.target.value }))}
                aria-label="Создан с даты"
              />
              <span className="text-sm text-[#707075]">→</span>
              <input
                type="date"
                className={REPORT_INPUT_CLS}
                value={fCreated.to}
                onChange={(e) => setFCreated((v) => ({ ...v, to: e.target.value }))}
                aria-label="Создан по дату"
              />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#707075]">
              Срок реализации (планируемый срок сдачи)
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="date"
                className={REPORT_INPUT_CLS}
                value={fDeadline.from}
                onChange={(e) => setFDeadline((v) => ({ ...v, from: e.target.value }))}
                aria-label="Сдача с даты"
              />
              <span className="text-sm text-[#707075]">→</span>
              <input
                type="date"
                className={REPORT_INPUT_CLS}
                value={fDeadline.to}
                onChange={(e) => setFDeadline((v) => ({ ...v, to: e.target.value }))}
                aria-label="Сдача по дату"
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFCreated({ from: '', to: '' })
              setFDeadline({ from: '', to: '' })
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-1.5 text-xs font-medium text-[#111112] hover:bg-[#f4f6ec]"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Сбросить фильтры
          </button>
          <span className="text-xs text-[#707075]">Пустые поля = без ограничения по дате.</span>
        </div>
      </div>

      {/* Сводные показатели */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-[#e6e8de] bg-white px-3 py-1 text-xs font-medium text-[#111112]">
          Объектов в отчёте: {report.objectsIn} из {report.objectsTotal}
        </span>
        <span className="rounded-full border border-[#e6e8de] bg-white px-3 py-1 text-xs font-medium text-[#111112]">
          Позиций учтено: {fmt(report.itemsTotal)}
        </span>
        <span className="rounded-full border border-[#a6ce39] bg-[#f4f8e4] px-3 py-1 text-xs font-semibold text-[#3c5210]">
          Итого: {fmt(report.qtyTotal)} шт
        </span>
        {report.qtyOther > 0 && (
          <span className="rounded-full border border-[#e6e8de] bg-white px-3 py-1 text-xs font-medium text-[#4b4d45]">
            «Прочее» (нет в каталоге): {fmt(report.qtyOther)} шт
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </div>
      )}
      {loading && <p className="mb-4 text-sm text-[#707075]">Загрузка спецификаций…</p>}

      {/* Прогноз по кварталам срока сдачи */}
      {!loading && report.quarters.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-xl border border-[#e6e8de] bg-white shadow-sm">
          <div className="border-b border-[#e6e8de] bg-[#f8faf3] px-4 py-3">
            <h4 className="text-sm font-bold text-[#111112]">
              Прогноз заказов по кварталам срока сдачи
            </h4>
            <p className="mt-0.5 text-xs text-[#707075]">
              Оборудование из проектов, сгруппированное по планируемому сроку сдачи.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-white text-left text-xs uppercase tracking-wide text-[#707075]">
                  <th className="px-4 py-2 font-semibold">Квартал</th>
                  <th className="px-3 py-2 text-center font-semibold">Объектов</th>
                  {REPORT_SECTIONS.map((s) => (
                    <th key={s.id} className="px-3 py-2 text-center font-semibold">
                      {s.label}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-center font-semibold">Всего, шт</th>
                </tr>
              </thead>
              <tbody>
                {report.quarters.map((qr) => (
                  <tr key={qr.key} className="border-t border-[#f0f1ea]">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-[#111112]">{qr.label}</div>
                      <div className="text-[11px] text-[#707075]">{qr.range}</div>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{qr.objects}</td>
                    {REPORT_SECTIONS.map((s) => (
                      <td key={s.id} className="px-3 py-2 text-center tabular-nums">
                        {qr.sections[s.id] ? fmt(qr.sections[s.id]) : '—'}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center font-bold tabular-nums text-[#3c5210]">
                      {fmt(qr.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Группированный отчёт: статус → тип оборудования → артикулы */}
      {!loading && report.statuses.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#c8ccba] bg-white px-6 py-12 text-center text-sm text-[#707075]">
          Нет объектов под выбранные фильтры — измените период создания или срок реализации.
        </div>
      )}
      {report.statuses.map((st) => (
        <div key={st.status} className="mb-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className={STATUS_BADGE[st.status] ?? 'bg-[#f4f6ec] text-[#4b4d45]'}>{st.status}</Badge>
            <span className="text-xs text-[#707075]">
              Объектов: {st.objects} · Позиций: {fmt(st.qty)} шт
            </span>
          </div>
          {st.sections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#c8ccba] bg-white px-4 py-6 text-center text-xs text-[#707075]">
              В спецификациях проектов этого статуса позиций нет.
            </div>
          ) : (
            st.sections.map((sec) => (
              <div key={sec.id} className="mb-3 overflow-hidden rounded-lg border border-[#e6e8de] bg-white">
                <div className="flex items-center justify-between border-b border-[#e6e8de] bg-[#fafbf5] px-4 py-2">
                  <span className="text-sm font-semibold text-[#111112]">{sec.label}</span>
                  <span className="text-xs font-medium text-[#4b4d45]">{fmt(sec.qty)} шт</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#707075]">
                        <th className="px-4 py-2 font-semibold">Артикул</th>
                        <th className="px-3 py-2 font-semibold">Наименование</th>
                        <th className="px-3 py-2 text-center font-semibold">Кол-во, шт</th>
                        <th className="px-4 py-2 text-center font-semibold">Проектов</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((r) => (
                        <tr key={r.key} className="border-t border-[#f0f1ea]">
                          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs font-medium text-[#111112]">
                            {r.sku.toUpperCase()}
                          </td>
                          <td className="px-3 py-2 text-[#111112]">{r.title || '—'}</td>
                          <td className="px-3 py-2 text-center font-semibold tabular-nums text-[#3c5210]">
                            {fmt(r.qty)}
                          </td>
                          <td className="px-4 py-2 text-center tabular-nums">{r.objects}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      ))}

      {!loading && report.statuses.length > 0 && (
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
        >
          <FileDown className="h-4 w-4" aria-hidden /> Экспорт отчёта в CSV
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Главная страница раздела
// ---------------------------------------------------------------------------

export default function ProjectRegistry() {
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<Account | null>(null)
  const [objects, setObjects] = useState<Project[]>([])
  const [objectsError, setObjectsError] = useState('')
  const [types, setTypes] = useState<Array<{ id: number; name: string }>>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [dadataKey, setDadataKey] = useState('')
  const [participants, setParticipants] = useState<Record<string, string[]>>({})
  const [view, setView] = useState<MainView>({ kind: 'list' })
  const [tab, setTab] = useState<Tab>('objects')
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [toast, setToast] = useState('')

  // Состояние формы объекта
  const [form, setForm] = useState<FormData | null>(null)
  const [errs, setErrs] = useState<ValidationErrors>({})
  const [ownerId, setOwnerId] = useState('')
  const [entryDate, setEntryDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Карточка: спецификации и занятость
  const [specs, setSpecs] = useState<ObjectSpec[]>([])
  const [cardBusy, setCardBusy] = useState(false)

  const importRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 4000)
  }, [])

  const loadObjects = useCallback(async (): Promise<Project[]> => {
    const { objects: list, error } = await fetchObjects()
    setObjects(list)
    setObjectsError(error ?? '')
    setParticipants(await fetchParticipants(list.map((o) => o.id)))
    return list
  }, [])

  const loadAll = useCallback(
    async (who: Account) => {
      const [objsP, typesP, accountsP, keyP] = [
        loadObjects(),
        fetchObjectTypes(),
        who.role === 'admin' ? fetchAccounts() : Promise.resolve([who]),
        fetchSetting(DADATA_KEY_SETTING),
      ]
      const [, t, a, k] = await Promise.all([objsP, typesP, accountsP, keyP])
      setTypes(t)
      setAccounts(a)
      setDadataKey(k)
    },
    [loadObjects],
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const acc = await getSessionAccount()
      if (!alive) return
      if (acc) {
        setMe(acc)
        await loadAll(acc)
      }
      if (!alive) return
      setReady(true)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setMe(null)
        setObjects([])
        setAccounts([])
        setParticipants({})
        setDadataKey('')
        setSpecs([])
        setView({ kind: 'list' })
        setTab('objects')
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        void (async () => {
          const acc = await getSessionAccount()
          if (!acc) return
          setMe(acc)
          await loadAll(acc)
        })()
      }
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [loadAll])

  // Спецификации открытой карточки (только полный доступ)
  const cardId = view.kind === 'card' ? view.id : null
  const card = cardId ? objects.find((o) => o.id === cardId) ?? null : null
  const cardParticipants = useMemo(
    () => (card ? participants[card.id] ?? [] : []),
    [participants, card],
  )

  useEffect(() => {
    if (!card || card.access !== 'full') {
      setSpecs([])
      return
    }
    let alive = true
    void fetchSpecs(card.id).then((list) => {
      if (alive) setSpecs(list)
    })
    return () => {
      alive = false
    }
  }, [card])

  function doLogout() {
    void signOut()
    setMe(null)
    setObjects([])
    setAccounts([])
    setParticipants({})
    setDadataKey('')
    setSpecs([])
    setView({ kind: 'list' })
    setTab('objects')
    notify('Вы вышли из раздела')
  }

  if (!ready) {
    return (
      <PageShell>
        <div className="py-20 text-center text-sm text-[#707075]">Загрузка…</div>
      </PageShell>
    )
  }

  if (!me) {
    return (
      <LoginView
        onLogin={(acc) => {
          setMe(acc)
          void loadAll(acc)
          setTab('objects')
          setView({ kind: 'list' })
          notify(`Добро пожаловать, ${acc.role === 'admin' ? 'Администратор' : acc.company || acc.login}`)
        }}
      />
    )
  }

  const user = me
  const isAdmin = user.role === 'admin'

  // --- Форма объекта ---
  function openNew() {
    setForm(emptyForm(user))
    setOwnerId(user.id)
    setEntryDate('')
    setErrs({})
    setView({ kind: 'form', id: null })
  }

  function openEdit(id: string) {
    const p = objects.find((o) => o.id === id)
    if (!p || p.access !== 'full') return
    setForm(toForm(p))
    setOwnerId(p.ownerId || user.id)
    setEntryDate(p.entryDate)
    setErrs({})
    setView({ kind: 'form', id })
  }

  async function saveForm(editing: Project | undefined) {
    if (!form) return
    const ve = validateProject(form)
    setErrs(ve)
    if (Object.keys(ve).length) {
      notify('Проверьте заполнение обязательных полей')
      document.querySelector('[data-err="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaving(true)
    const res = await saveObject(user, form, editing, {
      ownerId: isAdmin ? ownerId : undefined,
      entryDate: isAdmin && entryDate ? entryDate : undefined,
    })
    setSaving(false)
    if (!res.ok) {
      notify('Ошибка сохранения: ' + (res.error ?? 'неизвестная'))
      return
    }
    const fresh = await loadObjects()
    notify(`Объект сохранён. ID: ${res.objectCode ?? '—'}`)
    const created = res.objectCode ? fresh.find((o) => o.objectCode === res.objectCode) : undefined
    setView(created ? { kind: 'card', id: created.id } : { kind: 'list' })
  }

  // --- Карточка объекта ---
  function removeObject(p: Project) {
    if (!window.confirm(`Удалить объект «${p.objectName || p.objectCode || 'без названия'}»?`)) return
    void (async () => {
      setCardBusy(true)
      const res = await deleteObject(p.id)
      setCardBusy(false)
      if (!res.ok) {
        notify('Ошибка удаления: ' + (res.error ?? 'неизвестная'))
        return
      }
      notify('Объект удалён')
      await loadObjects()
      setView({ kind: 'list' })
    })()
  }

  async function saveParticipantsHandler(ids: string[]): Promise<boolean> {
    if (!card) return false
    setCardBusy(true)
    const res = await setObjectParticipants(card.id, ids, user.id)
    setCardBusy(false)
    if (!res.ok) {
      notify('Ошибка сохранения доступов: ' + (res.error ?? 'неизвестная'))
      return false
    }
    setParticipants(await fetchParticipants(objects.map((o) => o.id)))
    notify('Доступы сохранены')
    return true
  }

  async function addSpecHandler(s: ObjectSpec): Promise<boolean> {
    if (!card) return false
    setCardBusy(true)
    const res = await saveSpec(card.id, s)
    setCardBusy(false)
    if (!res.ok) {
      notify('Ошибка сохранения спецификации: ' + (res.error ?? 'неизвестная'))
      return false
    }
    setSpecs(await fetchSpecs(card.id))
    notify('Спецификация сохранена')
    return true
  }

  async function deleteSpecHandler(specId: string): Promise<boolean> {
    if (!card) return false
    setCardBusy(true)
    const res = await deleteSpec(specId)
    setCardBusy(false)
    if (!res.ok) {
      notify('Ошибка удаления спецификации: ' + (res.error ?? 'неизвестная'))
      return false
    }
    setSpecs(await fetchSpecs(card.id))
    notify('Спецификация удалена')
    return true
  }

  // --- Импорт CSV (админ) ---
  async function importCsv(file: File) {
    setCardBusy(true)
    try {
      const res = await importObjectsCsv(await file.text(), user, types)
      const msg =
        `Импорт завершён: добавлено ${res.added}, пропущено ${res.skipped}.` +
        (res.errors.length ? '\n\nОшибки:\n' + res.errors.slice(0, 10).join('\n') : '')
      window.alert(msg)
      await loadObjects()
    } catch (err) {
      window.alert('Ошибка импорта: ' + (err instanceof Error ? err.message : 'неизвестная'))
    }
    setCardBusy(false)
  }

  const toastEl = toast ? (
    <div className="fixed bottom-4 right-4 z-[80] max-w-sm rounded-lg border border-[#cfe3a0] bg-[#111112] px-4 py-3 text-sm font-medium text-white shadow-xl">
      {toast}
    </div>
  ) : null

  // ---- Форма объекта ----
  if (view.kind === 'form' && form) {
    const editing = view.id ? objects.find((o) => o.id === view.id) : undefined
    return (
      <PageShell>
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setView({ kind: 'list' })}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5c7a12] hover:underline"
            >
              К списку объектов
            </button>
            <button
              type="button"
              onClick={doLogout}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Выйти
            </button>
          </div>

          <h2 className="mb-1 text-2xl font-bold text-[#111112]">
            {editing ? 'Редактирование объекта' : 'Новый объект'}
          </h2>
          <p className="mb-5 text-sm text-[#707075]">
            Поля со звёздочкой обязательны. Адрес подставляется по справочнику ФИАС (DaData).
          </p>

          {isAdmin && editing && (
            <div className="mb-4 rounded-xl border border-[#e6e8de] bg-white p-4">
              <div className="sm:max-w-xs">
                <Field label="Дата внесения" hint="Дата внесения объекта в базу (из 1С/CSV), ДД.ММ.ГГГГ">
                  <input
                    className={INPUT_CLS}
                    value={entryDate}
                    onChange={(e) => setEntryDate(formatDateInput(e.target.value))}
                    placeholder="ДД.ММ.ГГГГ"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>
          )}

          <ProjectForm
            value={form}
            onChange={setForm}
            errs={errs}
            types={types}
            dadataKey={dadataKey}
            isAdmin={isAdmin}
            ownerOptions={isAdmin ? accounts : [user]}
            ownerId={ownerId}
            onOwnerId={setOwnerId}
          />

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveForm(editing)}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#a6ce39] px-5 py-2.5 text-sm font-semibold text-black shadow-xs transition-colors hover:bg-[#95bb31] disabled:opacity-60"
            >
              {saving ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Создать объект'}
            </button>
            <button
              type="button"
              onClick={() => setView({ kind: 'list' })}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#e6e8de] bg-white px-5 py-2.5 text-sm font-medium text-[#111112] transition-colors hover:bg-[#f4f6ec]"
            >
              Отмена
            </button>
          </div>
        </div>
        {toastEl}
      </PageShell>
    )
  }

  // ---- Карточка объекта ----
  if (view.kind === 'card') {
    return (
      <PageShell>
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={doLogout}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Выйти
            </button>
          </div>
          {card ? (
            <ProjectCardView
              p={card}
              isAdmin={isAdmin}
              types={types}
              specs={specs}
              accounts={accounts}
              participants={cardParticipants}
              busy={cardBusy}
              onSaveParticipants={saveParticipantsHandler}
              onAddSpec={addSpecHandler}
              onDeleteSpec={deleteSpecHandler}
              onEdit={() => openEdit(card.id)}
              onDelete={() => removeObject(card)}
              onBack={() => setView({ kind: 'list' })}
              onExportJson={() =>
                downloadFile(`object-${card.objectCode || card.id}.json`, exportObjectJson(card))
              }
            />
          ) : (
            <div className="rounded-xl border border-[#e6e8de] bg-white px-6 py-12 text-center text-sm text-[#707075]">
              Объект не найден.{' '}
              <button
                type="button"
                className="font-semibold text-[#5c7a12] hover:underline"
                onClick={() => setView({ kind: 'list' })}
              >
                Вернуться к списку
              </button>
            </div>
          )}
        </div>
        {toastEl}
      </PageShell>
    )
  }

  // ---- Список / аккаунты / профиль / настройки ----
  const visible = onlyMine ? objects.filter((o) => o.ownerId === user.id) : objects
  const s = q.trim().toLowerCase()
  const base = visible.filter((o) => {
    if (!s) return true
    const code = o.objectCode.toLowerCase()
    if (code.includes(s)) return true
    // «90001» и «м00090001» должны находить один и тот же код
    const codeNum = code.replace(/^[мm]/, '')
    const sNum = s.replace(/^[мm]/, '')
    if (sNum && codeNum.includes(sNum)) return true
    return (
      o.objectName.toLowerCase().includes(s) ||
      o.address.toLowerCase().includes(s) ||
      o.contractor.toLowerCase().includes(s)
    )
  })
  const filtered = statusF ? base.filter((o) => o.status === statusF) : base
  const statusChips: Array<{ key: string; label: string }> = [
    { key: '', label: 'Все' },
    ...OBJECT_STATUSES.map((st) => ({ key: st, label: st })),
  ]

  return (
    <PageShell>
      {/* Шапка кабинета */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('objects')}
            className={
              'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ' +
              (tab === 'objects'
                ? 'bg-[#111112] text-white'
                : 'border border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]')
            }
          >
            <FolderKanban className="h-4 w-4" aria-hidden />
            Объекты
            <span className="rounded bg-black/10 px-1.5 text-xs">{visible.length}</span>
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setTab('accounts')}
                className={
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ' +
                  (tab === 'accounts'
                    ? 'bg-[#111112] text-white'
                    : 'border border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]')
                }
              >
                <Users className="h-4 w-4" aria-hidden /> Аккаунты
                <span className="rounded bg-black/10 px-1.5 text-xs">
                  {accounts.filter((a) => a.role === 'partner').length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTab('report')}
                className={
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ' +
                  (tab === 'report'
                    ? 'bg-[#111112] text-white'
                    : 'border border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]')
                }
              >
                <BarChart3 className="h-4 w-4" aria-hidden /> Отчёт
              </button>
              <button
                type="button"
                onClick={() => setTab('settings')}
                className={
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ' +
                  (tab === 'settings'
                    ? 'bg-[#111112] text-white'
                    : 'border border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]')
                }
              >
                <Settings className="h-4 w-4" aria-hidden /> Настройки
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={
              'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ' +
              (tab === 'profile'
                ? 'bg-[#111112] text-white'
                : 'border border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]')
            }
          >
            <UserCog className="h-4 w-4" aria-hidden /> Профиль
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-[#707075] sm:inline">
            {isAdmin ? 'Администратор' : user.company || 'Партнёр'} ·{' '}
            <span className="font-semibold text-[#111112]">{user.email || user.login}</span>
          </span>
          <button
            type="button"
            onClick={doLogout}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Выйти
          </button>
        </div>
      </div>

      {tab === 'objects' && (
        <>
          {/* Панель инструментов */}
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3a5ab]"
                    aria-hidden
                  />
                  <input
                    className={INPUT_CLS + ' pl-9'}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Поиск по ID, названию, адресу…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setOnlyMine((v) => !v)}
                  className={
                    'inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors ' +
                    (onlyMine
                      ? 'border-[#a6ce39] bg-[#f4f8e4] text-[#3c5210]'
                      : 'border-[#e6e8de] bg-white text-[#111112] hover:bg-[#f4f6ec]')
                  }
                >
                  Только мои
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openNew}
                  className="inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-black shadow-xs hover:bg-[#95bb31]"
                >
                  <FilePlus2 className="h-4 w-4" aria-hidden /> Новый объект
                </button>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      disabled={cardBusy}
                      onClick={() => importRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec] disabled:opacity-60"
                      title="Импорт объектов из CSV-выгрузки 1С (разделитель «;», UTF-8)"
                    >
                      <Upload className="h-4 w-4" aria-hidden /> Импорт CSV
                    </button>
                    <input
                      ref={importRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (!f) return
                        void importCsv(f)
                      }}
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      `sc-objects-${new Date().toISOString().slice(0, 10)}.csv`,
                      objectsToCsv(filtered, accounts),
                      'text/csv',
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
                >
                  <FileDown className="h-4 w-4" aria-hidden /> Экспорт CSV
                </button>
                <button
                  type="button"
                  onClick={() => void loadAll(user)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#e6e8de] bg-white px-3 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden /> Обновить
                </button>
              </div>
            </div>

            {/* Фильтр по статусам */}
            <div className="flex flex-wrap gap-1.5">
              {statusChips.map((c) => {
                const n = c.key ? base.filter((o) => o.status === c.key).length : base.length
                const active = statusF === c.key
                return (
                  <button
                    key={c.key || 'all'}
                    type="button"
                    onClick={() => setStatusF(c.key)}
                    className={
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                      (active
                        ? 'border-[#111112] bg-[#111112] text-white'
                        : 'border-[#e6e8de] bg-white text-[#4b4d45] hover:bg-[#f4f6ec]')
                    }
                  >
                    {c.label} <span className="opacity-60">{n}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {objectsError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {objectsError}
            </div>
          )}

          {/* Список объектов */}
          {!objects.length ? (
            <div className="rounded-xl border border-dashed border-[#c8ccba] bg-white px-6 py-14 text-center">
              <FolderKanban className="mx-auto h-10 w-10 text-[#c8ccba]" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-[#111112]">Пока нет ни одного объекта строительства</p>
              <p className="mt-1 text-sm text-[#707075]">
                Создайте первый объект кнопкой «Новый объект»{isAdmin ? ' или импортируйте CSV из 1С.' : '.'}
              </p>
            </div>
          ) : !filtered.length ? (
            <div className="rounded-xl border border-dashed border-[#c8ccba] bg-white px-6 py-12 text-center text-sm text-[#707075]">
              Ничего не найдено — измените поиск или фильтры.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#e6e8de] bg-white shadow-sm">
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setView({ kind: 'card', id: o.id })}
                  title={o.access === 'basic' ? 'Только базовая информация' : undefined}
                  className={
                    'flex w-full items-center gap-3 border-b border-[#f0f1ea] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[#fafaf6] ' +
                    (o.access === 'basic' ? 'opacity-60' : '')
                  }
                >
                  <span className="shrink-0 rounded bg-[#eef4d9] px-2 py-1 font-mono text-sm font-bold text-[#4a6b12]">
                    {o.objectCode || '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#111112]">
                      {o.objectName || 'Без названия'}
                    </span>
                    <span className="block truncate text-xs text-[#707075]">{o.address || 'Адрес не указан'}</span>
                  </span>
                  {o.access === 'basic' ? (
                    <Lock className="h-4 w-4 shrink-0 text-[#a3a5ab]" aria-hidden />
                  ) : o.status ? (
                    <span
                      className={
                        'hidden shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold sm:inline-flex ' +
                        (STATUS_BADGE[o.status] ?? 'bg-[#f4f6ec] text-[#4b4d45]')
                      }
                    >
                      {o.status}
                    </span>
                  ) : null}
                  <span className="hidden w-36 shrink-0 text-right text-xs text-[#707075] sm:block">
                    {ruDateTime(o.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs leading-relaxed text-[#707075]">
            Данные хранятся на сервере Supabase. Объекты других партнёров видны в базовом виде (замок) — полная
            информация доступна владельцу, соучастникам проекта и администратору.
          </p>
        </>
      )}

      {tab === 'report' && isAdmin && <ReportView objects={objects} />}

      {tab === 'accounts' && isAdmin && (
        <AccountsView
          me={user}
          accounts={accounts}
          objects={objects}
          onRefresh={async () => {
            await loadAll(user)
          }}
          onSaveProfile={async (id, patch) => {
            const res = await updateProfileFields(id, patch)
            if (!res.ok) return res.error ?? 'Не удалось сохранить профиль'
            await loadAll(user)
            if (id === user.id) {
              setMe({
                ...user,
                company: patch.company,
                profile: { managerName: patch.managerName, phone: patch.phone, email: patch.email },
              })
            }
            notify('Профиль сохранён')
            return null
          }}
        />
      )}

      {tab === 'settings' && isAdmin && (
        <SettingsView
          dadataKey={dadataKey}
          onSave={async (v) => {
            const res = await saveSetting(DADATA_KEY_SETTING, v)
            if (!res.ok) return res.error ?? 'Не удалось сохранить ключ'
            setDadataKey(await fetchSetting(DADATA_KEY_SETTING))
            notify('Ключ DaData сохранён')
            return null
          }}
        />
      )}

      {tab === 'profile' && (
        <ProfileView
          me={user}
          onSaveProfile={async (patch) => {
            const res = await updateProfileFields(user.id, patch)
            if (!res.ok) return res.error ?? 'Не удалось сохранить профиль'
            setMe({
              ...user,
              company: patch.company,
              profile: { managerName: patch.managerName, phone: patch.phone, email: patch.email },
            })
            return null
          }}
          onChangePassword={(cur, next) => changeOwnPassword(user, cur, next)}
        />
      )}

      {toastEl}
    </PageShell>
  )
}
