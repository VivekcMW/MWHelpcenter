// @vitest-environment jsdom

import React from 'react'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { SiteHeader } from '../app/components/layout/site-header'
import type { Locale } from '../app/i18n/config'
import { createI18n } from '../app/i18n/instance'

const labels = {
  en: {
    products: 'Products', gettingStarted: 'Getting started', bestPractices: 'Best practices',
    support: 'Contact support', language: 'Language', menu: 'Menu',
  },
  ja: {
    products: '製品', gettingStarted: 'はじめに', bestPractices: 'ベストプラクティス',
    support: 'サポートに問い合わせる', language: '言語', menu: 'メニュー',
  },
} as const

const routers = new Set<ReturnType<typeof createMemoryRouter>>()

afterEach(() => {
  cleanup()
  for (const router of routers) router.dispose()
  routers.clear()
})

function setup(locale: Locale, suffix = '') {
  const i18n = createI18n(locale)
  const languageRequests: URL[] = []
  const router = createMemoryRouter([
    { path: '*', element: <SiteHeader locale={locale} /> },
    {
      path: '/language',
      loader: ({ request }) => {
        languageRequests.push(new URL(request.url))
        return null
      },
      element: <p>Language request received</p>,
    },
  ], { initialEntries: [`/${locale}${suffix}`] })
  routers.add(router)
  const user = userEvent.setup()
  const view = render(<I18nextProvider i18n={i18n}><RouterProvider router={router} /></I18nextProvider>)
  const header = within(view.container).getByRole('banner')
  // jsdom does not apply responsive media visibility. Scope duplicated links by nav.
  const desktop = header.querySelector<HTMLElement>('nav.main-nav')!
  const mobile = header.querySelector<HTMLElement>('nav.mobile-nav')!
  const actions = header.querySelector<HTMLElement>('.header-actions')!
  const details = header.querySelector<HTMLDetailsElement>('details.mobile-navigation')!
  expect(desktop).not.toBeNull()
  expect(mobile).not.toBeNull()
  expect(actions).not.toBeNull()
  expect(details).not.toBeNull()
  const summary = details.querySelector<HTMLElement>('summary')!
  expect(summary).not.toBeNull()
  return { ...view, router, user, header, desktop, mobile, actions, details, summary, languageRequests, i18n }
}

function openMenu(details: HTMLDetailsElement) {
  // Exercise the native, uncontrolled state without depending on jsdom summary activation.
  act(() => {
    details.open = true
    fireEvent(details, new Event('toggle'))
  })
  expect(details.open).toBe(true)
}

function expectLocation(router: ReturnType<typeof createMemoryRouter>, path: string) {
  const { pathname, search, hash } = router.state.location
  expect(pathname + search + hash).toBe(path)
}

describe.each(['en', 'ja'] as const)('SiteHeader (%s)', (locale) => {
  const text = labels[locale]
  const destinations = [
    { name: text.products, suffix: '#products' },
    { name: text.gettingStarted, suffix: '/collections/getting-started' },
    { name: text.bestPractices, suffix: '/collections/best-practices' },
  ]

  test('renders a localized brand, desktop links, mobile links and support destinations', async () => {
    const setupResult = setup(locale, '/articles/example')
    const { header, desktop, mobile, actions, details, router, user, i18n } = setupResult
    const brand = within(header).getByRole('link', { name: i18n.t('siteTitle') })
    expect(brand.getAttribute('href')).toBe(`/${locale}`)
    openMenu(details)
    expect(within(desktop).getAllByRole('link')).toHaveLength(3)
    expect(within(mobile).getAllByRole('link')).toHaveLength(4)
    for (const nav of [desktop, mobile]) {
      for (const { name, suffix } of destinations) {
        expect(within(nav).getByRole('link', { name }).getAttribute('href')).toBe(`/${locale}${suffix}`)
      }
    }
    for (const region of [actions, mobile]) {
      expect(within(region).getByRole('link', { name: text.support }).getAttribute('href')).toBe(`/${locale}/support`)
    }
    await user.click(brand)
    await waitFor(() => expectLocation(router, `/${locale}`))
  })

  test.each([
    { suffix: '/collections/getting-started', active: 'gettingStarted' },
    { suffix: '/collections/getting-started?source=header#intro', active: 'gettingStarted' },
    { suffix: '/collections/best-practices', active: 'bestPractices' },
    { suffix: '/collections/best-practices?source=header#intro', active: 'bestPractices' },
    { suffix: '/support', active: 'support' },
    { suffix: '/support?source=header#form', active: 'support' },
    { suffix: '/collections/getting-started/child', active: null },
    { suffix: '/collections/best-practices/child', active: null },
    { suffix: '/support/child', active: null },
    { suffix: '/collections/getting-started-extra', active: null },
    { suffix: '/collections/best-practices-extra', active: null },
    { suffix: '/support-extra', active: null },
    { suffix: '/articles/example', active: null },
  ] as const)('sets collection/support aria-current only for exact paths: $suffix', ({ suffix, active }) => {
    const { desktop, mobile, actions, details } = setup(locale, suffix)
    openMenu(details)
    for (const key of ['gettingStarted', 'bestPractices', 'support'] as const) {
      for (const region of [key === 'support' ? actions : desktop, mobile]) {
        const link = within(region).getByRole('link', { name: text[key] })
        expect(link.getAttribute('aria-current')).toBe(active === key ? 'page' : null)
      }
    }
  })

  test.each([
    { suffix: '', current: null },
    { suffix: '?source=header', current: null },
    { suffix: '#other', current: null },
    { suffix: '#products', current: 'location' },
    { suffix: '?source=header#products', current: 'location' },
    { suffix: '/products/inventory', current: 'true' },
    { suffix: '/products/inventory?source=header#intro', current: 'true' },
    { suffix: '/articles/example', current: null },
    { suffix: '/articles/example#products', current: null },
    { suffix: '/collections/getting-started#products', current: null },
    { suffix: '/support#products', current: null },
    { suffix: '/products-extra/inventory', current: null },
  ])('sets Products aria-current correctly at $suffix', ({ suffix, current }) => {
    const { desktop, mobile, details } = setup(locale, suffix)
    openMenu(details)
    for (const nav of [desktop, mobile]) {
      expect(within(nav).getByRole('link', { name: text.products }).getAttribute('aria-current')).toBe(current)
    }
  })

  test('has a localized native summary and Escape closes the menu and restores summary focus', async () => {
    const { details, summary, mobile, user } = setup(locale)
    expect(details.open).toBe(false)
    expect(within(summary).getByText(text.menu, { exact: true }).classList.contains('sr-only')).toBe(true)
    expect(summary.textContent?.trim()).toBe(text.menu)
    const icons = summary.querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true')
    openMenu(details)
    within(mobile).getByRole('link', { name: text.products }).focus()
    await user.keyboard('{ArrowDown}')
    expect(details.open).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(details.open).toBe(false)
      expect(document.activeElement).toBe(summary)
    })
    openMenu(details)
    summary.focus()
    await user.keyboard('{Escape}')
    expect(details.open).toBe(false)
    expect(document.activeElement).toBe(summary)
  })

  test.each([
    { key: 'products', suffix: '#products' },
    { key: 'gettingStarted', suffix: '/collections/getting-started' },
    { key: 'bestPractices', suffix: '/collections/best-practices' },
    { key: 'support', suffix: '/support' },
  ] as const)('closes after clicking mobile $key and after going back', async ({ key, suffix }) => {
    const { details, mobile, router, user, header } = setup(locale)
    openMenu(details)
    await user.click(within(mobile).getByRole('link', { name: text[key] }))
    await waitFor(() => {
      expectLocation(router, `/${locale}${suffix}`)
      expect(details.open).toBe(false)
    })
    expect(header.querySelector('details.mobile-navigation')).toBe(details)
    openMenu(details)
    await act(async () => { await router.navigate(-1) })
    await waitFor(() => {
      expectLocation(router, `/${locale}`)
      expect(details.open).toBe(false)
    })
  })

  test('closes and restores toggle focus when the current mobile destination is selected again', async () => {
    const { details, mobile, summary, user } = setup(locale, '/collections/getting-started')
    openMenu(details)
    await user.click(within(mobile).getByRole('link', { name: text.gettingStarted }))
    expect(details.open).toBe(false)
    expect(document.activeElement).toBe(summary)
  })

  test.each([
    { kind: 'pathname', from: '/articles/first?q=help#intro', to: '/articles/second?q=help#intro' },
    { kind: 'query only', from: '/articles/first?q=help#intro', to: '/articles/first?q=other#intro' },
    { kind: 'hash only', from: '/articles/first?q=help#intro', to: '/articles/first?q=help#next' },
  ])('closes on $kind navigation and back without relying on a menu click', async ({ from, to }) => {
    const { details, header, router } = setup(locale, from)
    openMenu(details)
    await act(async () => { await router.navigate(`/${locale}${to}`) })
    await waitFor(() => {
      expectLocation(router, `/${locale}${to}`)
      expect(details.open).toBe(false)
    })
    expect(header.querySelector('details.mobile-navigation')).toBe(details)
    openMenu(details)
    await act(async () => { await router.navigate(-1) })
    await waitFor(() => {
      expectLocation(router, `/${locale}${from}`)
      expect(details.open).toBe(false)
    })
  })

  test('exposes a native language select and submits the current full path in the hidden from field', async () => {
    const { actions, router, user, languageRequests } = setup(locale, '/search?q=first#results')
    const select = within(actions).getByRole<HTMLSelectElement>('combobox', { name: text.language })
    expect(select.tagName).toBe('SELECT')
    expect(select.name).toBe('to')
    expect(select.value).toBe(locale)
    expect(within(select).getByRole<HTMLOptionElement>('option', { name: 'English' }).value).toBe('en')
    expect(within(select).getByRole<HTMLOptionElement>('option', { name: '日本語' }).value).toBe('ja')
    const form = select.form!
    expect(form).not.toBeNull()
    expect(form.getAttribute('action')).toBe('/language')
    expect(form.method).toBe('get')
    const from = form.querySelector<HTMLInputElement>('input[type="hidden"][name="from"]')!
    expect(from).not.toBeNull()
    expect(from.value).toBe(`/${locale}/search?q=first#results`)
    const fullPath = `/${locale}/articles/example?q=hello%20world&product=inventory#section-two`
    await act(async () => { await router.navigate(fullPath) })
    expect(from.value).toBe(fullPath)
    expect(new FormData(form).get('from')).toBe(fullPath)
    const target = locale === 'en' ? 'ja' : 'en'
    await user.selectOptions(select, target)
    await waitFor(() => expect(languageRequests).toHaveLength(1))
    expect(languageRequests[0].pathname).toBe('/language')
    expect(languageRequests[0].searchParams.get('to')).toBe(target)
    expect(languageRequests[0].searchParams.get('from')).toBe(fullPath)
  })
})