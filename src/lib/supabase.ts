// Клиент Supabase для раздела «Регистрация проекта».
//
// Publishable-ключ публичен по дизайну (он виден в статическом бандле);
// доступ к данным ограничивают RLS-политики на стороне Postgres.
// Значения можно переопределить переменными окружения при сборке:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kgdrtrfwsyixprvuzdqj.supabase.co'

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_Dq5Q8RMTgmL7rnvs-R0SVw__o2Xyabz'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, // сессия живёт в localStorage браузера
    autoRefreshToken: true,
    detectSessionInUrl: true, // вход по ссылке из письма восстановления
  },
})
