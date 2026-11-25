import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { MessageCircle, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { localePath, type Locale } from '../../i18n/config'
import { MAX_QUERY_LENGTH } from '../../features/search/text'
import type { ChatSearchResponse, ChatSearchResult } from '../../routes/resources/chat-search'

type Exchange = { query: string; results: ChatSearchResult[] | null }

export function HelpChat({locale}: Readonly<{locale: Locale}>) {
  const {t} = useTranslation('feedback')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  useEffect(() => () => { requestRef.current?.abort() }, [])
  useEffect(() => {
    if (open && messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [open, exchanges, pending])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = query.trim()
    if (!text || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setQuery('')
    try {
      const response = await fetch(localePath(locale, 'chat-search'), {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
        body: new URLSearchParams({query: text}),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Article search unavailable')
      const result: ChatSearchResponse = await response.json()
      if (!result.ok) throw new Error('Article search unavailable')
      setExchanges((previous) => [...previous, {query: text, results: result.results}].slice(-10))
    } catch {
      if (!controller.signal.aborted) setExchanges((previous) => [...previous, {query: text, results: null}].slice(-10))
    } finally {
      if (!controller.signal.aborted) {
        requestRef.current = null
        setPending(false)
      }
    }
  }

  return <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="help-chat-trigger js-only" type="button"><MessageCircle size={21} aria-hidden="true" />{t('chatOpen')}</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Content className="help-chat-panel" onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus() }}>
      <div className="help-chat-header"><div><Dialog.Title>{t('chatTitle')}</Dialog.Title><Dialog.Description>{t('chatDescription')}</Dialog.Description></div><Dialog.Close asChild><button type="button" className="help-chat-close" aria-label={t('chatClose')}><X size={20} aria-hidden="true" /></button></Dialog.Close></div>
      <div ref={messagesRef} className="help-chat-messages" aria-live="polite" aria-busy={pending}>
        <p className="help-chat-intro">{t('chatIntro')}</p>
        {exchanges.map((exchange, index) => <div className="help-chat-exchange" key={index}>
          <p className="help-chat-question">{exchange.query}</p>
          <div className="help-chat-answer">{exchange.results === null ? <p role="alert">{t('chatError')}</p> : exchange.results.length ? <><p>{t('chatResults')}</p><ul>{exchange.results.map((result) => <li key={result.slug}><Link to={localePath(locale, `articles/${encodeURIComponent(result.slug)}`)} onClick={() => setOpen(false)}>{result.title}</Link><p>{result.summary}</p></li>)}</ul></> : <p>{t('chatNoResults')} <Link to={localePath(locale, 'support')} onClick={() => setOpen(false)}>{t('chatSupport')}</Link></p>}</div>
        </div>)}
        {pending && <p role="status">{t('chatSearching')}</p>}
      </div>
      <form className="help-chat-form" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="help-chat-query">{t('chatInput')}</label>
        <input ref={inputRef} id="help-chat-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={MAX_QUERY_LENGTH} placeholder={t('chatPlaceholder')} disabled={pending} />
        <button type="submit" disabled={pending || !query.trim()} aria-label={t('chatSend')}><Send size={19} aria-hidden="true" /></button>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
}
