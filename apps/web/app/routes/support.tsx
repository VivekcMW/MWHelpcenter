import { useEffect, useState } from 'react'
import { useLoaderData, useLocation, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'
import { requireLocale } from '../i18n/config'
import { createI18n } from '../i18n/instance'
import { getEnv } from '../lib/env.server'

export function loader({ params }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale)
  return { locale, supportEmail: getEnv().SUPPORT_EMAIL }
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => [{ title: `${createI18n(data?.locale ?? 'en').t('contactSupport')} | Moving Walls` }]
export default function SupportPage() {
  const { supportEmail } = useLoaderData<typeof loader>()
  const { t } = useTranslation()
  const { t: feedback } = useTranslation('feedback')
  const location = useLocation()
  const [incomingDraft, setIncomingDraft] = useState('')
  const [draft, setDraft] = useState('')
  useEffect(() => {
    const next = typeof location.state?.chatDraft === 'string' ? location.state.chatDraft.slice(0, 2000) : ''
    setIncomingDraft(next)
    setDraft(next)
  }, [location.state, location.key])
  const emailHref = `mailto:${supportEmail}${incomingDraft ? `?subject=${encodeURIComponent(feedback('chatEmailSubject'))}&body=${encodeURIComponent(draft)}` : ''}`
  return <div className="page-container inner-page narrow">
    <div className="page-heading"><p className="eyebrow">{t('contactSupport')}</p><h1>{t('supportTitle')}</h1><p>{t('supportDescription')}</p></div>
    {incomingDraft && <div className="support-draft">
      <label htmlFor="support-draft">{feedback('chatDraftLabel')}</label>
      <p>{feedback('chatDraftPrivacy')}</p>
      <textarea id="support-draft" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} />
    </div>}
    {supportEmail ? <a className="button" href={emailHref}>{t('supportEmail')} <ArrowUpRight size={18} aria-hidden="true" /></a> : <div className="callout"><p>{t('supportPending')}</p></div>}
  </div>
}