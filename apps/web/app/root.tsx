import { useEffect, useMemo, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError, useRouteLoaderData, useLocation, type LoaderFunctionArgs } from 'react-router'
import { createI18n } from './i18n/instance'
import { defaultLocale, isLocale, localeFromPath, localePath, locales } from './i18n/config'
import { getEnv } from './lib/env.server'
import { SiteShell } from './components/layout/site-shell'
import { LanguageSwitcher } from './components/ui/language-switcher'
import { FeedbackToaster } from './components/ui/toaster'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource-variable/noto-sans-jp'
import './styles/tokens.css'
import './styles/components.css'
import './styles/globals.css'
import './styles/motion.css'
import './styles/feedback.css'

export function loader({ params }: LoaderFunctionArgs) {
  const env = getEnv()
  return {
    locale: isLocale(params.locale) ? params.locale : defaultLocale,
    demo: env.CONTENT_MODE === 'demo',
    siteUrl: env.SITE_URL,
  }
}

export function headers() { return { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } }

export function Layout({ children }: { readonly children: ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root')
  const location = useLocation()
  const locale = localeFromPath(location.pathname)
  const i18n = useMemo(() => createI18n(locale), [locale])
  const canonical = data ? new URL(location.pathname, data.siteUrl).href : undefined
  useEffect(() => {
    document.documentElement.classList.add('js-enabled')
    return () => document.documentElement.classList.remove('js-enabled')
  }, [])
  return <html lang={locale} dir={locales.find((item) => item.code === locale)!.dir}>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="theme-color" content="#1D65AF" />
      {(data?.demo || location.pathname.endsWith('/search')) && <meta name="robots" content="noindex, nofollow" />}
      {canonical && <link rel="canonical" href={canonical} />}
      <Meta /><Links />
    </head>
    <body><I18nextProvider i18n={i18n}>{children}<FeedbackToaster /></I18nextProvider><ScrollRestoration /><Scripts /></body>
  </html>
}

export default function App() { return <SiteShell><Outlet /></SiteShell> }

export function ErrorBoundary() {
  const error = useRouteError()
  const location = useLocation()
  const locale = localeFromPath(location.pathname)
  const t = createI18n(locale).t
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return <main className="error-page"><LanguageSwitcher locale={locale} /><p className="eyebrow">{t('siteTitle')}</p><h1>{t(notFound ? 'notFoundTitle' : 'errorTitle')}</h1><p>{t('errorDescription')}</p><div className="article-actions">{!notFound && <a className="button button-outline" href={location.pathname + location.search}>{t('retry', { ns: 'feedback' })}</a>}<a className="button" href={localePath(locale)}>{t('backHome')}</a></div></main>
}