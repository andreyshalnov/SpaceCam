'use client'

// Новости: публичная страница #/news (только published) + админ-вкладка «Новости»
// в кабинете (CRUD таблицы news). Порядок: дата ↓, затем id ↓ (свежие выше).

import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface NewsRow {
  id: number
  news_date: string
  body: string
  published?: boolean
}

function nwsRuDate(v: string | null | undefined): string {
  const p = String(v || '').slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(v || '')
}

function nwsToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function NewsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Megaphone className={className} aria-hidden />
}

/** Публичная страница новостей (#/news). */
export function NewsPage({ PageHeader }: { PageHeader: React.ComponentType<{ kicker: string; title: string; sub: string }> }) {
  const [rows, setRows] = useState<NewsRow[]>([])
  const [state, setState] = useState<'load' | 'ok' | 'err'>('load')

  useEffect(() => {
    let live = true
    supabase
      .from('news')
      .select('id,news_date,body')
      .eq('published', true)
      .order('news_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(500)
      .then(({ data, error }: { data: NewsRow[] | null; error: { message: string } | null }) => {
        if (!live) return
        if (error) setState('err')
        else {
          setRows(data || [])
          setState('ok')
        }
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <>
      <PageHeader
        kicker="Новости"
        title="Новости SpaceCam и R-Lock"
        sub="Объявления и обновления портала: продукция, цены, документы и проекты."
      />
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {state === 'load' ? (
            <p className="py-8 text-center text-sm text-[#707075]">Загрузка…</p>
          ) : state === 'err' ? (
            <p className="py-8 text-center text-sm text-[#707075]">Новости скоро появятся.</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#707075]">Пока нет новостей.</p>
          ) : (
            <div className="max-w-3xl space-y-4">
              {rows.map((n) => (
                <article key={`nws${n.id}`} className="rounded-xl border border-[#e6e8de] bg-white p-5 shadow-sm sm:p-6">
                  <div className="inline-block rounded bg-[#f4f8e4] px-2 py-0.5 text-[11px] font-semibold text-[#4a6b12]">
                    {nwsRuDate(n.news_date)}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-base sm:text-lg leading-relaxed text-[#4b4d45]">{n.body}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

/** Админ-вкладка «Новости» в кабинете (CRUD). */
export function NewsAdminTab() {
  const [list, setList] = useState<NewsRow[]>([])
  const [state, setState] = useState<'load' | 'ok' | 'err'>('load')
  const [date, setDate] = useState(nwsToday())
  const [body, setBody] = useState('')
  const [pub, setPub] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function load() {
    setState('load')
    supabase
      .from('news')
      .select('id,news_date,body,published')
      .order('news_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(500)
      .then(({ data, error }: { data: NewsRow[] | null; error: { message: string } | null }) => {
        if (error) {
          setState('err')
          setMsg(error.message || 'Ошибка загрузки')
        } else {
          setList(Array.isArray(data) ? data : [])
          setState('ok')
        }
      })
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(row: NewsRow) {
    setEditId(row.id)
    setBody(row.body || '')
    setPub(!!row.published)
    setDate(String(row.news_date || '').slice(0, 10))
    setMsg('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setEditId(null)
    setBody('')
    setPub(true)
    setDate(nwsToday())
    setMsg('')
  }

  async function save() {
    if (!body.trim()) {
      setMsg('Введите текст новости')
      return
    }
    setBusy(true)
    setMsg('')
    const row = { body: body.trim(), news_date: date || nwsToday(), published: pub }
    const q = editId
      ? supabase.from('news').update(row).eq('id', editId)
      : supabase.from('news').insert(row)
    const { error } = await q
    setBusy(false)
    if (error) setMsg(error.message || 'Ошибка сохранения')
    else {
      resetForm()
      load()
    }
  }

  async function del(id: number) {
    if (!window.confirm('Удалить новость?')) return
    setBusy(true)
    const { error } = await supabase.from('news').delete().eq('id', id)
    setBusy(false)
    if (error) setMsg(error.message || 'Ошибка удаления')
    else {
      if (editId === id) resetForm()
      load()
    }
  }

  return (
    <div>
      <div className="mb-6 rounded-xl border border-[#e6e8de] bg-white p-4 sm:p-5">
        <h3 className="text-base font-bold text-[#111112]">{editId ? `Изменить новость №${editId}` : 'Новая новость'}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border border-[#e6e8de] bg-white px-3 text-sm outline-none focus:border-[#a6ce39]"
          />
          <label className="flex items-center gap-2 text-sm text-[#4b4d45]">
            <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> Опубликована
          </label>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Текст новости…"
          className="mt-3 w-full rounded-md border border-[#e6e8de] bg-white p-3 text-sm outline-none focus:border-[#a6ce39]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex items-center rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-black hover:bg-[#95bb31] disabled:opacity-50"
          >
            {editId ? 'Сохранить' : 'Добавить новость'}
          </button>
          {editId ? (
            <button
              type="button"
              disabled={busy}
              onClick={resetForm}
              className="inline-flex items-center rounded-md border border-[#e6e8de] bg-white px-4 py-2 text-sm font-medium text-[#111112] hover:bg-[#f4f6ec]"
            >
              Отмена
            </button>
          ) : null}
          {msg ? <span className="text-sm text-[#b02a2a]">{msg}</span> : null}
        </div>
      </div>

      {state === 'err' ? (
        <p className="mb-4 rounded-md border border-[#e3c98a] bg-[#faf3e0] px-3 py-2 text-sm text-[#8a6d1f]">
          Таблица news недоступна — выполните SQL (создание таблицы news) в Supabase SQL Editor. {msg}
        </p>
      ) : null}

      {state === 'load' ? (
        <p className="text-sm text-[#707075]">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[#707075]">Новостей пока нет — добавьте первую.</p>
      ) : (
        <div className="space-y-3">
          {list.map((row) => (
            <div key={`nwsA${row.id}`} className="rounded-xl border border-[#e6e8de] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#f4f8e4] px-2 py-0.5 text-[11px] font-semibold text-[#4a6b12]">
                    {nwsRuDate(row.news_date)}
                  </span>
                  {row.published ? (
                    <span className="rounded bg-[#eef6ff] px-2 py-0.5 text-[11px] font-medium text-[#1d5b8f]">опубликована</span>
                  ) : (
                    <span className="rounded bg-[#f3f3f1] px-2 py-0.5 text-[11px] font-medium text-[#707075]">черновик</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="rounded-md border border-[#e6e8de] bg-white px-3 py-1.5 text-xs font-medium text-[#111112] hover:bg-[#f4f6ec]"
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void del(row.id)}
                    className="rounded-md border border-[#e9c9c9] bg-white px-3 py-1.5 text-xs font-medium text-[#b02a2a] hover:bg-[#fdf3f3] disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#4b4d45]">{row.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
