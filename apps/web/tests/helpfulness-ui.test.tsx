// @vitest-environment jsdom

import React from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, data, RouterProvider, useLoaderData, type ActionFunction } from 'react-router'
import { ArticleHelpfulness } from '../app/components/ui/article-helpfulness'
import type { HelpfulnessResult, HelpfulnessView } from '../app/features/helpfulness'
import type { Locale } from '../app/i18n/config'
import { createI18n } from '../app/i18n/instance'
import english from '../app/i18n/locales/en/feedback.json'
import japanese from '../app/i18n/locales/ja/feedback.json'

const resources = { en: english, ja: japanese }
const empty: HelpfulnessView = { enabled: true, demo: false, vote: null, reason: '' }
const token = 'a'.repeat(64)
const cookie = `mw_helpfulness=${token}; Path=/; HttpOnly; SameSite=Lax`
const routers: ReturnType<typeof createMemoryRouter>[] = []

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request in offline helpfulness UI test'))
})

afterEach(() => {
  cleanup()
  for (const router of routers.splice(0)) router.dispose()
  expect(globalThis.fetch).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function setup(locale: Locale, options: {
  saved?: HelpfulnessView
  action?: ActionFunction
  documentResult?: HelpfulnessResult
} = {}) {
  const text = resources[locale]
  const user = userEvent.setup()
  const submitted: Array<Array<[string, FormDataEntryValue]>> = []
  const action = vi.fn<ActionFunction>(options.action ?? (async ({ request }) => {
    const fields = await request.formData()
    submitted.push([...fields.entries()])
    const vote = fields.get('vote') === 'yes' ? 'yes' : 'no'
    return data<HelpfulnessResult>({ ok: true, vote, reason: vote === 'yes' ? '' : String(fields.get('reason') ?? '') })
  }))
  const loader = vi.fn<() => HelpfulnessView | Promise<HelpfulnessView>>(() => options.saved ?? empty)
  function Page() {
    const saved = useLoaderData<HelpfulnessView>()
    return <ArticleHelpfulness locale={locale} slug="getting-started" saved={saved} />
  }
  const pathname = `/${locale}/articles/getting-started`
  const router = createMemoryRouter([{
    id: 'article', path: '/:locale/articles/:slug', loader, action, Component: Page,
  }], {
    initialEntries: [pathname],
    hydrationData: {
      loaderData: { article: options.saved ?? empty },
      ...(options.documentResult ? { actionData: { article: options.documentResult } } : {}),
    },
  })
  routers.push(router)
  const view = render(<I18nextProvider i18n={createI18n(locale)}><RouterProvider router={router} /></I18nextProvider>)
  return { ...view, user, text, router, loader, action, submitted, pathname }
}

function controls(text: typeof english) {
  const yes = screen.getByRole<HTMLInputElement>('radio', { name: text.helpfulnessYes })
  const no = screen.getByRole<HTMLInputElement>('radio', { name: text.helpfulnessNo })
  const reason = screen.getByRole<HTMLSelectElement>('combobox', { name: text.helpfulnessReason })
  const group = screen.getByRole<HTMLFieldSetElement>('group', { name: text.helpfulnessTitle })
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: text.helpfulnessSubmit })
  return { yes, no, reason, group, submit, form: yes.form! }
}

function noSuccess(text: typeof english) {
  expect(screen.queryByText(text.helpfulnessThanks)).toBeNull()
}

async function saved(text: typeof english) {
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(text.helpfulnessThanks))
  expect(screen.queryByRole('alert')).toBeNull()
}

describe.each(['en', 'ja'] as const)('ArticleHelpfulness offline UI (%s)', (locale) => {
  it.each(['yes', 'no'] as const)('requires a radio, accepts %s without a reason, and posts only vote/reason/website', async (vote) => {
    const setupValue = setup(locale, { saved: { ...empty, demo: true } })
    const { user, text, action, submitted, pathname } = setupValue
    const fields = controls(text)
    expect(screen.getByRole('region', { name: text.helpfulnessTitle })).toBeTruthy()
    expect(screen.getByText(text.helpfulnessPrivacy)).toBeTruthy()
    expect(screen.getByText(text.helpfulnessDemo)).toBeTruthy()
    expect(fields.form.getAttribute('aria-describedby')).toBe(screen.getByText(text.helpfulnessPrivacy).id)
    expect(fields.form.getAttribute('action')).toBe(pathname)
    expect(fields.form.method).toBe('post')
    for (const radio of [fields.yes, fields.no]) {
      expect(radio.required).toBe(true)
      expect(radio.checked).toBe(false)
      expect(radio.name).toBe('vote')
    }
    expect(fields.reason.required).toBe(false)
    expect(fields.reason.value).toBe('')
    expect(fields.form.checkValidity()).toBe(false)
    await user.click(fields.submit)
    expect(action).not.toHaveBeenCalled()
    noSuccess(text)
    const trap = fields.form.querySelector<HTMLInputElement>('input[name="website"]')!
    expect(trap.tabIndex).toBe(-1)
    expect(trap.autocomplete).toBe('off')
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
    expect([...fields.form.querySelectorAll('[name]')].map((field) => field.getAttribute('name'))).toEqual(['vote', 'vote', 'reason', 'website'])
    expect(within(fields.reason).getAllByRole<HTMLOptionElement>('option').map((option) => [option.value, option.textContent])).toEqual([
      ['', text.helpfulnessNoReason], ...Object.entries(text.helpfulnessReasons),
    ])
    await user.click(fields[vote])
    expect(fields.form.checkValidity()).toBe(true)
    noSuccess(text)
    await user.click(fields.submit)
    await saved(text)
    expect(action).toHaveBeenCalledTimes(1)
    expect(submitted).toEqual([[['vote', vote], ['reason', ''], ['website', '']]])
    expect(action.mock.calls[0][0].request.method).toBe('POST')
    expect(new URL(action.mock.calls[0][0].request.url).pathname).toBe(pathname)
  })

  it.each(['unclear', 'missing', 'outdated', 'other'] as const)('submits the optional %s reason without adding identifying fields', async (reason) => {
    const { user, text, submitted } = setup(locale)
    const fields = controls(text)
    await user.click(fields.no)
    await user.selectOptions(fields.reason, reason)
    await user.click(fields.submit)
    await saved(text)
    expect(submitted).toEqual([[['vote', 'no'], ['reason', reason], ['website', '']]])
  })

  it('waits for persistence, disables repeated submissions, then releases controls without exposing response cookies', async () => {
    const pending = deferred<Response>()
    const { user, text, action, container } = setup(locale, { action: () => pending.promise })
    const fields = controls(text)
    await user.click(fields.no)
    await user.selectOptions(fields.reason, 'missing')
    await user.click(fields.submit)
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(fields.form.getAttribute('aria-busy')).toBe('true')
    expect(fields.group.disabled).toBe(true)
    expect(screen.getByRole('button', { name: text.helpfulnessSaving }).matches(':disabled')).toBe(true)
    expect(fields.reason.matches(':disabled')).toBe(true)
    noSuccess(text)
    await user.click(fields.yes)
    await user.dblClick(fields.submit)
    await user.keyboard('{Enter}')
    expect(fields.no.checked).toBe(true)
    expect(action).toHaveBeenCalledTimes(1)
    noSuccess(text)
    await act(async () => {
      pending.resolve(Response.json({ ok: true, vote: 'no', reason: 'missing' } satisfies HelpfulnessResult, {
        headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' },
      }))
      await pending.promise
    })
    await saved(text)
    expect(fields.group.disabled).toBe(false)
    expect(fields.submit.matches(':disabled')).toBe(false)
    expect(fields.form.getAttribute('aria-busy')).toBe('false')
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
    for (const privateValue of [token, cookie, 'mw_helpfulness', 'visitorHash', 'Set-Cookie']) {
      expect(container.innerHTML).not.toContain(privateValue)
    }
  })

  it.each([
    { status: 429, error: 'rateLimited' }, { status: 503, error: 'unavailable' },
  ] as const)('shows a localized $status failure, never success, releases pending and allows retry', async ({ status, error }) => {
    const pending = deferred<ReturnType<typeof data<HelpfulnessResult>> | Response>()
    const { user, text, action } = setup(locale, {
      action: () => pending.promise, documentResult: { ok: true, vote: 'yes', reason: '' },
    })
    const fields = controls(text)
    expect(screen.getByRole('status').textContent).toBe(text.helpfulnessThanks)
    await user.click(fields.yes)
    await user.click(fields.submit)
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(fields.submit.matches(':disabled')).toBe(true)
    noSuccess(text)
    await act(async () => {
      const result: HelpfulnessResult = { ok: false, error }
      pending.resolve(status === 429 ? data(result, { status, headers: { 'Retry-After': '60' } }) : Response.json(result, { status }))
      await pending.promise
    })
    expect((await screen.findByRole('alert')).textContent).toBe(text.helpfulnessErrors[error])
    noSuccess(text)
    expect(fields.submit.matches(':disabled')).toBe(false)
    expect(fields.form.getAttribute('aria-busy')).toBe('false')
    expect(fields.yes.checked).toBe(true)
    action.mockImplementationOnce(() => data<HelpfulnessResult>({ ok: true, vote: 'yes', reason: '' }))
    await user.click(fields.submit)
    await saved(text)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('keeps success hidden and controls disabled while a successful action is still revalidating', async () => {
    const pending = deferred<HelpfulnessView>()
    const { user, text, loader, router } = setup(locale)
    loader.mockReturnValueOnce(pending.promise)
    const fields = controls(text)
    await user.click(fields.yes)
    await user.click(fields.submit)
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    expect([...router.state.fetchers.values()].map((fetcher) => fetcher.state)).toEqual(['loading'])
    expect(fields.submit.matches(':disabled')).toBe(true)
    expect(fields.form.getAttribute('aria-busy')).toBe('true')
    noSuccess(text)
    await act(async () => {
      pending.resolve({ ...empty, vote: 'yes' })
      await pending.promise
    })
    await saved(text)
    expect(fields.submit.matches(':disabled')).toBe(false)
    expect(fields.form.getAttribute('aria-busy')).toBe('false')
  })

  it.each(['yes', 'no'] as const)('prepopulates a saved %s vote without claiming a new save', (vote) => {
    const reason = vote === 'no' ? 'outdated' : ''
    const { text, action } = setup(locale, { saved: { ...empty, vote, reason } })
    const fields = controls(text)
    expect(fields[vote].checked).toBe(true)
    expect(fields.reason.value).toBe(reason)
    expect(screen.getByRole('status').textContent).toBe(text.helpfulnessPreviouslySaved)
    expect(screen.queryByText(text.helpfulnessDemo)).toBeNull()
    noSuccess(text)
    expect(action).not.toHaveBeenCalled()
  })

  it('uses fresh action data for updates and hides stale success after changing a negative reason or vote', async () => {
    const { user, text, submitted } = setup(locale, { saved: { ...empty, vote: 'no', reason: 'unclear' } })
    const fields = controls(text)
    await user.selectOptions(fields.reason, 'missing')
    await user.click(fields.submit)
    await saved(text)
    expect(screen.queryByText(text.helpfulnessPreviouslySaved)).toBeNull()
    await user.selectOptions(fields.reason, 'other')
    noSuccess(text)
    await user.click(fields.submit)
    await saved(text)
    await user.click(fields.yes)
    noSuccess(text)
    await user.click(fields.submit)
    await saved(text)
    await user.click(fields.no)
    noSuccess(text)
    expect(submitted).toEqual([
      [['vote', 'no'], ['reason', 'missing'], ['website', '']],
      [['vote', 'no'], ['reason', 'other'], ['website', '']],
      [['vote', 'yes'], ['reason', 'other'], ['website', '']],
    ])
  })

  it('initializes selection and confirmation from document action data rather than stale loader state', () => {
    const { text, action } = setup(locale, {
      saved: { ...empty, vote: 'yes' }, documentResult: { ok: true, vote: 'no', reason: 'missing' },
    })
    const fields = controls(text)
    expect(fields.no.checked).toBe(true)
    expect(fields.reason.value).toBe('missing')
    expect(screen.getByRole('status').textContent).toBe(text.helpfulnessThanks)
    expect(screen.queryByText(text.helpfulnessPreviouslySaved)).toBeNull()
    expect(action).not.toHaveBeenCalled()
  })

  it('hides disabled feedback when there is no action result', () => {
    const { container, action } = setup(locale, { saved: { ...empty, enabled: false } })
    expect(container.innerHTML).toBe('')
    expect(action).not.toHaveBeenCalled()
  })

  it('preserves a document action failure when feedback is disabled', () => {
    const { text } = setup(locale, {
      saved: { ...empty, enabled: false }, documentResult: { ok: false, error: 'unavailable' },
    })
    expect(screen.getByRole('alert').textContent).toBe(text.helpfulnessErrors.unavailable)
    expect(controls(text).submit.matches(':disabled')).toBe(true)
    noSuccess(text)
  })

  it('preserves a fetcher failure when loader revalidation disables feedback', async () => {
    const { user, text, loader, action, router } = setup(locale, {
      action: () => data<HelpfulnessResult>({ ok: false, error: 'unavailable' }, { status: 503 }),
    })
    loader.mockReturnValue({ ...empty, enabled: false })
    const fields = controls(text)
    await user.click(fields.yes)
    await user.click(fields.submit)
    expect((await screen.findByRole('alert')).textContent).toBe(text.helpfulnessErrors.unavailable)
    // React Router skips automatic revalidation after 4xx/5xx action data.
    // Simulate a later explicit refresh without replacing the component.
    expect(loader).not.toHaveBeenCalled()
    await act(async () => { await router.revalidate() })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toBe(text.helpfulnessErrors.unavailable)
    expect(fields.submit.matches(':disabled')).toBe(true)
    expect(fields.form.getAttribute('aria-busy')).toBe('false')
    noSuccess(text)
    expect(action).toHaveBeenCalledTimes(1)
  })
})