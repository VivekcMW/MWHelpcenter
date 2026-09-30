import { redirect } from 'react-router'
import { defaultLocale } from '../i18n/config'

export function loader() { return redirect(`/${defaultLocale}`, 302) }