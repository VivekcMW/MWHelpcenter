import type { ReactNode } from 'react'
import { Link, useLocation, useNavigation, useRouteLoaderData } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'
import type { loader } from '../../root'
import { localePath, defaultLocale } from '../../i18n/config'
import { SiteHeader } from './site-header'
import { NavigationFeedback } from '../ui/loading-feedback'

export function SiteShell({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation()
  const { t: nav } = useTranslation('navigation')
  const data = useRouteLoaderData<typeof loader>('root')
  const locale = data?.locale ?? defaultLocale
  const { pathname } = useLocation()
  const { search } = useLocation()
  const navigation = useNavigation()
  const pending = navigation.state !== 'idle'
  return <>
    <a className="skip-link" href="#main">{nav('skip')}</a>
    <div className="navigation-progress" hidden={!pending} aria-hidden="true"><span /></div>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{pending ? nav('loading') : ''}</div>
    <NavigationFeedback />
    {data?.demo && <div className="demo-banner">{t('demo')}</div>}
    <SiteHeader locale={locale} />
    <main id="main" tabIndex={-1} aria-busy={pending}>
      {new URLSearchParams(search).get('translation') === 'unavailable' && <div className="page-container"><output className="callout" style={{ display: 'block' }}>{t('translationUnavailable')}</output></div>}
      {/* Only a new pathname replays entry motion; query/hash changes retain the subtree. */}
      <div className="route-content" key={pathname}>{children}</div>
    </main>
    <footer className="site-footer"><div><img className="brand-logo" src="/mw-logo.svg" width={100} height={47} alt="Moving Walls" /><span>{t('footer')}</span></div><span>{t('footerNote')}</span><Link to={localePath(locale, 'support')}>{nav('support')} <ArrowUpRight size={16} aria-hidden="true" /></Link></footer>
  </>
}