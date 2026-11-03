'use client'

import React, { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { signIn, requestPasswordReset } from '@/lib/registry'

// Вход в аккаунт (site-spacecam-23) — нужен для персональных цен и наличия.
// Учётные записи выдаёт администратор ПТК (Supabase → Authentication).

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [info, setInfo] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'reset') {
        const r = await requestPasswordReset(email)
        if (r.ok) {
          setInfo('Письмо со ссылкой для смены пароля отправлено на указанный e-mail.')
        } else {
          setError(r.error ?? 'Не удалось отправить письмо')
        }
        return
      }
      const r = await signIn(email, password)
      if (r.ok) {
        // сессия подхватится глобально (useAccount); возвращаемся на главную
        window.location.hash = '#/'
        window.scrollTo({ top: 0 })
      } else {
        setError(r.error ?? 'Не удалось войти')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-[#f5f6f1] py-14">
      <div className="mx-auto max-w-md px-4 sm:px-6">
        <div className="rounded-xl border border-[#e6e8de] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eef6d8]">
              <KeyRound className="h-6 w-6 text-[#5c7a12]" aria-hidden />
            </div>
            <h1 className="mt-3 text-xl font-extrabold tracking-tight text-[#111112]">
              {mode === 'login' ? 'Вход в аккаунт' : 'Восстановление пароля'}
            </h1>
            <p className="mt-1.5 text-sm text-[#707075]">
              {mode === 'login'
                ? 'Персональные цены и наличие на складах РФ — после входа.'
                : 'Укажите e-mail — пришлём ссылку для смены пароля.'}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-[#111112]">
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.ru"
                className="h-10 w-full rounded-md border border-[#e6e8de] bg-white px-3 text-sm text-[#111112] outline-none focus:border-[#a6ce39] focus-visible:ring-2 focus-visible:ring-[#a6ce39]"
              />
            </div>
            {mode === 'login' && (
              <div>
                <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-[#111112]">
                  Пароль
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-md border border-[#e6e8de] bg-white px-3 text-sm text-[#111112] outline-none focus:border-[#a6ce39] focus-visible:ring-2 focus-visible:ring-[#a6ce39]"
                />
              </div>
            )}

            {error && (
              <p className="rounded-md border border-[#e8b9b9] bg-[#fbeeee] px-3 py-2 text-sm text-[#a33]" role="alert">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-md border border-[#cfe39a] bg-[#eef6d8] px-3 py-2 text-sm text-[#4a6b12]" role="status">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#a6ce39] px-4 text-sm font-bold text-black transition-colors hover:bg-[#95bb31] disabled:opacity-50"
            >
              {busy ? 'Отправляем…' : mode === 'login' ? 'Войти' : 'Отправить письмо'}
            </button>
          </form>

          <div className="mt-4 space-y-1.5 text-center text-xs text-[#707075]">
            <p>
              {mode === 'login' ? 'Забыли пароль? ' : 'Помните пароль? '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'reset' : 'login')
                  setError('')
                  setInfo('')
                }}
                className="font-semibold text-[#5c7a12] hover:underline"
              >
                {mode === 'login' ? 'Восстановить пароль' : 'Войти'}
              </button>
            </p>
            <p>
              Нет учётной записи? Аккаунты выдаёт администратор ПТК — раздел{' '}
              <a href="#/project-reg" className="font-semibold text-[#5c7a12] hover:underline">
                «Регистрация проекта»
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
