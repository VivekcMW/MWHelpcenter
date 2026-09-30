import {beforeEach, describe, expect, it, vi} from 'vitest'

const catalog = vi.hoisted(() => ({collections: [] as Array<{slug: string}>, articles: [] as Array<{_id: string; slug: string; collectionSlug?: string; additionalCollectionSlugs?: string[]}>}))
vi.mock('../app/lib/content.server', () => ({getCatalog: vi.fn(async () => catalog)}))

import {loader} from '../app/routes/collection'

function load(locale: string, slug: string) {
  return loader({params: {locale, slug}} as never)
}

beforeEach(() => {
  catalog.collections = []
  catalog.articles = []
})

describe('collection loader', () => {
  it.each(['getting-started', 'best-practices'])('redirects unavailable Japanese shared collection %s to the localized notice', async (slug) => {
    let response: Response | undefined
    try {
      await load('ja', slug)
    } catch (error) {
      response = error as Response
    }
    expect(response?.status).toBe(302)
    expect(response?.headers.get('Location')).toBe('/ja?translation=unavailable')
  })

  it('returns a real 404 for an unrelated missing collection', async () => {
    await expect(load('en', 'missing-topic')).rejects.toMatchObject({status: 404})
  })

  it('lists articles from their primary or additional collection', async () => {
    catalog.collections = [{slug: 'getting-started'}]
    catalog.articles = [
      {_id: 'primary', slug: 'primary-guide', collectionSlug: 'getting-started'},
      {_id: 'additional', slug: 'additional-guide', collectionSlug: 'cms-help', additionalCollectionSlugs: ['getting-started']},
      {_id: 'unrelated', slug: 'unrelated-guide', collectionSlug: 'inventory-help'},
    ]

    const result = await load('en', 'getting-started')
    expect(result.articles.map((article) => article._id)).toEqual(['primary', 'additional'])
  })
})
