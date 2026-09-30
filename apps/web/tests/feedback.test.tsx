// @vitest-environment jsdom

import React from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { NavigationType, useNavigation, type Navigation } from 'react-router'
import { toast } from 'sonner'
import { ShareGuide } from '../app/components/ui/share-guide'
import { Spinner } from '../app/components/ui/spinner'
import { NavigationFeedback, ResultsSkeleton } from '../app/components/ui/loading-feedback'
import { createI18n } from '../app/i18n/instance'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router')>(),
  useNavigation: vi.fn(),
}))

const labels = {
  en: {
    share: 'Share guide', title: 'Share this guide', close: 'Close dialog', done: 'Done',
    link: 'Guide link', copy: 'Copy link', copying: 'Copying link…',
    hint: 'You can also select the link and copy it manually.',
    description: 'Send this link to a teammate. It opens this guide in the same language.',
    failed: 'Could not copy the link',
    failureDescription: 'Your browser blocked clipboard access. Select the link above and copy it manually.',
    copied: 'Link copied', copiedDescription: 'Ready to paste into a message or email.',
    loading: 'Loading your next answer…', searching: 'Finding matching guides…', switching: 'Changing language…',
  },
  ja: {
    share: 'ガイドを共有', title: 'このガイドを共有', close: 'ダイアログを閉じる', done: '完了',
    link: 'ガイドのリンク', copy: 'リンクをコピー', copying: 'リンクをコピーしています…',
    hint: 'リンクを選択して、手動でコピーすることもできます。',
    description: 'このリンクをチームメンバーに送信できます。同じ言語でガイドが開きます。',
    failed: 'リンクをコピーできませんでした',
    failureDescription: 'ブラウザーがクリップボードへのアクセスをブロックしました。上のリンクを選択して、手動でコピーしてください。',
    copied: 'リンクをコピーしました', copiedDescription: 'メッセージやメールに貼り付けられます。',
    loading: '次のガイドを読み込んでいます…', searching: '条件に合うガイドを検索しています…', switching: '言語を切り替えています…',
  },
} as const

type Locale = keyof typeof labels
type Settlement = 'resolve' | 'reject'

let originalClipboard: PropertyDescriptor | undefined
let originalUrl: string
let originalHistoryState: unknown

beforeEach(() => {
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  originalUrl = window.location.href
  originalHistoryState = window.history.state
  vi.mocked(toast.success).mockReset()
  vi.mocked(useNavigation).mockReset()
  vi.mocked(useNavigation).mockReturnValue(navigation('idle'))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  window.history.replaceState(originalHistoryState, '', originalUrl)
  expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
  expect(document.body.style.pointerEvents).not.toBe('none')
  expect(screen.queryByRole('dialog')).toBeNull()
})

function localized(element: React.ReactElement, locale: Locale = 'en') {
  return <I18nextProvider i18n={createI18n(locale)}>{element}</I18nextProvider>
}

function setupShare(locale: Locale = 'en') {
  // user-event installs its own clipboard, so replace it only after setup().
  const user = userEvent.setup()
  const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  window.history.replaceState(null, '', `/${locale}/articles/share-a-guide?source=private#section`)
  const view = render(localized(<ShareGuide />, locale))
  const text = labels[locale]
  const trigger = screen.getByRole('button', { name: text.share })
  const url = `${window.location.origin}/${locale}/articles/share-a-guide`
  return { ...view, user, writeText, text, trigger, url }
}

async function openShare(setup: ReturnType<typeof setupShare>) {
  await setup.user.click(setup.trigger)
  return screen.findByRole('dialog', { name: setup.text.title, description: setup.text.description })
}

function deferred() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function settle(pending: ReturnType<typeof deferred>, outcome: Settlement) {
  await act(async () => {
    if (outcome === 'resolve') pending.resolve()
    else pending.reject(new Error('Clipboard denied'))
    await pending.promise.catch(() => undefined)
  })
}

function navigation(state: Navigation['state'], pathname = '/en/articles/next', formAction?: string): Navigation {
  if (state === 'idle') return {
    state, location: undefined, formMethod: undefined, formAction: undefined,
    matches: undefined, historyAction: undefined,
    formEncType: undefined, formData: undefined, json: undefined, text: undefined,
  }
  const location = { pathname, search: '', hash: '', state: null, key: 'next' }
  if (state === 'submitting') return {
    state, location, formMethod: 'POST', formAction: formAction ?? pathname,
    matches: [], historyAction: NavigationType.Push,
    formEncType: 'application/x-www-form-urlencoded', formData: new FormData(), json: undefined, text: undefined,
  }
  return {
    state, location, formMethod: formAction ? 'GET' : undefined, formAction,
    matches: [], historyAction: NavigationType.Push,
    formEncType: formAction ? 'application/x-www-form-urlencoded' : undefined,
    formData: formAction ? new FormData() : undefined, json: undefined, text: undefined,
  }
}

describe.each(['en', 'ja'] as const)('ShareGuide (%s)', (locale) => {
  test('opens by keyboard, traps Tab focus, closes with Escape and restores focus and scrolling', async () => {
    const setup = setupShare(locale)
    const originalOverflow = getComputedStyle(document.body).overflow
    expect(screen.queryByRole('dialog')).toBeNull()
    await setup.user.tab()
    expect(document.activeElement).toBe(setup.trigger)
    await setup.user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: setup.text.title, description: setup.text.description })
    const close = within(dialog).getByRole('button', { name: setup.text.close })
    const copy = within(dialog).getByRole('button', { name: setup.text.copy })
    await waitFor(() => expect(document.activeElement).toBe(close))
    expect(document.body.getAttribute('data-scroll-locked')).toBe('1')
    expect(getComputedStyle(document.body).overflow).toBe('hidden')
    await setup.user.tab({ shift: true })
    expect(document.activeElement).toBe(copy)
    await setup.user.tab()
    expect(document.activeElement).toBe(close)
    await setup.user.tab()
    const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: setup.text.link })
    expect(document.activeElement).toBe(input)
    expect(input.readOnly).toBe(true)
    expect(input.value).toBe(setup.url)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(setup.url.length)
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe(setup.text.hint)
    await setup.user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(setup.trigger)
      expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
      expect(getComputedStyle(document.body).overflow).toBe(originalOverflow)
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  test('copies the same-language URL without query/hash, announces localized success and closes', async () => {
    const setup = setupShare(locale)
    await openShare(setup)
    await setup.user.click(screen.getByRole('button', { name: setup.text.copy }))
    expect(setup.writeText).toHaveBeenCalledExactlyOnceWith(setup.url)
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(setup.text.copied, {
      id: 'guide-copy', description: setup.text.copiedDescription,
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(setup.trigger)
    })
  })

  test('shows an inline denial and selectable readonly fallback, then allows a successful retry', async () => {
    const setup = setupShare(locale)
    setup.writeText.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
    const dialog = await openShare(setup)
    const copy = within(dialog).getByRole('button', { name: setup.text.copy })
    await setup.user.click(copy)
    const alert = within(dialog).getByRole('alert')
    expect(alert.textContent).toContain(setup.text.failed)
    expect(alert.textContent).toContain(setup.text.failureDescription)
    expect(toast.success).not.toHaveBeenCalled()
    expect(copy.getAttribute('aria-busy')).toBe('false')
    expect(copy.getAttribute('aria-disabled')).toBe('false')
    const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: setup.text.link })
    await setup.user.tab({ shift: true })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: setup.text.done }))
    await setup.user.tab({ shift: true })
    expect(document.activeElement).toBe(input)
    expect(input.readOnly).toBe(true)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, setup.url.length])
    await setup.user.type(input, 'not editable')
    expect(input.value).toBe(setup.url)
    await setup.user.click(copy)
    expect(setup.writeText.mock.calls).toEqual([[setup.url], [setup.url]])
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test.each(['missing clipboard', 'missing writeText'])('handles %s without success and recovers after reopening', async (missing) => {
    const setup = setupShare(locale)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: missing === 'missing clipboard' ? undefined : {},
    })
    await openShare(setup)
    await setup.user.click(screen.getByRole('button', { name: setup.text.copy }))
    expect(screen.getByRole('alert').textContent).toContain(setup.text.failed)
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: setup.text.link }).value).toBe(setup.url)
    expect(toast.success).not.toHaveBeenCalled()
    await setup.user.click(screen.getByRole('button', { name: setup.text.done }))
    await waitFor(() => expect(document.activeElement).toBe(setup.trigger))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: setup.writeText } })
    await openShare(setup)
    expect(screen.getByRole('alert').textContent).toBe('')
    expect(screen.getByRole('status').textContent).toBe('')
    await setup.user.click(screen.getByRole('button', { name: setup.text.copy }))
    expect(setup.writeText).toHaveBeenCalledExactlyOnceWith(setup.url)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ShareGuide pending clipboard lifecycle', () => {
  test('guards repeated pointer and keyboard activation with one request and one busy announcement', async () => {
    const setup = setupShare('ja')
    const pending = deferred()
    setup.writeText.mockReturnValueOnce(pending.promise)
    await openShare(setup)
    const copy = screen.getByRole('button', { name: setup.text.copy })
    await setup.user.dblClick(copy)
    await setup.user.keyboard('{Enter}{Enter} ')
    expect(setup.writeText).toHaveBeenCalledExactlyOnceWith(setup.url)
    expect(copy.getAttribute('aria-busy')).toBe('true')
    expect(copy.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe(setup.text.copying)
    expect(copy.querySelector('.mw-spinner')?.getAttribute('aria-hidden')).toBe('true')
    expect(toast.success).not.toHaveBeenCalled()
    await settle(pending, 'resolve')
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test.each([
    { dismissal: 'escape', outcome: 'resolve' }, { dismissal: 'escape', outcome: 'reject' },
    { dismissal: 'close button', outcome: 'resolve' }, { dismissal: 'close button', outcome: 'reject' },
  ] as const)('$dismissal before $outcome prevents stale feedback and permits a fresh copy', async ({ dismissal, outcome }) => {
    const setup = setupShare()
    const pending = deferred()
    setup.writeText.mockReturnValueOnce(pending.promise)
    await openShare(setup)
    await setup.user.click(screen.getByRole('button', { name: setup.text.copy }))
    if (dismissal === 'escape') await setup.user.keyboard('{Escape}')
    else await setup.user.click(screen.getByRole('button', { name: setup.text.close }))
    await waitFor(() => expect(document.activeElement).toBe(setup.trigger))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
    await settle(pending, outcome)
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    await openShare(setup)
    expect(screen.getByRole('alert').textContent).toBe('')
    await setup.user.click(screen.getByRole('button', { name: setup.text.copy }))
    expect(setup.writeText).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test.each(['resolve', 'reject'] as const)('unmount before %s prevents stale toasts and releases the modal lock', async (outcome) => {
    const setup = setupShare()
    const pending = deferred()
    setup.writeText.mockReturnValueOnce(pending.promise)
    await openShare(setup)
    await setup.user.click(screen.getByRole('button', { name: setup.text.copy }))
    expect(document.body.getAttribute('data-scroll-locked')).toBe('1')
    setup.unmount()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
    await settle(pending, outcome)
    expect(toast.success).not.toHaveBeenCalled()
    expect(setup.writeText).toHaveBeenCalledTimes(1)
  })

  test.each(['resolve', 'reject'] as const)('an old %s cannot close, fail or unlock a new pending copy after reopening', async (outcome) => {
    const setup = setupShare()
    const oldRequest = deferred()
    const newRequest = deferred()
    setup.writeText.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    await openShare(setup)
    await setup.user.click(screen.getByRole('button', { name: setup.text.copy }))
    await setup.user.keyboard('{Escape}')
    window.history.replaceState(null, '', '/ja/articles/a-different-guide?private=true#heading')
    await openShare(setup)
    const copy = screen.getByRole('button', { name: setup.text.copy })
    await setup.user.click(copy)
    await settle(oldRequest, outcome)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('')
    expect(copy.getAttribute('aria-busy')).toBe('true')
    expect(toast.success).not.toHaveBeenCalled()
    await setup.user.click(copy)
    expect(setup.writeText.mock.calls).toEqual([[setup.url], [`${window.location.origin}/ja/articles/a-different-guide`]])
    await settle(newRequest, 'resolve')
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe.each(['en', 'ja'] as const)('decorative feedback (%s)', (locale) => {
  test('NavigationFeedback tracks idle, loading, search and language submission without a duplicate live region', () => {
    const { container, rerender } = render(localized(<NavigationFeedback />, locale))
    const indicator = container.querySelector<HTMLElement>('.mw-pending-indicator')!
    expect(indicator.hidden).toBe(true)
    expect(indicator.getAttribute('aria-hidden')).toBe('true')
    const transitions = [
      { value: navigation('loading'), message: labels[locale].loading },
      { value: navigation('loading', `/${locale}/search`), message: labels[locale].searching },
      { value: navigation('submitting', `/${locale}/search`, '/language'), message: labels[locale].switching },
      { value: navigation('loading', `/${locale}/search`, '/language'), message: labels[locale].switching },
      { value: navigation('loading', `/${locale}/articles/search-tips`), message: labels[locale].loading },
    ]
    for (const { value, message } of transitions) {
      vi.mocked(useNavigation).mockReturnValue(value)
      rerender(localized(<NavigationFeedback />, locale))
      expect(indicator.hidden).toBe(false)
      expect(indicator.textContent).toBe(message)
      expect(indicator.getAttribute('aria-hidden')).toBe('true')
      expect(indicator.querySelector('.mw-spinner--md')?.getAttribute('aria-hidden')).toBe('true')
      expect(container.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull()
    }
    vi.mocked(useNavigation).mockReturnValue(navigation('idle'))
    rerender(localized(<NavigationFeedback />, locale))
    expect(indicator.hidden).toBe(true)
  })
})

describe('loading primitives', () => {
  test.each(['sm', 'md', 'lg'] as const)('Spinner size %s is decorative and preserves caller classes', (size) => {
    const { container } = render(<Spinner size={size} className="test-spinner" />)
    const spinner = container.firstElementChild!
    expect(spinner.classList.contains(`mw-spinner--${size}`)).toBe(true)
    expect(spinner.classList.contains('test-spinner')).toBe(true)
    expect(spinner.getAttribute('aria-hidden')).toBe('true')
    expect(spinner.textContent).toBe('')
    expect(container.querySelector('[role], [aria-live]')).toBeNull()
  })

  test('Spinner defaults to small without an accessible loading announcement', () => {
    const { container } = render(<Spinner />)
    expect(container.firstElementChild?.classList.contains('mw-spinner--sm')).toBe(true)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('ResultsSkeleton has only decorative placeholder rows, not a static spinner or live loader', () => {
    const { container } = render(<ResultsSkeleton />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    const rows = container.querySelectorAll('.mw-skeleton-row')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.querySelectorAll('.mw-skeleton')).toHaveLength(3)
      expect(row.querySelector('.mw-skeleton-short')).not.toBeNull()
      expect(row.querySelector('.mw-skeleton-title')).not.toBeNull()
      expect(row.querySelector('.mw-skeleton-line')).not.toBeNull()
    }
    expect(container.textContent).toBe('')
    expect(container.querySelector('.mw-spinner, [role], [aria-live], button, input, a, [tabindex]')).toBeNull()
  })
})