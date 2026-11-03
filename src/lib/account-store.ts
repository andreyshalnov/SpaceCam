'use client'

// Общее хранилище аккаунта (раздел «Регистрация проекта», админ-панель, личные цены).
// Модульный синглтон + подписки: состояние общее для всех компонентов страницы.

import { useEffect, useState } from 'react'
import { getSessionAccount, signOut as registrySignOut, type Account } from './registry'

type AccountState = { ready: boolean; account: Account | null }

let state: AccountState = { ready: false, account: null }
const listeners = new Set<(s: AccountState) => void>()
let started = false

function emit(patch: Partial<AccountState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}

async function init() {
  if (started) return
  started = true
  try {
    const account = await getSessionAccount()
    emit({ account, ready: true })
  } catch {
    emit({ account: null, ready: true })
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = await import('./supabase')
    supabase.auth.onAuthStateChange(() => {
      getSessionAccount()
        .then((account) => emit({ account, ready: true }))
        .catch(() => emit({ account: null, ready: true }))
    })
  } catch {
    /* supabase недоступен — работаем без аккаунта */
  }
}

export function useAccount(): { loading: boolean; account: Account | null } {
  const [s, setS] = useState<AccountState>(state)
  useEffect(() => {
    listeners.add(setS)
    init()
    if (state.ready) setS(state)
    return () => {
      listeners.delete(setS)
    }
  }, [])
  return { loading: !s.ready, account: s.account }
}

export async function signOutAccount(): Promise<void> {
  await registrySignOut()
}
