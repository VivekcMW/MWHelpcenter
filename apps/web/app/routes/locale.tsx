import { Outlet, type LoaderFunctionArgs } from 'react-router'
import { requireLocale } from '../i18n/config'

export function loader({ params }: LoaderFunctionArgs) { return { locale: requireLocale(params.locale) } }
export default function LocaleLayout() { return <Outlet /> }