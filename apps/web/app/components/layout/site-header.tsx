import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Menu, X } from 'lucide-react'
import { localePath, type Locale } from '../../i18n/config'
import { LanguageSwitcher } from '../ui/language-switcher'

type NavigationLink = {_key: string; label: string; destination: 'products' | 'getting-started' | 'best-practices'}

function NavigationLinks({locale, links}: {readonly locale: Locale; readonly links?: NavigationLink[]}) {
  const { t } = useTranslation('navigation')
  const { pathname, hash } = useLocation()
  const home = localePath(locale)
  const productLocation = pathname === home && hash === '#products' ? 'location' : undefined
  const productsCurrent = pathname.startsWith(`${home}/products/`)
    ? true
    : productLocation
  const items = links?.length ? links : [
    {_key: 'products', label: t('products'), destination: 'products' as const},
    {_key: 'getting-started', label: t('gettingStarted'), destination: 'getting-started' as const},
    {_key: 'best-practices', label: t('bestPractices'), destination: 'best-practices' as const},
  ]
  return <>{items.map((item) => {
    const to = item.destination === 'products' ? `${home}#products` : localePath(locale, `collections/${item.destination}`)
    const current = item.destination === 'products'
      ? productsCurrent
      : pathname === localePath(locale, `collections/${item.destination}`) ? 'page' : undefined
    return <Link key={item._key} to={to} aria-current={current}>{item.label}</Link>
  })}</>
}

export function SiteHeader({locale, title, navigationLinks}: {readonly locale: Locale; readonly title?: string; readonly navigationLinks?: NavigationLink[]}) {
  const { t } = useTranslation()
  const { t: nav } = useTranslation('navigation')
  const { pathname, search, hash } = useLocation()
  const menu = useRef<HTMLDetailsElement>(null)

  // Keep native disclosure behavior (including without JS); close on navigation,
  // including back/forward, query changes and the Products anchor.
  useEffect(() => {
    if (menu.current) menu.current.open = false
  }, [pathname, search, hash])

  useEffect(() => {
    const disclosure = menu.current
    if (!disclosure) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && disclosure.open) {
        event.preventDefault()
        disclosure.open = false
        disclosure.querySelector('summary')?.focus()
      }
    }
    const closeOnLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest('a')) {
        disclosure.open = false
        disclosure.querySelector('summary')?.focus()
      }
    }
    disclosure.addEventListener('keydown', closeOnEscape)
    disclosure.addEventListener('click', closeOnLink)
    return () => {
      disclosure.removeEventListener('keydown', closeOnEscape)
      disclosure.removeEventListener('click', closeOnLink)
    }
  }, [])

  return <header className="site-header">
    <div className="header-inner">
      <Link className="brand" to={localePath(locale)} aria-label={title || t('siteTitle')}>
        <img className="brand-logo" src="/mw-logo.svg" width={100} height={47} alt="" />
        <span className="brand-divider">{nav('helpCenter')}</span>
      </Link>
      <nav className="main-nav" aria-label={nav('primary')}><NavigationLinks locale={locale} links={navigationLinks} /></nav>
      <div className="header-actions"><LanguageSwitcher locale={locale} /></div>
      <details className="mobile-navigation" ref={menu}>
        <summary>
          <span className="sr-only">{nav('menu')}</span>
          <Menu className="menu-open-icon" size={22} aria-hidden="true" />
          <X className="menu-close-icon" size={22} aria-hidden="true" />
        </summary>
        <nav className="mobile-nav" aria-label={nav('primary')}>
          <NavigationLinks locale={locale} links={navigationLinks} />
        </nav>
      </details>
    </div>
  </header>
}