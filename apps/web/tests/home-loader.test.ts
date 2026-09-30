import {beforeEach, describe, expect, it, vi} from 'vitest'

const content = vi.hoisted(() => ({getCatalog: vi.fn(), getHomePage: vi.fn()}))
vi.mock('../app/lib/content.server', () => content)

import {loader} from '../app/routes/home'

function load(locale: string) {
  return loader({params: {locale}} as never)
}

const catalog = {products: [], collections: [], articles: []}
const homepage = {
  _id: 'homePage-en', language: 'en', eyebrow: 'Knowledge hub', heroTitle: 'Find your answer', heroDescription: 'Search practical guides.',
  taskShortcuts: [{_key: 'task', label: 'Manage inventory', productSlug: 'inventory'}],
  featuredProductSlugs: ['inventory'], featuredCollectionSlugs: ['getting-started'], featuredArticleSlugs: ['intro'],
  resources: [{_key: 'start', title: 'Start here', description: 'Learn the basics.', linkLabel: 'Start', icon: 'book', collectionSlug: 'getting-started'}],
}

beforeEach(() => {
  content.getCatalog.mockReset().mockResolvedValue(catalog)
  content.getHomePage.mockReset().mockResolvedValue(homepage)
})

describe('homepage loader', () => {
  it('loads the localized catalog and page model together', async () => {
    const result = await load('en')
    expect(content.getCatalog).toHaveBeenCalledExactlyOnceWith('en')
    expect(content.getHomePage).toHaveBeenCalledExactlyOnceWith('en')
    expect(result).toEqual({locale: 'en', ...catalog, homePage: homepage})
  })

  it('rejects unsupported locales before querying either content source', async () => {
    await expect(load('fr')).rejects.toMatchObject({status: 404})
    expect(content.getCatalog).not.toHaveBeenCalled()
    expect(content.getHomePage).not.toHaveBeenCalled()
  })

  it('preserves the existing homepage fallback when no Sanity homepage exists', async () => {
    content.getHomePage.mockResolvedValue(null)
    expect((await load('ja')).homePage).toBeNull()
    expect(content.getCatalog).toHaveBeenCalledExactlyOnceWith('ja')
  })
})
