'use client'

import { useEffect, useState } from 'react'
import { getSessionAccount, type Account } from './registry'
import { supabase } from './supabase'

// Общий синглтон-статус аккаунта: один источник для карточек каталога,
// страниц товара и раздела «Регистрация проекта» (T19-4).
type State = { ready: boolean; account: Account | null }
let state: State = { ready: false, account: null }
const subs = new Set<(s: State) => void>()
let started = false

function setState(next: Partial<State>) {
  state = { ...state, ...next }
  subs.forEach((fn) => fn(state))
}

async function bootstrap() {
  if (started) return
  started = true
  const account = await getSessionAccount()
  setState({ account, ready: true })
  // Вход/выход в любой вкладке и после signIn/signUp обновляют все подписчики
  supabase.auth.onAuthStateChange((_event) => {
    getSessionAccount()
      .then((account) => setState({ account, ready: true }))
      .catch(() => setState({ account: null, ready: true }))
  })
}

export function useAccount(): { loading: boolean; account: Account | null } {
  const [local, setLocal] = useState<State>(state)
  useEffect(() => {
    subs.add(setLocal)
    bootstrap()
    if (state.ready) setLocal(state)
    return () => {
      subs.delete(setLocal)
    }
  }, [])
  return { loading: !local.ready, account: local.account }
}
