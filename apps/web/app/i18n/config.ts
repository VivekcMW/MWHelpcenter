export const locales = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ja', label: '日本語', dir: 'ltr' },
] as const
export type Locale = (typeof locales)[number]['code']
export const defaultLocale: Locale = 'en'

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale.code === value)
}

export function requireLocale(value: string | undefined): Locale {
  if (!isLocale(value)) throw new Response('Unsupported language', { status: 404 })
  return value
}

export function localePath(locale: Locale, path = '') {
  return `/${locale}${path ? `/${path.replace(/^\/+/, '')}` : ''}`
}

export function localeFromPath(pathname: string): Locale {
  const candidate = pathname.split('/')[1]
  return isLocale(candidate) ? candidate : defaultLocale
}

export function formatDate(value: string, locale: Locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}