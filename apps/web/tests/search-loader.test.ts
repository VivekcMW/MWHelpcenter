import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ARTICLES_QUERY, COLLECTIONS_QUERY, PRODUCTS_QUERY, SEARCH_ARTICLES_QUERY } from '@mw/content/queries'
import { getCatalog, getSearchCatalog } from '../app/lib/content.server'
import { loader } from '../app/routes/search'

const cms = vi.hoisted(() => ({ fetch: vi.fn(), mode: 'sanity' }))
vi.mock('../app/lib/env.server', () => ({ getEnv: () => ({ CONTENT_MODE: cms.mode }) }))
vi.mock('../app/lib/sanity/client.server', () => ({ getPublishedClient: () => ({ fetch: cms.fetch }) }))

function load(query: string, locale = 'en', product = '') {
  const url = new URL(`https://help.test/${locale}/search?${new URLSearchParams({ q: query, product })}`)
  return loader({ request: new Request(url), url, pattern: '/:locale/search', params: { locale }, context: {} })
}

beforeEach(() => {
  cms.mode = 'sanity'
  cms.fetch.mockReset().mockImplementation(async (query: string, { language }: { language: string }) => {
    if (query === PRODUCTS_QUERY) return [{ _id: 'product', title: 'Inventory', slug: 'inventory', description: '', icon: '', order: 1, language }]
    if (query === COLLECTIONS_QUERY) return [{ _id: 'collection', title: 'Start', slug: 'getting-started', description: '', language }]
    return [{
      _id: 'guide', slug: 'guide', title: 'Guide', summary: 'Summary', language, productSlugs: ['inventory'], contentType: 'guide',
      ...(query === SEARCH_ARTICLES_QUERY ? {
        body: [{ _type: 'block', children: [{ _type: 'span', text: `Coordinates ${'visible '.repeat(200)}` }] }],
        seo: { title: 'DO NOT SHIP' }, secret: 'DO NOT SHIP',
      } : {}),
    }]
  })
})

describe('published server search catalog', () => {
  it('keeps ordinary catalog summary-only and uses a separate query for search', async () => {
    const catalog = await getCatalog('ja')
    expect(cms.fetch.mock.calls).toEqual([[PRODUCTS_QUERY, { language: 'ja' }], [COLLECTIONS_QUERY, { language: 'ja' }], [ARTICLES_QUERY, { language: 'ja' }]])
    expect(catalog.articles[0]).not.toHaveProperty('body')
    cms.fetch.mockClear()
    const search = await getSearchCatalog('ja')
    expect(cms.fetch.mock.calls).toEqual([[PRODUCTS_QUERY, { language: 'ja' }], [COLLECTIONS_QUERY, { language: 'ja' }], [SEARCH_ARTICLES_QUERY, { language: 'ja' }]])
    expect(search.articles[0]).toHaveProperty('body')
  })

  it.each(['en', 'ja'] as const)('demo %s remains locale isolated; only search catalog includes bodies', async (locale) => {
    cms.mode = 'demo'
    const normal = await getCatalog(locale)
    const search = await getSearchCatalog(locale)
    expect(search.articles.length).toBeGreaterThan(0)
    expect(search.articles.every((item) => item.language === locale && Array.isArray(item.body) && item.body.length > 0)).toBe(true)
    expect(normal.articles.every((item) => !('body' in item) && !('seo' in item))).toBe(true)
    expect(cms.fetch).not.toHaveBeenCalled()
  })

  it('propagates CMS failures without falling back to demo content', async () => {
    cms.fetch.mockRejectedValue(new Error('CMS unavailable'))
    await expect(load('coordinates')).rejects.toThrow('CMS unavailable')
  })
})

describe('search loader response boundary', () => {
  it.each(['en', 'ja'])('keeps %s results scoped even when mocked content contains foreign, draft or unrelated records', async (locale) => {
    const otherLocale = locale === 'en' ? 'ja' : 'en'
    const article = { _id: 'guide', slug: 'guide', title: 'Coordinates', summary: '', language: locale, productSlugs: ['inventory'], contentType: 'guide' }
    cms.fetch.mockImplementation(async (query: string) => {
      if (query === COLLECTIONS_QUERY) return [{ _id: 'foreign', slug: 'getting-started', language: otherLocale }]
      if (query !== SEARCH_ARTICLES_QUERY) return []
      return [article, { ...article, _id: 'foreign', language: otherLocale }, { ...article, _id: 'drafts.guide' }, { ...article, _id: 'versions.release.guide' }, { ...article, _id: 'other-product', productSlugs: ['cms'] }]
    })
    const result = await load('coordinates', locale, 'inventory')
    expect(result.results.map((item) => item._id)).toEqual(['guide'])
    expect(result.gettingStartedPath).toBe(`/${locale}`)
    expect(cms.fetch.mock.calls.every(([, params]) => params.language === locale)).toBe(true)
  })

  it('accepts exactly 200 raw characters and trims the query without losing matches', async () => {
    const result = await load(`${' '.repeat(189)}coordinates`)
    expect(result.query).toBe('coordinates')
    expect(result.tooLong).toBe(false)
    expect(result.results).toHaveLength(1)
    expect(cms.fetch).toHaveBeenCalledWith(SEARCH_ARTICLES_QUERY, { language: 'en' })
  })

  it.each(['en', 'ja'])('returns %s summaries and a bounded snippet, never body/SEO/unknown fields', async (locale) => {
    const result = await load('coordinates', locale)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].snippet).toContain('Coordinates')
    expect(result.results[0].snippet!.length).toBeLessThanOrEqual(240)
    expect(result.gettingStartedPath).toBe(`/${locale}/collections/getting-started`)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('DO NOT SHIP')
    expect(serialized).not.toContain('"body"')
    expect(serialized).not.toContain('visible '.repeat(40))
    expect(cms.fetch).toHaveBeenCalledWith(SEARCH_ARTICLES_QUERY, { language: locale })
  })

  it('signals English typos and keeps Japanese exact-only', async () => {
    expect((await load('coordinatas')).typoUsed).toBe(true)
    expect((await load('coordinates')).typoUsed).toBe(false)
    const japanese = await load('coordinatas', 'ja')
    expect(japanese.typoUsed).toBe(false)
    expect(japanese.results).toEqual([])
  })

  it('never widens an unknown product filter or trusts it as a destination', async () => {
    const result = await load('coordinates', 'en', '//evil.test')
    expect(result.results).toEqual([])
    expect(result.gettingStartedPath).toBe('/en/collections/getting-started')
  })

  it.each(['', ' ', 'x'.repeat(201), `${' '.repeat(200)}x`])('avoids full-body reads for blank/oversized input %j', async (query) => {
    const result = await load(query)
    expect(result.results).toEqual([])
    expect(result.tooLong).toBe(query.length > 200)
    expect(result.query.length).toBeLessThanOrEqual(201)
    expect(cms.fetch).not.toHaveBeenCalledWith(SEARCH_ARTICLES_QUERY, expect.anything())
  })

  it('does not fetch bodies for Japanese punctuation-only input', async () => {
    await load('。！？', 'ja')
    expect(cms.fetch).not.toHaveBeenCalledWith(SEARCH_ARTICLES_QUERY, expect.anything())
  })

  it('rejects unsupported locales before reading content', async () => {
    await expect(load('guide', 'fr')).rejects.toMatchObject({ status: 404 })
    expect(cms.fetch).not.toHaveBeenCalled()
  })

  it('uses locale home if the getting-started collection is not published', async () => {
    cms.fetch.mockResolvedValue([])
    expect((await load('unknown', 'ja')).gettingStartedPath).toBe('/ja')
  })
})