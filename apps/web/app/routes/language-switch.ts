import { redirect, type LoaderFunctionArgs } from 'react-router'
import { requireLocale } from '../i18n/config'
import { languageDestination } from '../lib/switch-language.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const target = requireLocale(url.searchParams.get('to') ?? undefined)
  const destination = await languageDestination((url.searchParams.get('from') ?? '').slice(0, 2048), target)
  return redirect(destination, { headers: { 'Cache-Control': 'no-store' } })
}