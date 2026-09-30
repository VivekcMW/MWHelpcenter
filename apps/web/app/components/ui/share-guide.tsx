import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Copy, Share2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Spinner } from './spinner'

export function ShareGuide() {
  const { t } = useTranslation('feedback')
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [copying, setCopying] = useState(false)
  const [failed, setFailed] = useState(false)
  const request = useRef(0)
  const busy = useRef(false)
  const inputId = 'mw-share-guide-link'

  // A clipboard promise can settle after dismissal/navigation. Ignore stale work.
  useEffect(() => () => { request.current += 1 }, [])
  function changeOpen(next: boolean) {
    request.current += 1
    busy.current = false
    setCopying(false)
    setFailed(false)
    if (next) setUrl(window.location.origin + window.location.pathname)
    setOpen(next)
  }
  async function copy() {
    if (busy.current) return
    busy.current = true
    const current = ++request.current
    setCopying(true)
    setFailed(false)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      if (current !== request.current) return
      changeOpen(false)
      toast.success(t('copied'), { id: 'guide-copy', description: t('copiedDescription') })
    } catch {
      if (current !== request.current) return
      setFailed(true)
    } finally {
      if (current === request.current) {
        busy.current = false
        setCopying(false)
      }
    }
  }

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><button className="button button-outline js-only" type="button"><Share2 size={18} aria-hidden="true" />{t('share')}</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="mw-modal-overlay" />
      <Dialog.Content className="mw-modal-panel">
        <div className="mw-modal-header"><div><Dialog.Title className="mw-modal-title">{t('shareTitle')}</Dialog.Title><Dialog.Description className="mw-modal-description">{t('shareDescription')}</Dialog.Description></div>
          <Dialog.Close asChild><button type="button" className="mw-icon-button" aria-label={t('close')}><X size={20} aria-hidden="true" /></button></Dialog.Close>
        </div>
        <div className="mw-modal-body">
          <label className="mw-field-label" htmlFor={inputId}>{t('linkLabel')}</label>
          <input className="mw-input" id={inputId} value={url} readOnly onFocus={(event) => event.currentTarget.select()} aria-describedby={`${inputId}-hint`} />
          <p className="mw-field-hint" id={`${inputId}-hint`}>{t('linkHint')}</p>
          <div role="alert">{failed && <p className="mw-inline-error"><strong>{t('copyFailed')}</strong><br />{t('copyFailedDescription')}</p>}</div>
          <output className="sr-only">{copying ? t('copying') : ''}</output>
        </div>
        <div className="mw-modal-footer">
          <Dialog.Close asChild><button type="button" className="button button-outline">{t('done')}</button></Dialog.Close>
          <button type="button" className="button" aria-busy={copying} aria-disabled={copying} onClick={() => void copy()}>{copying ? <Spinner /> : <Copy size={18} aria-hidden="true" />}{t('copy')}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}