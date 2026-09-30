import { useNavigation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Spinner } from './spinner'

export function NavigationFeedback() {
  const navigation = useNavigation()
  const { t } = useTranslation('feedback')
  let message = t('loading')
  if (navigation.formAction === '/language') message = t('switching')
  else if (navigation.location?.pathname.endsWith('/search')) message = t('searching')
  // The shell already owns the live region. This is non-blocking visual feedback.
  return <div className="mw-pending-indicator" hidden={navigation.state === 'idle'} aria-hidden="true"><Spinner size="md" /><span>{message}</span></div>
}

export function ResultsSkeleton() {
  return <div className="mw-results-skeleton" aria-hidden="true">
    {[0, 1, 2].map((row) => <div className="mw-skeleton-row" key={row}>
      <span className="mw-skeleton mw-skeleton-short" />
      <span className="mw-skeleton mw-skeleton-title" />
      <span className="mw-skeleton mw-skeleton-line" />
    </div>)}
  </div>
}