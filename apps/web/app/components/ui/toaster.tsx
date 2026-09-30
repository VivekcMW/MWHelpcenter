import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster, toast } from 'sonner'
import { Spinner } from './spinner'

export function FeedbackToaster() {
  const { t, i18n } = useTranslation('feedback')
  useEffect(() => { toast.dismiss() }, [i18n.language])
  return <Toaster className="mw-toast-region" position="top-right" theme="light" dir="ltr"
    expand visibleToasts={3} duration={6000} closeButton offset={24} mobileOffset={16}
    containerAriaLabel={t('notifications')} customAriaLabel={t('notifications')}
    icons={{ success: <CircleCheck size={18} />, error: <CircleX size={18} />, info: <Info size={18} />, warning: <TriangleAlert size={18} />, loading: <Spinner />, close: <X size={16} /> }}
    toastOptions={{ unstyled: true, closeButtonAriaLabel: t('dismiss'), classNames: {
      toast: 'mw-toast', title: 'mw-toast-title', description: 'mw-toast-description', content: 'mw-toast-content',
      icon: 'mw-toast-icon', closeButton: 'mw-toast-close', success: 'mw-toast--success', error: 'mw-toast--error',
      info: 'mw-toast--info', warning: 'mw-toast--warning',
    } }} />
}