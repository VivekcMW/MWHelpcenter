import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { articles, collections, products, japaneseArticles, japaneseCollections, japaneseProducts } from '@mw/content/fixtures'
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router'
import type { HelpfulnessResult, HelpfulnessView } from '../app/features/helpfulness'
import type { Locale } from '../app/i18n/config'
import { getArticle, getArticleRedirect, getCatalog } from '../app/lib/content.server'
import { getHelpfulnessState, submitHelpfulness } from '../app/lib/helpfulness.server'
import { action, headers, loader } from '../app/routes/article'

vi.mock('../app/lib/content.server', () => ({ getArticle: vi.fn(), getArticleRedirect: vi.fn(), getCatalog: vi.fn() }))
vi.mock('../app/lib/helpfulness.server', () => ({ getHelpfulnessState: vi.fn(), submitHelpfulness: vi.fn() }))
// These factories are deliberately fatal if an accidental real service import
// reaches infrastructure. No environment configuration or database is needed.
vi.mock('../app/lib/helpfulness-store.server', () => { throw new Error('Offline route test must not load the store') })
vi.mock('../app/lib/env.server', () => { throw new Error('Offline route test must not load environment configuration') })
vi.mock('../app/lib/sanity/client.server', () => { throw new Error('Offline route test must not load a CMS client') })

const fixtures = {
  en: { articles, collections, products },
  ja: { articles: japaneseArticles, collections: japaneseCollections, products: japaneseProducts },
}
const token = 'b'.repeat(64)
const cookie = `mw_helpfulness=${token}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure`

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request in offline helpfulness route test'))
})

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

function args(locale: string, method = 'GET', slug = 'getting-started'): LoaderFunctionArgs & ActionFunctionArgs {
  const url = new URL(`https://help.test/${locale}/articles/${slug}`)
  const request = new Request(url, {
    method, headers: { Cookie: `mw_helpfulness=${token}`, Origin: url.origin },
    ...(method === 'POST' ? { body: new URLSearchParams({ vote: 'no', reason: 'missing', website: '' }) } : {}),
  })
  return { request, params: { locale, slug }, context: {}, url, pattern: '/:locale/articles/:slug' }
}

function headerArgs(overrides: Partial<Parameters<HeadersFunction>[0]> = {}): Parameters<HeadersFunction>[0] {
  return { parentHeaders: new Headers(), loaderHeaders: new Headers(), actionHeaders: new Headers(), errorHeaders: undefined, ...overrides }
}

const responses: Array<{ status: number; result: HelpfulnessResult; extra?: HeadersInit }> = [
  { status: 200, result: { ok: true, vote: 'no', reason: 'missing' }, extra: { 'Set-Cookie': cookie } },
  { status: 400, result: { ok: false, error: 'invalid' } },
  { status: 403, result: { ok: false, error: 'forbidden' } },
  { status: 404, result: { ok: false, error: 'notFound' } },
  { status: 405, result: { ok: false, error: 'invalid' }, extra: { Allow: 'POST' } },
  { status: 413, result: { ok: false, error: 'tooLarge' } },
  { status: 415, result: { ok: false, error: 'invalid' } },
  { status: 429, result: { ok: false, error: 'rateLimited' }, extra: { 'Retry-After': '60' } },
  { status: 503, result: { ok: false, error: 'unavailable' } },
]

describe.each(['en', 'ja'] as const)('article helpfulness route (%s)', (locale: Locale) => {
  it.each(responses)('preserves action status $status, safe data, no-store and server headers', async ({ status, result, extra }) => {
    const responseHeaders = new Headers(extra)
    responseHeaders.set('Cache-Control', 'no-store')
    responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
    vi.mocked(submitHelpfulness).mockResolvedValue(new Response(JSON.stringify(result), { status, headers: responseHeaders }))
    const input = args(locale, 'POST')
    const output = await action(input)
    expect(submitHelpfulness).toHaveBeenCalledExactlyOnceWith(input.request, locale, input.params.slug)
    expect(output.data).toEqual(result)
    expect(output.init?.status).toBe(status)
    const outputHeaders = new Headers(output.init?.headers)
    expect([...outputHeaders]).toEqual([...responseHeaders])
    expect(outputHeaders.getSetCookie()).toEqual(status === 200 ? [cookie] : [])
    expect(outputHeaders.get('Retry-After')).toBe(status === 429 ? '60' : null)
    expect(JSON.stringify(output.data)).not.toContain(token)
    expect(output.data).not.toHaveProperty('headers')
    const documentHeaders = new Headers(headers(headerArgs({ actionHeaders: outputHeaders })))
    expect(documentHeaders.get('Cache-Control')).toBe('no-store')
    expect(documentHeaders.getSetCookie()).toEqual(outputHeaders.getSetCookie())
    expect(documentHeaders.get('Retry-After')).toBe(outputHeaders.get('Retry-After'))
    expect(documentHeaders.get('Allow')).toBe(outputHeaders.get('Allow'))
    expect(getArticle).not.toHaveBeenCalled()
    expect(getCatalog).not.toHaveBeenCalled()
    expect(getHelpfulnessState).not.toHaveBeenCalled()
  })

  it.each([true, false])('returns only safe helpfulness state with enabled=%s, excluding Headers and visitor data', async (enabled) => {
    const catalog = fixtures[locale]
    const article = catalog.articles[0]
    const state: HelpfulnessView = { enabled, demo: enabled, vote: enabled ? 'no' : null, reason: enabled ? 'missing' : '' }
    const privateHeaders = new Headers({ 'Set-Cookie': cookie, 'X-Visitor-Hash': 'private-visitor-hash', 'Cache-Control': 'no-store' })
    vi.mocked(getArticle).mockResolvedValue(article)
    vi.mocked(getCatalog).mockResolvedValue(catalog)
    vi.mocked(getHelpfulnessState).mockResolvedValue({ ...state, headers: privateHeaders })
    const input = args(locale)
    const output = await loader(input)
    expect(getArticle).toHaveBeenCalledExactlyOnceWith(locale, article.slug)
    expect(getCatalog).toHaveBeenCalledExactlyOnceWith(locale)
    expect(getHelpfulnessState).toHaveBeenCalledExactlyOnceWith(input.request, article._id, locale)
    expect(output.locale).toBe(locale)
    expect(output.article).toBe(article)
    expect(output.collection).toEqual(catalog.collections.find((item) => item.slug === article.collectionSlug))
    expect(output.related.map((item) => item._id)).toEqual(catalog.articles.slice(1, 4).map((item) => item._id))
    expect(output.helpfulness).toEqual(state)
    expect(Object.keys(output.helpfulness).sort()).toEqual(['demo', 'enabled', 'reason', 'vote'])
    expect(output.helpfulness).not.toHaveProperty('headers')
    expect(output).not.toHaveProperty('headers')
    const serialized = JSON.stringify(output)
    for (const privateValue of [token, cookie, 'mw_helpfulness', 'private-visitor-hash', 'Set-Cookie', 'visitorHash']) {
      expect(serialized).not.toContain(privateValue)
    }
    // Assert the object boundary as well: JSON.stringify(Headers) is only {},
    // so string checks alone would miss accidentally serializing Headers.
    expect(Object.values(output.helpfulness).some((value: unknown) => value instanceof Headers)).toBe(false)
    expect(privateHeaders.getSetCookie()).toEqual([cookie])
    expect(submitHelpfulness).not.toHaveBeenCalled()
  })

  it('returns 404 before helpfulness/catalog reads when the article is absent', async () => {
    vi.mocked(getArticle).mockResolvedValue(null)
    vi.mocked(getArticleRedirect).mockResolvedValue(null)
    await expect(loader(args(locale))).rejects.toMatchObject({ status: 404 })
    expect(getArticleRedirect).toHaveBeenCalledExactlyOnceWith(locale, `/${locale}/articles/getting-started`)
    expect(getHelpfulnessState).not.toHaveBeenCalled()
    expect(getCatalog).not.toHaveBeenCalled()
  })
})

describe('article helpfulness header and locale boundaries', () => {
  it('merges parent security and all cookies without mutating inputs or retaining public caching', () => {
    const parentHeaders = new Headers({
      'Content-Security-Policy': "default-src 'self'", 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'public, max-age=3600',
      'Set-Cookie': 'parent=one; Path=/; HttpOnly',
    })
    const loaderHeaders = new Headers({ 'Set-Cookie': 'loader=two; Path=/; HttpOnly' })
    const actionHeaders = new Headers({ 'Retry-After': '60', Allow: 'POST', 'Set-Cookie': cookie })
    actionHeaders.append('Set-Cookie', 'another=three; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/')
    const sources = [parentHeaders, loaderHeaders, actionHeaders]
    const before = sources.map((source) => [...source.entries()])
    const output = new Headers(headers(headerArgs({ parentHeaders, loaderHeaders, actionHeaders })))
    expect(output.get('Cache-Control')).toBe('no-store')
    for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
      expect(output.get(name)).toBe(parentHeaders.get(name))
    }
    expect(output.getSetCookie()).toEqual(sources.flatMap((source) => source.getSetCookie()))
    expect(output.get('Retry-After')).toBe('60')
    expect(output.get('Allow')).toBe('POST')
    expect(sources.map((source) => [...source.entries()])).toEqual(before)
  })

  it('always uses no-store even on passive cookie-free document loads', () => {
    const output = new Headers(headers(headerArgs()))
    expect([...output]).toEqual([['cache-control', 'no-store']])
    expect(output.getSetCookie()).toEqual([])
  })

  it('rejects unsupported locales before calling any service', async () => {
    await expect(loader(args('fr'))).rejects.toMatchObject({ status: 404 })
    await expect(action(args('fr', 'POST'))).rejects.toMatchObject({ status: 404 })
    expect(getArticle).not.toHaveBeenCalled()
    expect(getCatalog).not.toHaveBeenCalled()
    expect(getHelpfulnessState).not.toHaveBeenCalled()
    expect(submitHelpfulness).not.toHaveBeenCalled()
  })
})