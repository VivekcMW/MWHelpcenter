import { useState } from 'react'
import { useActionData, useFetcher } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { localePath, type Locale } from '../../i18n/config'
import type { HelpfulnessResult, HelpfulnessView } from '../../features/helpfulness'
import { Spinner } from './spinner'

export function ArticleHelpfulness({ locale, slug, saved }: {
  readonly locale: Locale
  readonly slug: string
  readonly saved: HelpfulnessView
}) {
  const { t } = useTranslation('feedback')
  const id = `mw-article-helpfulness-${locale}-${slug}`
  const fetcher = useFetcher<HelpfulnessResult>()
  // Document submissions render the same confirmation without JavaScript.
  const documentResult = useActionData<HelpfulnessResult>()
  const result = fetcher.data ?? documentResult
  const initial = result?.ok ? result : saved
  const [vote, setVote] = useState(initial.vote)
  const [reason, setReason] = useState(initial.reason)
  const pending = fetcher.state !== 'idle'
  const confirmed = !pending && result?.ok && result.vote === vote && (vote === 'yes' || result.reason === reason)

  if (!saved.enabled && !result) return null
  return <section className="article-helpfulness" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{t('helpfulnessTitle')}</h2>
    <p className="mw-field-hint" id={`${id}-privacy`}>{t('helpfulnessPrivacy')}</p>
    {saved.demo && <p className="mw-field-hint">{t('helpfulnessDemo')}</p>}
    <fetcher.Form method="post" action={localePath(locale, `articles/${slug}`)} aria-describedby={`${id}-privacy`} aria-busy={pending}>
      <fieldset disabled={pending || !saved.enabled} className="helpfulness-fields">
        <legend className="sr-only">{t('helpfulnessTitle')}</legend>
        <div className="helpfulness-options">
          {(['yes', 'no'] as const).map((value) => <label className="helpfulness-choice" key={value}>
            <input type="radio" name="vote" value={value} required checked={vote === value} onChange={() => setVote(value)} />
            <span>{value === 'yes' ? <ThumbsUp size={18} aria-hidden="true" /> : <ThumbsDown size={18} aria-hidden="true" />}{t(value === 'yes' ? 'helpfulnessYes' : 'helpfulnessNo')}</span>
          </label>)}
        </div>
        <label className="mw-field-label" htmlFor={`${id}-reason`}>{t('helpfulnessReason')}</label>
        <select className="mw-select" id={`${id}-reason`} name="reason" value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="">{t('helpfulnessNoReason')}</option>
          {(['unclear', 'missing', 'outdated', 'other'] as const).map((value) => <option key={value} value={value}>{t(`helpfulnessReasons.${value}`)}</option>)}
        </select>
        <div className="helpfulness-trap" aria-hidden="true">
          <label htmlFor={`${id}-website`}>Website</label>
          <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button className="button" type="submit">{pending ? <><Spinner />{t('helpfulnessSaving')}</> : t('helpfulnessSubmit')}</button>
      </fieldset>
    </fetcher.Form>
    <div role="status" aria-live="polite" aria-atomic="true" className="helpfulness-status">
      {confirmed && <p><CheckCircle2 size={18} aria-hidden="true" />{t('helpfulnessThanks')}</p>}
      {!result && saved.vote && <p>{t('helpfulnessPreviouslySaved')}</p>}
    </div>
    {result && !result.ok && !pending && <p className="mw-inline-error" role="alert">{t(`helpfulnessErrors.${result.error}`)}</p>}
  </section>
}