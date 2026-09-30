import { Form, useNavigation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Search } from 'lucide-react'
import { Spinner } from './spinner'
import { localePath, type Locale } from '../../i18n/config'

export function SearchForm({ locale, query = '', product = '' }: { readonly locale: Locale; readonly query?: string; readonly product?: string }) {
  const { t } = useTranslation('search')
  const navigation = useNavigation()
  const action = localePath(locale, 'search')
  const pending = navigation.state !== 'idle' && navigation.formAction === action && navigation.formData?.has('q') === true
  return <Form role="search" action={action} className="search-form">
    <Search className="search-icon" size={22} aria-hidden="true" />
    <input key={query} type="search" name="q" aria-label={t('label')} placeholder={t('placeholder')} defaultValue={query} maxLength={200} />
    {product && <input type="hidden" name="product" value={product} />}
    <button className="button" type="submit" aria-busy={pending}>{t('submit')} {pending ? <Spinner className="search-spinner" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
  </Form>
}