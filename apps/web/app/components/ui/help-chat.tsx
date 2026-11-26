import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { MessageCircle, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { localePath, type Locale } from '../../i18n/config'
import { MAX_QUERY_LENGTH } from '../../features/search/text'
import type { ChatMessage, ChatResponse, ChatSearchResult } from '../../routes/resources/chat'

type Exchange = { query: string; answer: string | null; sources: ChatSearchResult[] }

export function HelpChat({locale}: Readonly<{locale: Locale}>) {
  const {t} = useTranslation('feedback')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const supportDraft = exchanges.slice(-3).map((exchange) =>
    `${t('chatDraftQuestion')}: ${exchange.query}`,
  ).join('\n\n')
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
      const history: ChatMessage[] = exchanges.filter((exchange) => exchange.answer !== null).slice(-2).flatMap((exchange) => [
        {role: 'user', content: exchange.query},
        {role: 'assistant', content: exchange.answer ?? ''},
      ])
      const messages = [...history, {role: 'user' as const, content: text}]
      const response = await fetch(localePath(locale, 'chat'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({messages}),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Help chat unavailable')
      const result: ChatResponse = await response.json()
      if (!result.ok) throw new Error('Help chat unavailable')
      setExchanges((previous) => [...previous, {query: text, answer: result.answer, sources: result.sources}].slice(-10))
    } catch {
      if (!controller.signal.aborted) setExchanges((previous) => [...previous, {query: text, answer: null, sources: []}].slice(-10))
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
        <p className="help-chat-privacy">{t('chatPrivacy')}</p>
        {exchanges.map((exchange, index) => <div className="help-chat-exchange" key={index}>
          <p className="help-chat-question">{exchange.query}</p>
          <div className="help-chat-answer">
            {exchange.answer === null ? <p role="alert">{t('chatError')}</p> : <>
              <p>{exchange.answer}</p>
              {exchange.sources.length > 0 ? <>
                <p>{t('chatSources')}</p>
                <ul>{exchange.sources.map((source) => <li key={source.slug}><Link to={localePath(locale, `articles/${encodeURIComponent(source.slug)}`)} onClick={() => setOpen(false)}>{source.title}</Link></li>)}</ul>
              </> : null}
            </>}
          </div>
        </div>)}
        {exchanges.length > 0 && <p className="help-chat-support"><Link to={localePath(locale, 'support')} state={{chatDraft: supportDraft}} onClick={() => setOpen(false)}>{t('chatSupport')}</Link></p>}
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
