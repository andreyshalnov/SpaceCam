// Раздел «Объекты строительства» (#/project-reg) — Supabase-хранилище и логика доступа.
//
// Архитектура: сайт — статический экспорт (GitHub Pages), бэкенд — Supabase
// (Postgres + встроенный Auth). Браузер работает с базой напрямую через
// supabase-js; безопасность обеспечивают RLS-политики (миграция
// docs/sql/20261103_objects_schema.sql):
//   objects / object_specs / object_spec_items — полный доступ: admin, владелец,
//   соучастники; остальные аутентифицированные видят только базовую информацию
//   (ID, название, адрес, время создания) через витрину objects_overview.
//   object_participants — назначает только admin.
//   app_settings — ключ DaData и другие настройки (запись — admin).
// Аккаунты создаёт администратор (Supabase Dashboard → Authentication → Users),
// строку профиля заводит триггер on_auth_user_created с ролью partner.
//
// Роли:
//  - admin   — полный доступ ко всем объектам + управление доступами и настройками;
//  - partner — полный доступ к своим и соучастным объектам, остальным — базовая инфа.
//
// ID объекта: «М00090001» и далее (стиль 1С; диапазон выше максимума спецификаций
// из выгрузки М00085210, чтобы номера не пересекались) — генерирует триггер БД.

import { supabase } from './supabase'

export type Role = 'admin' | 'partner'

export interface Account {
  id: string
  login: string
  email: string
  role: Role
  company: string
  /** партнёр видит вкладку «Наличие» (profiles.see_availability, по умолчанию true) */
  seeAvailability: boolean
  /** видит все объекты базы в #/project-reg (profiles.see_all_projects; admin видит все независимо от флага) */
  seeAllProjects: boolean
  /** при see_all_projects=false: видит свои (owner_id) и соучастные объекты (profiles.see_own_projects) */
  seeOwnProjects: boolean
  profile: { managerName: string; phone: string; email: string }
  createdAt: string
}

export interface SpecItem {
  name: string
  qty: string
}

/** Данные бренд-строки CRM (object_specs.extra, импорт выгрузки 1С 12.11.2026). */
export interface SpecExtra {
  brand?: string
  tech?: string // ответственный тех специалист
  supplier?: string // поставщик
  buyer?: string // ответственный закупщик
  fact?: number // сумма факт
  remain?: number // осталось отгрузить
  profit?: number // валовая прибыль
  margin?: number // рентабельность, %
}

/** Спецификация 1С (таблица object_specs + object_spec_items). */
export interface ObjectSpec {
  id?: string
  specNo: string
  specDate: string // ДД.ММ.ГГГГ ЧЧ:ММ:СС или ''
  source: string // '' | ключ SOURCE_OPTIONS
  protection: string // '' | ключ PROTECTION_OPTIONS
  items: SpecItem[]
  sum?: number | null // сумма план (бренд-строка CRM)
  extra?: SpecExtra | null
}

/** Структура адреса DaData (сохраняется в objects.address_json). */
export interface AddressData {
  value?: string
  postal_code?: string
  region?: string
  city?: string
  street?: string
  house?: string
  [k: string]: unknown
}

export interface AddressSuggestion {
  value: string
  data: AddressData
}

export interface FormData {
  objectName: string // Объект строительства (название)
  address: string // Адрес объекта (подсказки DaData)
  addressData: AddressData | null
  typeId: string // '' или id из object_types
  deadline: string // Планируемый срок сдачи, ДД.ММ.ГГГГ
  contractor: string // Контрагент
  status: string // Новый / В работе / Реализация / Заморожен
  // Гибрид: сохранённые поля текущей формы
  summary: string // Суть проекта
  budgetAmount: string
  budgetCurrency: string
  specItems: SpecItem[] // Планируемая спецификация (простой список)
}

export type AccessLevel = 'full' | 'basic'

export interface Project extends FormData {
  id: string
  objectCode: string // М00090001
  ownerId: string
  entryDate: string // дата внесения в базу (из 1С/CSV), ДД.ММ.ГГГГ или ''
  createdAt: string // дата и время создания карточки (ISO)
  updatedAt: string
  access: AccessLevel // full — есть у объекта; basic — только базовая информация
}

// ---------------------------------------------------------------------------
// Справочники
// ---------------------------------------------------------------------------

// Статусы CRM (миграция 20261112: + «Объект оснащен», «Отклонен» — из выгрузки 1С):
export const OBJECT_STATUSES = [
  'Новый',
  'В работе',
  'Реализация',
  'Объект оснащен',
  'Заморожен',
  'Отклонен',
] as const

export const SOURCE_OPTIONS = [
  'Проработка с нуля',
  'Перевод с конкурента',
  'Входящий спрос',
  'Собственное продвижение',
  'Проработка партнера',
] as const

export const PROTECTION_OPTIONS = [
  'Получена защита проекта',
  'Отказ (защищено за другим поставщиком)',
] as const

/** Типы объектов из выгрузки 1С — резерв, если object_types пуст (до миграции). */
export const OBJECT_TYPES_FALLBACK: Array<{ id: number; name: string }> = [
  { id: 1, name: 'Объекты культуры' },
  { id: 2, name: 'Объект Минобразования (школы и дет. сады)' },
  { id: 3, name: 'Жилые здания' },
  { id: 4, name: 'Административный объект' },
  { id: 5, name: 'Объект здравоохранения' },
  { id: 6, name: 'Объекты гостиничного типа' },
  { id: 7, name: 'Производственный объект' },
  { id: 8, name: 'Ведомственные объекты' },
  { id: 9, name: 'Объекты транспортной инфраструктуры (п/п 969)' },
  { id: 10, name: 'Складские / логистические комплексы' },
  { id: 11, name: 'Объекты общественного питания' },
  { id: 12, name: 'Объекты иностранных государств' },
  { id: 13, name: 'Зоны массового пребывания людей' },
  { id: 14, name: 'Сельскохозяйственный объект' },
  // Миграция 20261112: типы из CRM-выгрузки, которых не было в 1С:
  { id: 15, name: 'Торговая недвижимость' },
  { id: 16, name: 'Программы категории "Безопасный город" / "Безопасный регион"' },
]

export const CURRENCIES = ['RUB', 'USD', 'EUR', 'CNY'] as const

export const CURRENCY_SIGN: Record<string, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  CNY: '¥',
}

// ---------------------------------------------------------------------------
// Строки БД → объекты приложения
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string
  login: string
  role: string
  company: string
  manager_name: string
  phone: string
  email: string
  see_availability?: boolean | null
  see_all_projects?: boolean | null
  see_own_projects?: boolean | null
  created_at: string
}

interface ObjectRow {
  id: string
  object_code: string | null
  owner_id: string
  object_name: string
  address: string | null
  address_json: AddressData | null
  type_id: number | null
  deadline: string | null
  contractor: string | null
  status: string | null
  summary: string | null
  budget_amount: number | string | null
  budget_currency: string | null
  spec: Array<Partial<SpecItem>> | null
  entry_date: string | null
  created_at: string
  updated_at: string
}

interface OverviewRow {
  id: string
  object_code: string | null
  object_name: string
  address: string | null
  created_at: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v)
}

function profileToAccount(row: ProfileRow, email = ''): Account {
  return {
    id: row.id,
    login: String(row.login ?? ''),
    email,
    role: row.role === 'admin' ? 'admin' : 'partner',
    company: String(row.company ?? ''),
    seeAvailability: row.see_availability !== false,
    // чекбоксы «Видит все проекты»/«Видит свои проекты»: null → false
    // (решение по умолчанию 13.11.2026 — без выданного админом доступа партнёр
    // не видит ни одного объекта; см. миграцию 20261113_user_project_visibility.sql)
    seeAllProjects: row.see_all_projects === true,
    seeOwnProjects: row.see_own_projects === true,
    profile: {
      managerName: String(row.manager_name ?? ''),
      phone: String(row.phone ?? ''),
      email: String(row.email ?? ''),
    },
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  }
}

/** Дата из БД (YYYY-MM-DD) → ДД.ММ.ГГГГ. */
function dbDateToDmy(v: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''))
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** ДД.ММ.ГГГГ → YYYY-MM-DD (или null). */
export function dmyToIsoDate(v: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v.trim())
  if (!m || !isValidDateDMY(v)) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Нормализация полей карточки объекта из произвольного источника. */
export function sanitizeForm(
  raw: Partial<FormData> | Record<string, unknown> | null | undefined,
): FormData {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    objectName: String(r.objectName ?? ''),
    address: String(r.address ?? ''),
    addressData:
      r.addressData && typeof r.addressData === 'object'
        ? (r.addressData as AddressData)
        : null,
    typeId: String(r.typeId ?? ''),
    deadline: String(r.deadline ?? ''),
    contractor: String(r.contractor ?? ''),
    status: String(r.status ?? 'Новый'),
    summary: String(r.summary ?? ''),
    budgetAmount: String(r.budgetAmount ?? ''),
    budgetCurrency: String(r.budgetCurrency ?? 'RUB'),
    specItems: Array.isArray(r.specItems)
      ? (r.specItems as Array<Partial<SpecItem>>).map((i) => ({
          name: String(i?.name ?? ''),
          qty: String(i?.qty ?? ''),
        }))
      : [],
  }
}

function rowToProject(row: ObjectRow): Project {
  const now = new Date().toISOString()
  return {
    ...sanitizeForm({
      objectName: row.object_name,
      address: row.address,
      addressData: row.address_json,
      typeId: row.type_id != null ? String(row.type_id) : '',
      deadline: dbDateToDmy(row.deadline),
      contractor: row.contractor,
      status: row.status,
      summary: row.summary,
      budgetAmount: row.budget_amount != null ? String(row.budget_amount) : '',
      budgetCurrency: row.budget_currency,
      specItems: row.spec,
    }),
    id: row.id,
    objectCode: String(row.object_code ?? ''),
    ownerId: row.owner_id,
    entryDate: dbDateToDmy(row.entry_date),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : now,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : now,
    access: 'full',
  }
}

function overviewToProject(row: OverviewRow): Project {
  const now = new Date().toISOString()
  return {
    ...sanitizeForm(null),
    objectName: String(row.object_name ?? ''),
    address: String(row.address ?? ''),
    id: row.id,
    objectCode: String(row.object_code ?? ''),
    ownerId: '',
    entryDate: '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : now,
    updatedAt: row.created_at ? new Date(row.created_at).toISOString() : now,
    access: 'basic',
  }
}

/** Человекочитаемое сообщение об ошибке БД. */
function dbError(err: { message?: string } | null | undefined): string {
  const m = String(err?.message ?? '')
  if (/row-level security/i.test(m)) return 'Действие запрещено политикой доступа'
  if (/duplicate key/i.test(m)) return 'Такая запись уже существует'
  if (/failed to fetch|network/i.test(m))
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
  return m || 'Ошибка базы данных'
}

// ---------------------------------------------------------------------------
// Аутентификация (Supabase Auth)
// ---------------------------------------------------------------------------

async function accountForUser(userId: string, email: string): Promise<Account | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) return null
  if (data) return profileToAccount(data as ProfileRow, email)
  // Самовосстановление: профиль мог не создаться, если триггер не отработал
  const login = (email.split('@')[0] || 'user').toLowerCase().slice(0, 40)
  const { data: created, error: insErr } = await supabase
    .from('profiles')
    .insert({ id: userId, login, role: 'partner' })
    .select()
    .maybeSingle()
  if (insErr || !created) return null
  return profileToAccount(created as ProfileRow, email)
}

/** Текущий пользователь или null (нет сессии). */
export async function getSessionAccount(): Promise<Account | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  const user = data.session?.user
  if (!user) return null
  return accountForUser(user.id, user.email ?? '')
}

export async function signIn(
  emailRaw: string,
  password: string,
): Promise<{ ok: boolean; error?: string; account?: Account }> {
  const email = emailRaw.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return { ok: false, error: 'Введите e-mail в формате name@company.ru' }
  if (!password) return { ok: false, error: 'Введите пароль' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const m = error.message
    return {
      ok: false,
      error: /invalid login credentials/i.test(m)
        ? 'Неверный e-mail или пароль. Если у вас нет учётной записи — запросите её у администратора.'
        : /email not confirmed/i.test(m)
          ? 'E-mail не подтверждён — сообщите администратору.'
          : /failed to fetch|network/i.test(m)
            ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
            : m,
    }
  }
  const user = data.user
  if (!user) return { ok: false, error: 'Не удалось определить пользователя' }
  const account = await accountForUser(user.id, user.email ?? email)
  if (!account) return { ok: false, error: 'Профиль не найден. Сообщите администратору.' }
  return { ok: true, account }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/** Письмо «восстановить пароль» (ссылка ведёт обратно на сайт). */
export async function requestPasswordReset(
  emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return { ok: false, error: 'Введите e-mail в формате name@company.ru' }
  const redirectTo =
    typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  )
  if (error) return { ok: false, error: dbError(error) }
  return { ok: true }
}

/** Смена собственного пароля: проверяем текущий повторным входом, затем updateUser. */
export async function changeOwnPassword(
  me: Account,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!me.email) return { ok: false, error: 'Не удалось определить e-mail аккаунта' }
  if (newPassword.length < 6) return { ok: false, error: 'Новый пароль — минимум 6 символов' }
  const { error: checkErr } = await supabase.auth.signInWithPassword({
    email: me.email,
    password: currentPassword,
  })
  if (checkErr) return { ok: false, error: 'Текущий пароль указан неверно' }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return error ? { ok: false, error: dbError(error) } : { ok: true }
}

// ---------------------------------------------------------------------------
// Доступ к данным (Supabase, фильтрация по RLS)
// ---------------------------------------------------------------------------

/** Постраничная выборка (PostgREST молча режет выдачу до 1000 строк). */
async function selectAll(
  table: string,
  order: string,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const rows: Record<string, unknown>[] = []
  let off = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(order, { ascending: false })
      .range(off, off + 999)
    if (error) return { rows, error: dbError(error) }
    const part = (data ?? []) as Record<string, unknown>[]
    rows.push(...part)
    if (part.length < 1000) break
    off += 1000
  }
  return { rows, error: null }
}

export interface FetchObjectsResult {
  objects: Project[]
  error: string | null
}

/**
 * Все доступные объекты. Полные карточки RLS отдаёт только для
 * admin/владельца/соучастника; витрина objects_overview добавляет базовую
 * информацию (ID, название, адрес, время создания) по остальным объектам.
 */
export async function fetchObjects(): Promise<FetchObjectsResult> {
  const [full, basic] = await Promise.all([selectAll('objects', 'created_at'), selectAll('objects_overview', 'created_at')])
  if (full.error && basic.error)
    return { objects: [], error: full.error || basic.error }
  const map = new Map<string, Project>()
  for (const r of full.rows) {
    const p = rowToProject(r as unknown as ObjectRow)
    map.set(p.id, p)
  }
  for (const r of basic.rows) {
    const p = overviewToProject(r as unknown as OverviewRow)
    if (!map.has(p.id)) map.set(p.id, p)
  }
  const objects = [...map.values()].sort((a, b) =>
    a.createdAt === b.createdAt
      ? (a.objectCode || '').localeCompare(b.objectCode || '')
      : a.createdAt < b.createdAt
        ? 1
        : -1,
  )
  return { objects, error: null }
}

/** Справочник типов объектов (таблица object_types). */
export async function fetchObjectTypes(): Promise<Array<{ id: number; name: string }>> {
  const { data, error } = await supabase
    .from('object_types')
    .select('id, name')
    .order('sort_order', { ascending: true })
  if (error || !data || !data.length) return [...OBJECT_TYPES_FALLBACK]
  return data as Array<{ id: number; name: string }>
}

/** Спецификации объекта (object_specs + object_spec_items). */
export async function fetchSpecs(objectId: string): Promise<ObjectSpec[]> {
  const { data, error } = await supabase
    .from('object_specs')
    .select(
      'id, spec_no, spec_date, source, protection, sum, extra, object_spec_items(name, qty, unit, sort)',
    )
    .eq('object_id', objectId)
    .order('spec_date', { ascending: true })
  if (error || !data) return []
  type SpecJoined = {
    id: string
    spec_no: string
    spec_date: string | null
    source: string | null
    protection: string | null
    sum: number | string | null
    extra: Record<string, unknown> | null
    object_spec_items: Array<{ name: string; qty: number | null; unit: string | null }> | null
  }
  return (data as unknown as SpecJoined[]).map((s) => ({
    id: s.id,
    specNo: String(s.spec_no ?? ''),
    specDate: s.spec_date
      ? new Date(s.spec_date).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '',
    source: String(s.source ?? ''),
    protection: String(s.protection ?? ''),
    items: (s.object_spec_items ?? []).map((it) => ({
      name: String(it.name ?? ''),
      qty: it.qty != null ? String(it.qty) : '',
    })),
    sum: s.sum != null ? Number(s.sum) : null,
    extra:
      s.extra && typeof s.extra === 'object'
        ? {
            brand: s.extra.brand != null ? String(s.extra.brand) : undefined,
            tech: s.extra.tech != null ? String(s.extra.tech) : undefined,
            supplier: s.extra.supplier != null ? String(s.extra.supplier) : undefined,
            buyer: s.extra.buyer != null ? String(s.extra.buyer) : undefined,
            fact: s.extra.fact != null ? Number(s.extra.fact) : undefined,
            remain: s.extra.remain != null ? Number(s.extra.remain) : undefined,
            profit: s.extra.profit != null ? Number(s.extra.profit) : undefined,
            margin: s.extra.margin != null ? Number(s.extra.margin) : undefined,
          }
        : null,
  }))
}

/** Создание/обновление спецификации (замена позиций целиком). */
export async function saveSpec(
  objectId: string,
  spec: ObjectSpec,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})(.*)$/.exec(spec.specDate.trim())
  const specDateIso = dmy ? new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4] || '00:00:00'}`) : null
  const row = {
    object_id: objectId,
    spec_no: spec.specNo.trim(),
    spec_date: specDateIso && !isNaN(specDateIso.getTime()) ? specDateIso.toISOString() : null,
    source: spec.source || null,
    protection: spec.protection || null,
  }
  let specId = spec.id
  if (specId) {
    const { error } = await supabase.from('object_specs').update(row).eq('id', specId)
    if (error) return { ok: false, error: dbError(error) }
  } else {
    const { data, error } = await supabase.from('object_specs').insert(row).select('id').single()
    if (error) return { ok: false, error: dbError(error) }
    specId = (data as { id: string }).id
  }
  const items = spec.items.filter((i) => i.name.trim())
  const del = await supabase.from('object_spec_items').delete().eq('spec_id', specId)
  if (del.error) return { ok: false, error: dbError(del.error) }
  if (items.length) {
    const { error } = await supabase.from('object_spec_items').insert(
      items.map((i, idx) => ({
        spec_id: specId,
        name: i.name.trim(),
        qty: Number(String(i.qty).replace(/\s/g, '').replace(',', '.')) || 0,
        sort: idx,
      })),
    )
    if (error) return { ok: false, error: dbError(error) }
  }
  return { ok: true, id: specId }
}

export async function deleteSpec(specId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('object_specs').delete().eq('id', specId)
  return error ? { ok: false, error: dbError(error) } : { ok: true }
}

/** Позиция спецификации 1С, приведённая к объекту (для отчёта админа). */
export interface SpecItemRow {
  objectId: string
  name: string
  sku: string // код из БД (обычно пуст — артикул внутри name)
  qty: number
}

/** Все позиции спецификаций 1С по всем доступным объектам (отчёт админа, RLS отфильтрует). */
export async function fetchAllSpecItems(): Promise<{ items: SpecItemRow[]; error: string | null }> {
  const specs = await selectAll('object_specs', 'created_at')
  if (specs.error) return { items: [], error: specs.error }
  const specToObj = new Map<string, string>()
  for (const r of specs.rows) {
    if (r.id != null && r.object_id != null) specToObj.set(String(r.id), String(r.object_id))
  }
  const rows = await selectAll('object_spec_items', 'id')
  if (rows.error) return { items: [], error: rows.error }
  const items: SpecItemRow[] = []
  for (const r of rows.rows) {
    const objectId = specToObj.get(String(r.spec_id ?? ''))
    if (!objectId) continue
    const qty = Number(r.qty ?? 0) || 0
    items.push({
      objectId,
      name: String(r.name ?? ''),
      sku: String(r.sku ?? '').trim(),
      qty,
    })
  }
  return { items, error: null }
}

/** Соучастники по списку объектов: objectId → [user_id]. */
export async function fetchParticipants(
  objectIds: string[],
): Promise<Record<string, string[]>> {
  if (!objectIds.length) return {}
  const out: Record<string, string[]> = {}
  for (let i = 0; i < objectIds.length; i += 200) {
    const chunk = objectIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('object_participants')
      .select('object_id, user_id')
      .in('object_id', chunk)
    if (error || !data) continue
    for (const r of data as Array<{ object_id: string; user_id: string }>) {
      ;(out[r.object_id] ??= []).push(r.user_id)
    }
  }
  return out
}

/** Замена списка соучастников объекта (только admin, проверит RLS). */
export async function setParticipants(
  objectId: string,
  userIds: string[],
  addedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const del = await supabase.from('object_participants').delete().eq('object_id', objectId)
  if (del.error) return { ok: false, error: dbError(del.error) }
  if (!userIds.length) return { ok: true }
  const { error } = await supabase
    .from('object_participants')
    .insert(userIds.map((user_id) => ({ object_id: objectId, user_id, added_by: addedBy })))
  return error ? { ok: false, error: dbError(error) } : { ok: true }
}

/** Профили пользователей (для админа — все, для партнёра — только свой). */
export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('company', { ascending: true })
  if (error || !data) return []
  return (data as ProfileRow[]).map((r) => profileToAccount(r))
}

export interface SaveObjectOptions {
  /** админ может завести объект на другого владельца */
  ownerId?: string
  /** дата внесения в базу (из 1С/CSV), ДД.ММ.ГГГГ */
  entryDate?: string
}

/** Создание или обновление карточки объекта. */
export async function saveObject(
  me: Account,
  form: FormData,
  existing?: Project,
  opts?: SaveObjectOptions,
): Promise<{ ok: boolean; error?: string; objectCode?: string }> {
  const f = sanitizeForm(form)
  const row: Record<string, unknown> = {
    object_name: f.objectName.trim(),
    address: f.address.trim(),
    address_json: f.addressData,
    type_id: f.typeId ? Number(f.typeId) : null,
    deadline: dmyToIsoDate(f.deadline),
    contractor: f.contractor.trim(),
    status: OBJECT_STATUSES.includes(f.status as (typeof OBJECT_STATUSES)[number])
      ? f.status
      : 'Новый',
    summary: f.summary.trim(),
    budget_amount: f.budgetAmount
      ? Number(f.budgetAmount.replace(/\s/g, '').replace(',', '.'))
      : null,
    budget_currency: f.budgetCurrency || 'RUB',
    spec: f.specItems.filter((i) => i.name.trim()),
  }
  if (opts?.entryDate && dmyToIsoDate(opts.entryDate)) row.entry_date = dmyToIsoDate(opts.entryDate)
  if (existing) {
    const { error } = await supabase.from('objects').update(row).eq('id', existing.id)
    return error ? { ok: false, error: dbError(error) } : { ok: true, objectCode: existing.objectCode }
  }
  row.owner_id = opts?.ownerId || me.id
  const { data, error } = await supabase.from('objects').insert(row).select('object_code').single()
  if (error) return { ok: false, error: dbError(error) }
  return { ok: true, objectCode: String((data as { object_code: string }).object_code ?? '') }
}

export async function deleteObject(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('objects').delete().eq('id', id)
  return error ? { ok: false, error: dbError(error) } : { ok: true }
}

/** Обновление профиля: своих полей — любой, чужих — админ (проверяет RLS). */
export async function updateProfileFields(
  id: string,
  patch: { company?: string; managerName?: string; phone?: string; email?: string },
): Promise<{ ok: boolean; error?: string }> {
  const upd: Record<string, unknown> = {}
  if (patch.company !== undefined) upd.company = patch.company.trim()
  if (patch.managerName !== undefined) upd.manager_name = patch.managerName.trim()
  if (patch.phone !== undefined) upd.phone = patch.phone.trim()
  if (patch.email !== undefined) upd.email = patch.email.trim()
  if (!Object.keys(upd).length) return { ok: true }
  const { error } = await supabase.from('profiles').update(upd).eq('id', id)
  return error ? { ok: false, error: dbError(error) } : { ok: true }
}

// ---------------------------------------------------------------------------
// Настройки приложения (app_settings)
// ---------------------------------------------------------------------------

export async function fetchSetting(key: string): Promise<string> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return ''
  return String((data as { value: string | null }).value ?? '')
}

export async function saveSetting(
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  return error ? { ok: false, error: dbError(error) } : { ok: true }
}

// ---------------------------------------------------------------------------
// Подсказки адреса (DaData)
// ---------------------------------------------------------------------------

export const DADATA_KEY_SETTING = 'dadata_api_key'

/**
 * Подсказки адреса DaData (REST API из браузера, ключ — из app_settings).
 * https://dadata.ru/api/suggest/address/
 */
export async function fetchAddressSuggestions(
  query: string,
  apiKey: string,
): Promise<AddressSuggestion[]> {
  if (!apiKey || query.trim().length < 3) return []
  try {
    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Token ' + apiKey,
      },
      body: JSON.stringify({ query: query.trim(), count: 6, language: 'ru' }),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { suggestions?: AddressSuggestion[] }
    return Array.isArray(json.suggestions) ? json.suggestions : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Формы карточки объекта
// ---------------------------------------------------------------------------

export function emptyForm(me: Account): FormData {
  return {
    objectName: '',
    address: '',
    addressData: null,
    typeId: '',
    deadline: '',
    contractor: '',
    status: 'Новый',
    summary: '',
    budgetAmount: '',
    budgetCurrency: 'RUB',
    specItems: [{ name: '', qty: '' }],
  }
}

export function toForm(p: Project): FormData {
  const {
    id: _id,
    objectCode: _code,
    ownerId: _ownerId,
    entryDate: _entry,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    access: _access,
    ...rest
  } = p
  return rest
}

// ---------------------------------------------------------------------------
// Валидация
// ---------------------------------------------------------------------------

export type ValidationErrors = Record<string, string>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+?[\d\s()-]{6,20}$/
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]{2,})+([/?#][^\s]*)?$/i

export function normalizeUrl(u: string): string {
  const t = u.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : 'https://' + t
}

export function formatDateInput(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean)
  return parts.join('.')
}

export function isValidDateDMY(s: string): boolean {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s.trim())
  if (!m) return false
  const d = Number(m[1])
  const mo = Number(m[2])
  const y = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return false
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

export function validateProject(d: FormData): ValidationErrors {
  const e: ValidationErrors = {}
  if (d.objectName.trim().length < 2)
    e.objectName = 'Укажите название объекта строительства'
  if (!d.address.trim()) e.address = 'Укажите адрес объекта'
  if (d.deadline.trim() && !isValidDateDMY(d.deadline)) e.deadline = 'Формат ДД.ММ.ГГГГ'
  if (d.budgetAmount.trim()) {
    const n = Number(d.budgetAmount.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) e.budgetAmount = 'Сумма должна быть положительным числом'
  }
  return e
}

// ---------------------------------------------------------------------------
// Форматирование
// ---------------------------------------------------------------------------

export function formatRuMoney(amount: string, currency: string): string {
  const n = Number(amount.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return amount + ' ' + (CURRENCY_SIGN[currency] ?? currency)
  return n.toLocaleString('ru-RU') + ' ' + (CURRENCY_SIGN[currency] ?? currency)
}

export function ruDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function ruDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function specToText(items: SpecItem[]): string {
  return items
    .filter((i) => i.name.trim())
    .map((i) => (i.qty.trim() ? `${i.name.trim()} × ${i.qty.trim()}` : i.name.trim()))
    .join('; ')
}

// ---------------------------------------------------------------------------
// Экспорт CSV / JSON-бэкап, импорт CSV
// ---------------------------------------------------------------------------

function csvCell(v: string): string {
  const t = String(v ?? '')
  return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}

export function objectsToCsv(objects: Project[], accounts: Account[]): string {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const head = [
    'Код объекта',
    'Дата внесения',
    'Название объекта',
    'Адрес объекта',
    'Тип объекта',
    'Планируемый срок сдачи',
    'Контрагент',
    'Статус',
    'Суть проекта',
    'Бюджет',
    'Валюта',
    'Планируемая спецификация',
    'Создан',
    'Владелец',
  ]
  const rows = objects.map((p) =>
    [
      p.objectCode,
      p.entryDate,
      p.objectName,
      p.address,
      p.typeId,
      p.deadline,
      p.contractor,
      p.status,
      p.summary,
      p.budgetAmount.replace(/\s/g, '').replace(',', '.'),
      p.budgetCurrency,
      specToText(p.specItems),
      ruDateTime(p.createdAt),
      byId.get(p.ownerId)?.profile.managerName || '',
    ]
      .map(csvCell)
      .join(';'),
  )
  return '\uFEFF' + head.map(csvCell).join(';') + '\r\n' + rows.join('\r\n')
}

export interface CsvImportRow {
  form: FormData
  entryDate: string
  manager: string
  objectCode: string
}

/** Разбор CSV объектов (разделитель «;», кодировка UTF-8 с BOM). */
export function parseObjectsCsv(text: string): { rows: CsvImportRow[]; errors: string[] } {
  const rows: CsvImportRow[] = []
  const errors: string[] = []
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').filter((l) => l.trim())
  if (!lines.length) return { rows, errors: ['Файл пуст'] }

  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ';') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }

  const header = parseLine(lines[0]).map((h) => h.toLowerCase())
  const idx = (name: string): number => header.findIndex((h) => h.includes(name))
  const iName = idx('название')
  const iAddr = idx('адрес')
  const iType = idx('тип')
  const iDeadline = idx('срок')
  const iContractor = idx('контрагент')
  const iStatus = idx('статус')
  const iEntry = idx('внесения')
  const iManager = idx('менеджер') >= 0 ? idx('менеджер') : idx('владелец')
  const iSummary = idx('суть')
  const iBudget = idx('бюджет')
  const iCode = idx('код объекта')
  if (iName < 0)
    return { rows, errors: ['Не найден столбец «Название объекта» — используйте шаблон'] }

  for (let li = 1; li < lines.length; li++) {
    const c = parseLine(lines[li])
    const name = (c[iName] ?? '').trim()
    if (!name) {
      errors.push(`Строка ${li + 1}: пропущена — нет названия объекта`)
      continue
    }
    rows.push({
      form: {
        objectName: name,
        address: (c[iAddr] ?? '').trim(),
        addressData: null,
        typeId: (c[iType] ?? '').trim(),
        deadline: formatDateInput((c[iDeadline] ?? '').trim()),
        contractor: (c[iContractor] ?? '').trim(),
        status: OBJECT_STATUSES.includes((c[iStatus] ?? '').trim() as (typeof OBJECT_STATUSES)[number])
          ? (c[iStatus] ?? '').trim()
          : 'Новый',
        summary: (c[iSummary] ?? '').trim(),
        budgetAmount: (c[iBudget] ?? '').replace(/\s/g, ''),
        budgetCurrency: 'RUB',
        specItems: [{ name: '', qty: '' }],
      },
      entryDate: formatDateInput((c[iEntry] ?? '').trim()),
      manager: (c[iManager] ?? '').trim(),
      objectCode: (c[iCode] ?? '').trim(),
    })
  }
  return { rows, errors }
}

/**
 * Импорт объектов из CSV (только admin). Владелец подбирается по
 * profiles.manager_name; нераспознанные — текущий админ.
 */
export async function importObjectsCsv(
  text: string,
  me: Account,
  types: Array<{ id: number; name: string }>,
): Promise<{ added: number; skipped: number; errors: string[] }> {
  const { rows, errors } = parseObjectsCsv(text)
  if (!rows.length) return { added: 0, skipped: 0, errors: errors.length ? errors : ['Нет данных'] }
  const accounts = await fetchAccounts()
  const byManager = new Map<string, Account>()
  for (const a of accounts) {
    const n = a.profile.managerName.trim().toLowerCase().replace('(увол.)', '').trim()
    if (n) byManager.set(n, a)
  }
  const typeByName = new Map(types.map((t) => [t.name.toLowerCase(), t.id]))
  let added = 0
  let skipped = 0
  for (const r of rows) {
    const owner = byManager.get(r.manager.toLowerCase().replace('(увол.)', '').trim())
    const typeId = /^\d+$/.test(r.form.typeId)
      ? r.form.typeId
      : String(typeByName.get(r.form.typeId.toLowerCase()) ?? '')
    const { ok } = await saveObject(
      me,
      { ...r.form, typeId },
      undefined,
      { ownerId: owner?.id || me.id, entryDate: r.entryDate },
    )
    if (ok) added++
    else skipped++
  }
  return { added, skipped, errors }
}

// ---------------------------------------------------------------------------
// Экспорт JSON (полный бэкап раздела)
// ---------------------------------------------------------------------------

export function exportObjectsJson(objects: Project[], accounts: Account[]): string {
  return JSON.stringify(
    {
      kind: 'sc-objects-backup',
      version: 3,
      exportedAt: new Date().toISOString(),
      accounts: accounts.map((a) => ({ ...a })),
      objects,
    },
    null,
    2,
  )
}

export function exportObjectJson(p: Project): string {
  return JSON.stringify({ kind: 'sc-objects-object', version: 3, object: p }, null, 2)
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

export function downloadFile(name: string, content: string, mime = 'application/json'): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
