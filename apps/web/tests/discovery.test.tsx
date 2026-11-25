// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, RouterProvider, type LoaderFunctionArgs } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArticleSummary } from '@mw/content'
import { createI18n } from '../app/i18n/instance'
import { relatedGuides, startingGuides } from '../app/features/discovery'

const content = vi.hoisted(() => ({getCatalog: vi.fn(), getArticle: vi.fn(), getArticleRedirect: vi.fn()}))
vi.mock('../app/lib/content.server', () => content)
vi.mock('../app/lib/helpfulness.server', () => ({getHelpfulnessState: vi.fn(async () => ({enabled: false, demo: false, vote: null, reason: 'disabled'})), submitHelpfulness: vi.fn()}))

import ProductPage, { loader as productLoader } from '../app/routes/product'
import { loader as articleLoader } from '../app/routes/article'

function article(id: string, overrides: Partial<ArticleSummary> = {}): ArticleSummary {
  return {_id: id, slug: id, title: id, summary: `${id} summary`, language: 'en', productSlugs: ['cms'], contentType: 'guide', ...overrides}
}

function args(locale: string, slug: string): LoaderFunctionArgs {
  const url = new URL(`https://help.test/${locale}/${slug}`)
  return {params: {locale, slug}, request: new Request(url), url, pattern: '/:locale/articles/:slug', context: {}}
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('discovery selection', () => {
  it('selects only explicit getting-started articles and overviews, preserving their order and limiting the list', () => {
    const articles = [
      article('ordinary'), article('overview', {contentType: 'overview'}),
      article('additional', {additionalCollectionSlugs: ['getting-started']}),
      article('primary', {collectionSlug: 'getting-started'}), article('second-overview', {contentType: 'overview'}),
    ]
    expect(startingGuides(articles).map(({_id}) => _id)).toEqual(['additional', 'primary', 'overview'])
    expect(startingGuides([article('ordinary')])).toEqual([])
  })

  it('ranks same-product articles by shared primary and additional collections without crossing locales', () => {
    const source = article('source', {collectionSlug: 'cms', additionalCollectionSlugs: ['setup']})
    const candidates = [
      article('product-only'),
      article('other-product', {productSlugs: ['planner'], collectionSlug: 'cms'}),
      article('secondary-match', {additionalCollectionSlugs: ['setup']}),
      article('both', {collectionSlug: 'cms', additionalCollectionSlugs: ['setup', 'setup']}),
      article('other-language', {language: 'ja', collectionSlug: 'cms'}),
      source,
      article('primary-match', {collectionSlug: 'cms'}),
    ]
    expect(relatedGuides(source, candidates).map(({_id}) => _id)).toEqual(['both', 'secondary-match', 'primary-match'])
    expect(relatedGuides(source, [source, candidates[1]])).toEqual([])
  })
})

describe('discovery routes', () => {
  it.each(['en', 'ja'] as const)('shows localized product starting points and preserves all guides (%s)', async (locale) => {
    const product = {_id: 'cms', slug: 'cms', title: 'CMS', description: 'CMS guides', icon: 'monitor', order: 1, language: locale}
    const overview = article('overview', {contentType: 'overview', language: locale})
    const guide = article('setup', {language: locale})
    content.getCatalog.mockResolvedValue({products: [product], collections: [], articles: [overview, guide, article('other', {productSlugs: ['planner'], language: locale})]})
    const router = createMemoryRouter([{path: '/:locale/products/:slug', loader: productLoader, Component: ProductPage}], {initialEntries: [`/${locale}/products/cms`]})
    render(<I18nextProvider i18n={createI18n(locale)}><RouterProvider router={router} /></I18nextProvider>)

    const heading = await screen.findByRole('heading', {name: createI18n(locale).t('productStartTitle')})
    const startSection = heading.closest('section')
    expect(startSection).not.toBeNull()
    if (!startSection) throw new Error('Missing product starting section')
    expect(within(startSection).getByRole('link', {name: /overview/}).getAttribute('href')).toBe(`/${locale}/articles/overview`)
    const allHeading = screen.getByRole('heading', {name: createI18n(locale).t('allGuides')})
    const allSection = allHeading.closest('section')
    if (!allSection) throw new Error('Missing all guides section')
    expect(within(allSection).getAllByRole('link')).toHaveLength(2)
    expect(within(allSection).getByRole('link', {name: /setup/}).getAttribute('href')).toBe(`/${locale}/articles/setup`)
  })

  it('omits the starting section when no overview or getting-started article exists', async () => {
    const product = {_id: 'cms', slug: 'cms', title: 'CMS', description: 'CMS guides', icon: 'monitor', order: 1, language: 'en'}
    content.getCatalog.mockResolvedValue({products: [product], collections: [], articles: [article('setup')]})
    const router = createMemoryRouter([{path: '/:locale/products/:slug', loader: productLoader, Component: ProductPage}], {initialEntries: ['/en/products/cms']})
    render(<I18nextProvider i18n={createI18n('en')}><RouterProvider router={router} /></I18nextProvider>)
    await screen.findByRole('heading', {name: 'All guides'})
    expect(screen.queryByRole('heading', {name: 'Start with the basics'})).toBeNull()
  })

  it('uses the article and localized catalog for related-guide ranking', async () => {
    const source = {...article('source', {collectionSlug: 'cms'}), body: []}
    content.getArticle.mockResolvedValue(source)
    content.getCatalog.mockResolvedValue({products: [], collections: [], articles: [article('product-only'), article('same-collection', {collectionSlug: 'cms'})]})
    const result = await articleLoader(args('en', 'source'))
    expect(content.getCatalog).toHaveBeenCalledWith('en')
    expect(result.related.map(({_id}) => _id)).toEqual(['same-collection', 'product-only'])
  })
})
