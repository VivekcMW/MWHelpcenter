import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Menu, X } from 'lucide-react'
import { localePath, type Locale } from '../../i18n/config'
import { LanguageSwitcher } from '../ui/language-switcher'

function NavigationLinks({ locale }: { readonly locale: Locale }) {
  const { t } = useTranslation('navigation')
  const { pathname, hash } = useLocation()
  const home = localePath(locale)
  const productLocation = pathname === home && hash === '#products' ? 'location' : undefined
  const productsCurrent = pathname.startsWith(`${home}/products/`)
    ? true
    : productLocation
  return <>
    <Link to={`${home}#products`} aria-current={productsCurrent}>{t('products')}</Link>
    <NavLink end to={localePath(locale, 'collections/getting-started')}>{t('gettingStarted')}</NavLink>
    <NavLink end to={localePath(locale, 'collections/best-practices')}>{t('bestPractices')}</NavLink>
  </>
}

export function SiteHeader({ locale }: { readonly locale: Locale }) {
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
      <Link className="brand" to={localePath(locale)} aria-label={t('siteTitle')}>
        <img className="brand-logo" src="/mw-logo.svg" width={100} height={47} alt="" />
        <span className="brand-divider">{nav('helpCenter')}</span>
      </Link>
      <nav className="main-nav" aria-label={nav('primary')}><NavigationLinks locale={locale} /></nav>
      <div className="header-actions"><LanguageSwitcher locale={locale} /></div>
      <details className="mobile-navigation" ref={menu}>
        <summary>
          <span className="sr-only">{nav('menu')}</span>
          <Menu className="menu-open-icon" size={22} aria-hidden="true" />
          <X className="menu-close-icon" size={22} aria-hidden="true" />
        </summary>
        <nav className="mobile-nav" aria-label={nav('primary')}>
          <NavigationLinks locale={locale} />
        </nav>
      </details>
    </div>
  </header>
}