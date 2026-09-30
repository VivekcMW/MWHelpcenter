// @vitest-environment jsdom

import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { ArticleList } from '../app/components/ui/article-list'
import { Highlight } from '../app/features/search/highlight'
import { searchArticles } from '../app/features/search/rank'
import { createI18n } from '../app/i18n/instance'
import type { Locale } from '../app/i18n/config'
import SearchPage, { type loader } from '../app/routes/search'

vi.mock('../app/lib/content.server', () => ({ getCatalog: vi.fn(), getSearchCatalog: vi.fn() }))
afterEach(cleanup)

type Data = Awaited<ReturnType<typeof loader>>

function data(locale: Locale, overrides: Partial<Data> = {}): Data {
  return {
    locale, query: '<img src=x onerror=alert(1)> & 広告', product: '//evil.test', products: [], results: [],
    tooLong: false, typoUsed: false, gettingStartedPath: `/${locale}/collections/getting-started`, ...overrides,
  }
}

function result(locale: Locale) {
  return { _id: 'guide', slug: 'guide', language: locale, title: 'Café inventory', summary: 'Visible summary', productSlugs: ['inventory'], contentType: 'guide', snippet: 'Inventory example', highlightTerms: ['inventory', 'cafe'], typo: true }
}

async function page(value: Data) {
  const router = createMemoryRouter([{ path: '/:locale/search', loader: () => value, Component: SearchPage }], { initialEntries: [`/${value.locale}/search`] })
  const view = render(<I18nextProvider i18n={createI18n(value.locale)}><RouterProvider router={router} /></I18nextProvider>)
  await screen.findByRole('heading', { level: 1 })
  return { ...view, router }
}

describe.each(['en', 'ja'] as const)('search UI (%s)', (locale) => {
  it('labels the active product and clears it without losing the localized query', async () => {
    const query = 'campaign & 広告'
    const products = [{ _id: 'inventory', slug: 'inventory', title: 'Inventory', language: locale, description: 'Inventory guides', icon: 'boxes', order: 1 }]
    const router = createMemoryRouter([{
      path: '/:locale/search', Component: SearchPage,
      loader: ({ request }) => {
        const params = new URL(request.url).searchParams
        return data(locale, { query: params.get('q') ?? '', product: params.get('product') ?? '', products, results: [result(locale)] })
      },
    }], { initialEntries: [`/${locale}/search?${new URLSearchParams({ q: query, product: 'inventory' })}`] })
    const { container } = render(<I18nextProvider i18n={createI18n(locale)}><RouterProvider router={router} /></I18nextProvider>)
    const t = createI18n(locale).getFixedT(locale, 'search')
    const clear = await screen.findByRole('link', { name: t('clearFilter') })
    expect(container.querySelector('.filter-badge')?.textContent).toContain(t('filterActive'))
    expect(container.querySelector('.filter-badge strong')?.textContent).toBe('Inventory')
    await act(async () => { clear.click() })
    expect(router.state.location.pathname).toBe(`/${locale}/search`)
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(query)
    expect(new URLSearchParams(router.state.location.search).has('product')).toBe(false)
    expect(container.querySelector('.filter-badge')).toBeNull()
    expect((screen.getByRole('combobox', { name: t('productLabel') }) as HTMLSelectElement).value).toBe('')
  })

  it('offers safe same-language no-results links, preserving query while clearing product', async () => {
    const value = data(locale)
    const { container } = await page(value)
    const t = createI18n(locale).getFixedT(locale, 'search')
    const clear = screen.getByRole('link', { name: t('clearProduct') })
    const href = new URL(clear.getAttribute('href')!, 'https://help.test')
    expect(href.origin).toBe('https://help.test')
    expect(href.pathname).toBe(`/${locale}/search`)
    expect([...href.searchParams.keys()]).toEqual(['q'])
    expect(href.searchParams.get('q')).toBe(value.query)
    expect(screen.getByRole('link', { name: t('gettingStarted') }).getAttribute('href')).toBe(`/${locale}/collections/getting-started`)
    expect(screen.getByRole('link', { name: t('support') }).getAttribute('href')).toBe(`/${locale}/support`)
    expect(container.querySelector('img, script')).toBeNull()
  })

  it('does not suggest clearing a filter that is already clear', async () => {
    await page(data(locale, { product: '' }))
    expect(screen.queryByRole('link', { name: createI18n(locale).t('clearProduct', { ns: 'search' }) })).toBeNull()
  })

  it('shows localized typo notice/badge and safe highlighted original text', async () => {
    const { container } = await page(data(locale, { query: 'inventary', results: [result(locale)], typoUsed: true }))
    const t = createI18n(locale).getFixedT(locale, 'search')
    expect(screen.getByText(t('typoNotice'))).toBeTruthy()
    expect(screen.getByText(t('typoResult'))).toBeTruthy()
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toContain('inventory')
    expect(screen.getByRole('link', { name: /Café inventory/ }).getAttribute('href')).toBe(`/${locale}/articles/guide`)
  })

  it('does not announce spelling changes for exact results', async () => {
    await page(data(locale, { query: 'inventory', results: [{ ...result(locale), typo: false }] }))
    const t = createI18n(locale).getFixedT(locale, 'search')
    expect(screen.queryByText(t('typoNotice'))).toBeNull()
    expect(screen.queryByText(t('typoResult'))).toBeNull()
  })

  it('shows the localized query limit error instead of no-results suggestions', async () => {
    await page(data(locale, { query: 'x'.repeat(201), tooLong: true }))
    const t = createI18n(locale).getFixedT(locale, 'search')
    expect(screen.getByText(t('tooLong'))).toBeTruthy()
    expect(screen.queryByRole('link', { name: t('support') })).toBeNull()
  })
})

describe('search presentation safety and defaults', () => {
  it.each(['en', 'ja'] as const)('renders contextual Unicode matches consistently across %s titles, summaries and snippets', (locale) => {
    const articles = searchArticles([{
      ...result(locale), title: 'ΟΣ', summary: 'ΟΣ', body: [{ _type: 'block', children: [{ _type: 'span', text: 'An ΟΣ example' }] }],
    }], 'ΟΣ', '', locale)
    const { container } = render(<I18nextProvider i18n={createI18n(locale)}><MemoryRouter><ArticleList articles={articles} locale={locale} search /></MemoryRouter></I18nextProvider>)
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['ΟΣ', 'ΟΣ', 'ΟΣ'])
  })

  it('escapes markup and highlights complete original diacritics without raw HTML', () => {
    const text = '<img src=x onerror=alert(1)> Cafe\u0301 & café'
    const { container } = render(<Highlight text={text} terms={['cafe', 'img']} locale="en" />)
    expect(container.textContent).toBe(text)
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['img', 'Cafe\u0301', 'café'])
    expect(container.querySelector('img, script')).toBeNull()
  })

  it('keeps article-list defaults unchanged, even for search-shaped objects', () => {
    const { container } = render(<I18nextProvider i18n={createI18n('en')}><MemoryRouter><ArticleList articles={[result('en')]} locale="en" /></MemoryRouter></I18nextProvider>)
    expect(container.querySelector('mark')).toBeNull()
    expect(screen.queryByText('Inventory example')).toBeNull()
    expect(screen.queryByText('Similar spelling match')).toBeNull()
    expect(screen.getByText('Visible summary')).toBeTruthy()
  })

  it('renders only a bounded snippet from server-side search results', () => {
    const articles = searchArticles([{
      ...result('en'), title: 'Guide', body: [{ _type: 'block', children: [{ _type: 'span', text: `${'before '.repeat(500)}Café ${'after '.repeat(500)}` }] }],
    }], 'cafe')
    const { container } = render(<I18nextProvider i18n={createI18n('en')}><MemoryRouter><ArticleList articles={articles} locale="en" search /></MemoryRouter></I18nextProvider>)
    expect(container.querySelector('mark')?.textContent).toBe('Café')
    expect(container.textContent).not.toContain('before '.repeat(50))
  })

  it('hides stale spelling notices/results while the next search is pending', async () => {
    let resolve!: (value: Data) => void
    const next = new Promise<Data>((done) => { resolve = done })
    const initial = data('en', { query: 'inventary', results: [result('en')], typoUsed: true })
    const router = createMemoryRouter([{
      path: '/en/search', Component: SearchPage,
      loader: ({ request }) => new URL(request.url).searchParams.has('q') ? next : initial,
    }], { initialEntries: ['/en/search'] })
    const { container } = render(<I18nextProvider i18n={createI18n('en')}><RouterProvider router={router} /></I18nextProvider>)
    await screen.findByText('Similar spelling match')
    let navigation!: Promise<void>
    await act(async () => { navigation = router.navigate('/en/search?q=next') })
    expect(screen.queryByText('Similar spelling match')).toBeNull()
    expect(screen.queryByText(createI18n('en').t('typoNotice', { ns: 'search' }))).toBeNull()
    expect(container.querySelector('.mw-skeleton-row')).not.toBeNull()
    await act(async () => { resolve(data('en', { query: 'next', product: '' })); await navigation })
    expect(container.querySelector('.mw-skeleton-row')).toBeNull()
  })
})