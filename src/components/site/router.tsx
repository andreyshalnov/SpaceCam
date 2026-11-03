'use client'

import { useEffect, useState } from 'react'

export type Route =
  | { page: 'home' }
  | { page: 'section'; section: string }
  | { page: 'product'; id: string }
  | { page: 'about' }
  | { page: 'projects' }
  | { page: 'support' }
  | { page: 'where' }
  | { page: 'solutions' }
  | { page: 'project-reg' }
  | { page: 'login' }
  | { page: 'admin-prices' }
  | { page: 'news' }
  | { page: 'notfound' }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  if (!h) return { page: 'home' }
  const parts = h.split('/')
  if (parts[0] === 'product' && parts[1]) return { page: 'product', id: decodeURIComponent(parts[1]) }
  if (['intercom', 'switches', 'nodes', 'rlock'].includes(parts[0])) return { page: 'section', section: parts[0] }
  if (['about', 'projects', 'support', 'where', 'solutions', 'project-reg', 'login', 'admin-prices', 'news'].includes(parts[0]))
    return { page: parts[0] as 'about' }
  return { page: 'notfound' }
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(typeof window !== 'undefined' ? window.location.hash : ''))
  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export function formatPrice(n: number): string {
  const rounded = Math.round(n)
  return rounded.toLocaleString('ru-RU') + ' ₽'
}
