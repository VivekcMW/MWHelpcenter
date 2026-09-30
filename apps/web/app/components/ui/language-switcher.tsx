import { useId } from 'react'
import { Form, useLocation, useNavigation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Globe } from 'lucide-react'
import { locales, type Locale } from '../../i18n/config'
import { Spinner } from './spinner'

export function LanguageSwitcher({ locale }: { readonly locale: Locale }) {
  const id = useId()
  const { t } = useTranslation('navigation')
  const location = useLocation()
  const navigation = useNavigation()
  const switching = navigation.state !== 'idle' && navigation.formAction === '/language'
  return <Form action="/language" method="get" className="language-switcher" aria-busy={switching}>
    <input type="hidden" name="from" value={location.pathname + location.search + location.hash} />
    <label className="sr-only" htmlFor={id}>{t('language')}</label>
    <div className="language-select-wrap">
      <span className="language-globe" aria-hidden="true">{switching ? <Spinner /> : <Globe size={16} />}</span>
      <select id={id} name="to" value={locale} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
        {locales.map((item) => <option key={item.code} value={item.code} lang={item.code}>{item.label}</option>)}
      </select>
      <ChevronDown className="language-chevron" size={14} aria-hidden="true" />
    </div>
    <noscript><button className="button button-outline" type="submit">{t('languageApply')}</button></noscript>
  </Form>
}