import type { Article } from '@mw/content'
import { ARTICLE_TRANSLATIONS_QUERY } from '@mw/content/queries'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Locale } from '../app/i18n/config'
import { getArticle, getCatalog, getTranslatedArticleSlug } from '../app/lib/content.server'
import { getPublishedClient } from '../app/lib/sanity/client.server'
import { languageDestination } from '../app/lib/switch-language.server'
import { loader } from '../app/routes/language-switch'

vi.mock('../app/lib/content.server', () => ({
  getArticle: vi.fn(),
  getCatalog: vi.fn(),
  getTranslatedArticleSlug: vi.fn(),
}))

// Only the real translation-lookup tests use these dependencies. No CMS or env access.
const cms = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../app/lib/env.server', () => ({ getEnv: () => ({ CONTENT_MODE: 'sanity' }) }))
vi.mock('../app/lib/sanity/client.server', () => ({
  getPublishedClient: vi.fn(() => ({ fetch: cms.fetch })),
}))

function catalog(language: Locale): Awaited<ReturnType<typeof getCatalog>> {
  return {
    products: [{
      _id: `product-${language}`, title: 'Inventory', slug: 'inventory',
      description: 'Inventory help', icon: 'map-pin', order: 1, language,
    }],
    collections: [{
      _id: `collection-${language}`, title: 'Getting started', slug: 'getting-started',
      description: 'Getting started help', language,
    }],
    articles: [],
  }
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    _id: 'source-article', title: 'Source guide', slug: 'english-guide',
    summary: 'A source guide', language: 'en', productSlugs: ['inventory'],
    contentType: 'guide', body: [], translationGroupId: 'shared-guide-group',
    ...overrides,
  }
}

function load(params: Record<string, string> = {}) {
  const url = new URL(`https://help.test/language?${new URLSearchParams(params)}`)
  return loader({
    request: new Request(url),
    url,
    pattern: '/language',
    params: {},
    context: {},
  })
}

function expectNoContentReads() {
  expect(getCatalog).not.toHaveBeenCalled()
  expect(getArticle).not.toHaveBeenCalled()
  expect(getTranslatedArticleSlug).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.mocked(getCatalog).mockReset().mockImplementation(async (language) => catalog(language))
  vi.mocked(getArticle).mockReset().mockResolvedValue(null)
  vi.mocked(getTranslatedArticleSlug).mockReset().mockResolvedValue(null)
  vi.mocked(getPublishedClient).mockClear()
  cms.fetch.mockReset()
})

const directions: Array<{ source: Locale; target: Locale }> = [
  { source: 'en', target: 'ja' },
  { source: 'ja', target: 'en' },
]

describe.each(directions)('languageDestination: $source → $target', ({ source, target }) => {
  const home = `/${target}`
  const unavailable = `${home}?translation=unavailable`

  it.each([
    ['', ''],
    ['/', ''],
    ['?translation=unavailable&q=old', ''],
    ['#products', '#products'],
    ['?q=old#products', '#products'],
    ['#old-section', ''],
  ])('switches home suffix %s, keeping only the products anchor', async (suffix, expected) => {
    expect(await languageDestination(`/${source}${suffix}`, target)).toBe(`${home}${expected}`)
    expectNoContentReads()
  })

  it('switches support without carrying unrelated query parameters or anchors', async () => {
    expect(await languageDestination(`/${source}/support?q=old#form`, target)).toBe(`${home}/support`)
    expectNoContentReads()
  })

  it('preserves encoded search text and a product available in the target catalog', async () => {
    const query = new URLSearchParams({ q: '広告 & inventory + café?', product: 'inventory', page: '2' })
    const expected = new URLSearchParams({ q: '広告 & inventory + café?', product: 'inventory' })
    expect(await languageDestination(`/${source}/search?${query}#old`, target)).toBe(`${home}/search?${expected}`)
    expect(getCatalog).toHaveBeenCalledExactlyOnceWith(target)
    expect(getArticle).not.toHaveBeenCalled()
    expect(getTranslatedArticleSlug).not.toHaveBeenCalled()
  })

  it.each([
    ['', ''],
    ['?q=', '?q='],
    ['?q=inventory+help&ignored=value', '?q=inventory+help'],
    ['?q=first&q=second', '?q=first'],
    ['?product=', ''],
    ['?ignored=value#old', ''],
  ])('handles search suffix %s without unnecessary catalog reads', async (suffix, expected) => {
    expect(await languageDestination(`/${source}/search${suffix}`, target)).toBe(`${home}/search${expected}`)
    expectNoContentReads()
  })

  it.each(['missing-product', 'Inventory', 'getting-started'])('drops invalid target product %s but preserves q', async (product) => {
    expect(await languageDestination(`/${source}/search?q=help&product=${product}`, target)).toBe(`${home}/search?q=help`)
    expect(getCatalog).toHaveBeenCalledExactlyOnceWith(target)
  })

  it('does not preserve a product that exists only in the source catalog', async () => {
    vi.mocked(getCatalog).mockImplementation(async (language) => language === source
      ? catalog(source) : { products: [], collections: [], articles: [] })
    expect(await languageDestination(`/${source}/search?q=help&product=inventory`, target)).toBe(`${home}/search?q=help`)
    expect(getCatalog).toHaveBeenCalledExactlyOnceWith(target)
  })

  it.each([
    ['inventory', '?product=inventory'],
    ['missing', ''],
  ])('handles a product-only search for %s without a dangling query separator', async (product, expected) => {
    expect(await languageDestination(`/${source}/search?product=${product}`, target)).toBe(`${home}/search${expected}`)
    expect(getCatalog).toHaveBeenCalledExactlyOnceWith(target)
  })

  it('bounds preserved search text to 200 characters', async () => {
    expect(await languageDestination(`/${source}/search?q=${'x'.repeat(201)}`, target)).toBe(`${home}/search?q=${'x'.repeat(200)}`)
    expectNoContentReads()
  })

  it.each([
    ['products', 'inventory', 'in%76entory'],
    ['collections', 'getting-started', 'getting%2Dstarted'],
  ])('matches target %s by decoded stable slug', async (kind, slug, encoded) => {
    expect(await languageDestination(`/${source}/${kind}/${encoded}?q=old#old`, target)).toBe(`${home}/${kind}/${slug}`)
    expect(getCatalog).toHaveBeenCalledExactlyOnceWith(target)
    expect(getArticle).not.toHaveBeenCalled()
    expect(getTranslatedArticleSlug).not.toHaveBeenCalled()
  })

  it.each([
    ['products', 'missing'],
    ['collections', 'missing'],
    ['products', 'getting-started'],
    ['collections', 'inventory'],
  ])('falls back when %s/%s is absent from the correct target catalog list', async (kind, slug) => {
    expect(await languageDestination(`/${source}/${kind}/${slug}`, target)).toBe(unavailable)
    expect(getCatalog).toHaveBeenCalledExactlyOnceWith(target)
  })

  it('uses translationGroupId rather than assuming translated article slugs match', async () => {
    vi.mocked(getArticle).mockResolvedValue(article({ language: source, slug: 'source guide' }))
    vi.mocked(getTranslatedArticleSlug).mockResolvedValue('翻訳されたガイド')
    expect(await languageDestination(`/${source}/articles/source%20guide?q=old#section-source`, target))
      .toBe(`${home}/articles/${encodeURIComponent('翻訳されたガイド')}`)
    expect(getArticle).toHaveBeenCalledExactlyOnceWith(source, 'source guide')
    expect(getTranslatedArticleSlug).toHaveBeenCalledExactlyOnceWith(target, 'shared-guide-group')
    expect(getCatalog).not.toHaveBeenCalled()
  })

  it('falls back for a missing source article without attempting translation', async () => {
    expect(await languageDestination(`/${source}/articles/missing#old`, target)).toBe(unavailable)
    expect(getArticle).toHaveBeenCalledExactlyOnceWith(source, 'missing')
    expect(getTranslatedArticleSlug).not.toHaveBeenCalled()
  })

  it.each([undefined, ''])('falls back for a source article with translation group %s', async (translationGroupId) => {
    vi.mocked(getArticle).mockResolvedValue(article({ language: source, translationGroupId }))
    expect(await languageDestination(`/${source}/articles/english-guide#old`, target)).toBe(unavailable)
    expect(getArticle).toHaveBeenCalledExactlyOnceWith(source, 'english-guide')
    expect(getTranslatedArticleSlug).not.toHaveBeenCalled()
  })

  it('falls back when translation lookup returns null for a missing or ambiguous match', async () => {
    vi.mocked(getArticle).mockResolvedValue(article({ language: source }))
    expect(await languageDestination(`/${source}/articles/english-guide#old`, target)).toBe(unavailable)
    expect(getTranslatedArticleSlug).toHaveBeenCalledExactlyOnceWith(target, 'shared-guide-group')
  })

  it('keeps a same-language article without a group but still removes stale hashes', async () => {
    vi.mocked(getArticle).mockResolvedValue(article({ language: target, slug: 'canonical-guide', translationGroupId: undefined }))
    expect(await languageDestination(`/${target}/articles/requested-guide?old=1#section-old`, target)).toBe(`${home}/articles/canonical-guide`)
    expect(getArticle).toHaveBeenCalledExactlyOnceWith(target, 'requested-guide')
    expect(getTranslatedArticleSlug).not.toHaveBeenCalled()
  })

  it.each([
    '', 'https://evil.test/en', 'http://evil.test/en', '//evil.test/en', '///evil.test/en',
    'javascript:alert(1)', 'en/articles/guide', '/\\evil.test/en', '/en\\articles\\guide',
    '/', '/fr', '/EN/articles/guide', '/unknown/articles/guide',
  ])('returns safe target home for untrusted source %j', async (from) => {
    expect(await languageDestination(from, target)).toBe(home)
    expectNoContentReads()
  })

  it('rejects every ASCII control character before URL normalization', async () => {
    const codes = [...Array.from({ length: 32 }, (_, index) => index), 127]
    for (const code of codes) {
      expect(await languageDestination(`/${source}/search?q=a${String.fromCharCode(code)}b`, target)).toBe(home)
    }
    expectNoContentReads()
  })

  it.each([
    '/unknown', '/unknown/slug', '/articles', '/products', '/collections',
    '/articles/guide/extra', '/support/extra', '/search/extra',
    '/articles/%', '/products/%E0%A4%A', '/collections/%FF',
  ])('returns translation-unavailable for unknown or malformed local route %s', async (suffix) => {
    expect(await languageDestination(`/${source}${suffix}`, target)).toBe(unavailable)
    expectNoContentReads()
  })
})

describe('language-switch loader', () => {
  it.each([undefined, '', 'fr', 'EN', 'ja-JP', '//evil.test'])('throws a 404 Response for target %s before reading content', async (to) => {
    const result = load({ ...(to === undefined ? {} : { to }), from: '/en/articles/english-guide' })
    await expect(result).rejects.toBeInstanceOf(Response)
    await expect(result).rejects.toMatchObject({ status: 404 })
    expectNoContentReads()
  })

  it.each([
    { to: 'ja', from: '/en/search?q=hello+world&product=inventory', destination: '/ja/search?q=hello+world&product=inventory' },
    { to: 'en', from: '/ja/support', destination: '/en/support' },
    { to: 'ja', from: '/en/articles/missing#old', destination: '/ja?translation=unavailable' },
    { to: 'ja', from: 'https://evil.test/en', destination: '/ja' },
    { to: 'en', from: '//evil.test/ja', destination: '/en' },
    { to: 'ja', from: '/\\evil.test/en', destination: '/ja' },
    { to: 'ja', from: '/en/search?q=a\nb', destination: '/ja' },
    { to: 'ja', from: '/en/unknown', destination: '/ja?translation=unavailable' },
    { to: 'ja', from: undefined, destination: '/ja' },
  ])('redirects $from to $destination with no-store', async ({ to, from, destination }) => {
    const response = await load({ to, ...(from === undefined ? {} : { from }) })
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(destination)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('redirects to a differently slugged translation without the source section hash', async () => {
    vi.mocked(getArticle).mockResolvedValue(article())
    vi.mocked(getTranslatedArticleSlug).mockResolvedValue('japanese-guide')
    const response = await load({ to: 'ja', from: '/en/articles/english-guide#section-english' })
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/ja/articles/japanese-guide')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(getTranslatedArticleSlug).toHaveBeenCalledExactlyOnceWith('ja', 'shared-guide-group')
  })

  it('bounds the decoded source path to 2048 characters before content lookup', async () => {
    const prefix = '/en/articles/'
    const response = await load({ to: 'ja', from: `${prefix}${'x'.repeat(3000)}` })
    expect(getArticle).toHaveBeenCalledExactlyOnceWith('en', 'x'.repeat(2048 - prefix.length))
    expect(response.headers.get('Location')).toBe('/ja?translation=unavailable')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('getTranslatedArticleSlug (real implementation, mocked CMS)', () => {
  it.each(['', ' ', '\t\n'])('returns null for blank group %j without a CMS request', async (group) => {
    const content = await vi.importActual<typeof import('../app/lib/content.server')>('../app/lib/content.server')
    expect(await content.getTranslatedArticleSlug('ja', group)).toBeNull()
    expect(getPublishedClient).not.toHaveBeenCalled()
    expect(cms.fetch).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'missing', matches: [], expected: null },
    { label: 'unique', matches: [{ slug: 'different-japanese-slug' }], expected: 'different-japanese-slug' },
    { label: 'ambiguous', matches: [{ slug: 'first' }, { slug: 'second' }], expected: null },
    { label: 'duplicate documents with the same slug', matches: [{ slug: 'same' }, { slug: 'same' }], expected: null },
  ])('handles $label translation matches', async ({ matches, expected }) => {
    const content = await vi.importActual<typeof import('../app/lib/content.server')>('../app/lib/content.server')
    cms.fetch.mockResolvedValue(matches)
    expect(await content.getTranslatedArticleSlug('ja', 'shared-guide-group')).toBe(expected)
    expect(getPublishedClient).toHaveBeenCalledTimes(1)
    expect(cms.fetch).toHaveBeenCalledExactlyOnceWith(ARTICLE_TRANSLATIONS_QUERY, {
      language: 'ja', translationGroupId: 'shared-guide-group',
    })
  })
})