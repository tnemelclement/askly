import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'askly-theme'

function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Habillage du back-office : classe `app` (DA) et `dark` sur <html>, retirées en sortant
 * pour que la page du répondant garde la sienne.
 */
export function useAppTheme() {
  const [theme, setTheme] = useState<Theme>(stored)
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    root.classList.add('app')
    apply()
    media.addEventListener('change', apply)
    try {
      localStorage.setItem(KEY, theme)
    } catch {}
    return () => {
      media.removeEventListener('change', apply)
      root.classList.remove('app', 'dark')
    }
  }, [theme])
  return [theme, setTheme] as const
}
