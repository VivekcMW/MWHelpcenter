import {describe, expect, it} from 'vitest'
import {createRequire} from 'node:module'
import * as queries from '../src/queries'
import {articles, collections, products, japaneseArticles, japaneseCollections, japaneseProducts} from '../src/fixtures'

// Exercise real GROQ locally via Studio's existing Sanity dependency. No service,
// network access or new package installation is needed for these contract tests.
const studioRequire = createRequire(new URL('../../../apps/studio/package.json', import.meta.url))
const sanityRequire = createRequire(studioRequire.resolve('sanity'))
const groq = sanityRequire('groq-js') as {
  parse: (query: string) => unknown
  evaluate: (tree: unknown, options: { dataset: unknown[]; params: { language: string } }) => Promise<{ get: () => Promise<unknown> }>
}

describe('public query contract', () => {
  it.each(Object.entries(queries))('%s filters language and excludes draft/version IDs', (_name, query) => {
    expect(query).toContain('language == $language')
    expect(query).toContain('!(_id in path("drafts.**"))')
    expect(query).toContain('!(_id in path("versions.**"))')
    expect(query).not.toContain('...')
    expect(query.match(/\*/g)).toHaveLength(5) // one document selector + two ** path guards
    expect(query).not.toMatch(/password|token|email|approval|editorial|_rev|_createdAt|_updatedAt/i)
  })

  it.each([queries.ARTICLE_QUERY, queries.PRODUCT_QUERY, queries.COLLECTION_QUERY])('detail queries require a slug', (query) => {
    expect(query).toContain('slug.current == $slug][0]')
  })

  it('uses explicit article reference and nested body projections', () => {
    for (const query of [queries.ARTICLE_QUERY, queries.ARTICLES_QUERY]) {
      expect(query).toContain('products[]->slug.current')
      expect(query).toContain('primaryCollection->slug.current')
    }
    expect(queries.ARTICLE_QUERY).toContain('children[]{_key, _type, text, marks}')
    expect(queries.ARTICLE_QUERY).toContain('markDefs[]{_key, _type, href}')
    expect(queries.ARTICLE_QUERY).toContain('asset->{_id, url}')
    expect(queries.ARTICLES_QUERY).not.toContain('body')
  })

  it('locks down every public field whitelist', () => {
    const fields = new Set(['_id', '_key', '_type', 'title', 'slug', 'description', 'icon', 'order', 'language', 'productSlug', 'summary', 'productSlugs', 'collectionSlug', 'additionalCollectionSlugs', 'contentType', 'reviewedAt', 'body', 'style', 'listItem', 'level', 'children', 'text', 'marks', 'markDefs', 'href', 'tone', 'image', 'asset', 'url', 'crop', 'top', 'bottom', 'left', 'right', 'hotspot', 'x', 'y', 'width', 'height', 'alt', 'caption', 'steps', 'columns', 'rows', 'cells', 'translationGroupId', 'seo', 'file', 'mimeType', 'originalFilename', 'size', 'video', 'poster', 'captions', 'label', 'transcript', 'audio', 'code'])
    for (const query of Object.values(queries)) {
      const projection = query.slice(query.indexOf('{'))
      const withoutPredicates = projection.replace(/defined\([^)]*\)\s*=>/g, '').replace(/_type\s*==\s*"[^"]+"\s*=>/g, '')
      const projected = [...withoutPredicates.matchAll(/(?:^|[{},])\s*(?:"(\w+)"\s*:|(\w+))/g)].map((match) => match[1] ?? match[2])
      expect(projected.length).toBeGreaterThan(0)
      for (const field of projected) expect(fields.has(field), `Unexpected public field: ${field}`).toBe(true)
    }
  })
})

describe('search projection runtime contract', () => {
  const body = [
    { _type: 'block', _key: 'private-key', style: 'h2', children: [{ _type: 'span', _key: 'span-key', text: 'Visible linked text', marks: ['link'] }, { _type: 'secret', text: 'Hidden inline text' }], markDefs: [{ _type: 'link', href: 'https://private-url.test' }] },
    { _type: 'callout', title: 'Notice', text: 'Visible notice', tone: 'info', internal: 'private' },
    { _type: 'codeBlock', language: 'bash', code: 'echo visible-code', internal: 'private' },
    { _type: 'procedure', title: 'Procedure', steps: [{ _key: 'step-key', title: 'Step', description: 'Visible step', internal: 'private' }] },
    { _type: 'simpleTable', caption: 'Table caption', columns: ['Column'], rows: [{ _key: 'row-key', cells: ['Cell'], internal: 'private' }] },
    { _type: 'imageWithCaption', caption: 'Image caption', alt: 'private alt', image: { asset: { _ref: 'asset-id' } } },
    { _type: 'animatedImageWithCaption', caption: 'Animation caption', alt: 'private animation alt', file: { asset: { _ref: 'gif-id' } } },
    { _type: 'videoWithCaption', title: 'Video title', caption: 'Video caption', transcript: 'Visible video transcript', video: { asset: { _ref: 'video-id' } }, captions: [{ language: 'en', label: 'English', file: { asset: { _ref: 'vtt-id' } } }] },
    { _type: 'audioWithTranscript', title: 'Audio title', caption: 'Audio caption', transcript: 'Visible audio transcript', audio: { asset: { _ref: 'audio-id' } } },
    { _type: 'downloadableFile', title: 'Guide download', caption: 'Download caption', file: { asset: { _ref: 'file-id' } } },
  ]
  const expectedBody = [
    { _type: 'block', children: [{ _type: 'span', text: 'Visible linked text' }] },
    { _type: 'callout', title: 'Notice', text: 'Visible notice' },
    { _type: 'codeBlock', code: 'echo visible-code' },
    { _type: 'procedure', title: 'Procedure', steps: [{ title: 'Step', description: 'Visible step' }] },
    { _type: 'simpleTable', caption: 'Table caption', columns: ['Column'], rows: [{ cells: ['Cell'] }] },
    { _type: 'imageWithCaption', caption: 'Image caption' },
    { _type: 'animatedImageWithCaption', caption: 'Animation caption' },
    { _type: 'videoWithCaption', title: 'Video title', caption: 'Video caption', transcript: 'Visible video transcript' },
    { _type: 'audioWithTranscript', title: 'Audio title', caption: 'Audio caption', transcript: 'Visible audio transcript' },
    { _type: 'downloadableFile', title: 'Guide download', caption: 'Download caption' },
  ]
  const article = {
    _type: 'article', _id: 'published-en', language: 'en', title: 'Guide', slug: { current: 'guide' }, summary: 'Summary',
    products: [{ _ref: 'inventory' }], primaryCollection: { _ref: 'collection' }, collections: [{_ref: 'shared-collection'}], contentType: 'guide', body,
    seo: { title: 'private SEO' }, translationGroupId: 'private-group', secret: 'private',
  }
  const dataset = [
    article, { ...article, _id: 'published-ja', language: 'ja' },
    { ...article, _id: 'drafts.guide' }, { ...article, _id: 'versions.release.guide' },
    { ...article, _id: 'drafts.japanese', language: 'ja' }, { ...article, _id: 'versions.release.japanese', language: 'ja' },
    { ...article, _id: 'other-type', _type: 'product' },
    { _id: 'inventory', _type: 'product', slug: { current: 'inventory' } },
    { _id: 'collection', _type: 'collection', slug: { current: 'getting-started' } },
    { _id: 'shared-collection', _type: 'collection', slug: { current: 'best-practices' } },
    { _id: 'asset-id', _type: 'sanity.imageAsset', url: 'https://private-asset.test' },
  ]

  it.each(['en', 'ja'])('evaluates published %s filtering and every nested whitelist', async (language) => {
    const value = await groq.evaluate(groq.parse(queries.SEARCH_ARTICLES_QUERY), { dataset, params: { language } })
    expect(await value.get()).toEqual([{
      _id: `published-${language}`, language, title: 'Guide', slug: 'guide', summary: 'Summary',
      productSlugs: ['inventory'], collectionSlug: 'getting-started', additionalCollectionSlugs: ['best-practices'], contentType: 'guide', body: expectedBody,
    }])
  })

  it('evaluates the unchanged summary query without body or metadata', async () => {
    const value = await groq.evaluate(groq.parse(queries.ARTICLES_QUERY), { dataset, params: { language: 'en' } })
    expect(await value.get()).toEqual([{
      _id: 'published-en', language: 'en', title: 'Guide', slug: 'guide', summary: 'Summary',
      productSlugs: ['inventory'], collectionSlug: 'getting-started', additionalCollectionSlugs: ['best-practices'], contentType: 'guide',
    }])
  })

  it('never projects annotation URLs, assets, alt text, keys or SEO into search bodies', () => {
    const projection = queries.SEARCH_ARTICLES_QUERY.slice(queries.SEARCH_ARTICLES_QUERY.indexOf('body[]'))
    expect(projection).not.toMatch(/_key|_id|href|markDefs|marks|asset|image\{|alt|seo|translationGroupId|\.\.\./)
    expect(projection).toContain('children[_type == "span"]{_type, text}')
  })
})

describe('original sample fixtures', () => {
  it('provides six products and the shared/product collection contract', () => {
    expect(products.map((product) => product.slug)).toEqual(['inventory', 'planner', 'influence', 'measure', 'cms', 'admin-console'])
    expect(collections.filter((collection) => !collection.productSlug).map((collection) => collection.slug)).toEqual(['getting-started', 'best-practices'])
    expect(collections.find((collection) => collection.slug === 'inventory-imports')?.productSlug).toBe('inventory')
  })

  it('uses valid, unique slugs and resolvable same-language relationships', () => {
    for (const documents of [products, collections, articles]) {
      expect(new Set(documents.map((document) => document._id)).size).toBe(documents.length)
      expect(new Set(documents.map((document) => document.slug)).size).toBe(documents.length)
      for (const document of documents) {
        expect(document.language).toBe('en')
        expect(document.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      }
    }
    for (const article of articles) {
      expect(collections.some((collection) => collection.slug === article.collectionSlug && collection.language === article.language)).toBe(true)
      for (const slug of article.productSlugs) expect(products.some((product) => product.slug === slug && product.language === article.language)).toBe(true)
    }
  })

  it('has short original articles and valid Portable Text array keys', () => {
    expect(articles.length).toBeGreaterThanOrEqual(3)
    expect(articles.length).toBeLessThanOrEqual(5)
    for (const article of articles) {
      expect(article.body.length).toBeGreaterThan(0)
      const keys: string[] = []
      for (const block of article.body) {
        expect(block._key).toBeTruthy()
        keys.push(block._key!)
        if (block._type === 'block') {
          expect(block.children.length).toBeGreaterThan(0)
          expect(block.markDefs).toEqual([])
          for (const child of block.children) {
            expect(child._key).toBeTruthy()
            keys.push(child._key!)
          }
        }
      }
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('bilingual sample fixtures', () => {
  const japaneseText = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u
  const translatedFields = new Set(['title', 'description', 'text', 'caption', 'alt', 'columns', 'cells'])

  function expectLocalizedContent(original: unknown, translated: unknown, keys: string[], field = ''): void {
    if (typeof original === 'string') {
      if (translatedFields.has(field)) {
        expect(translated).not.toBe(original)
        expect(translated).toMatch(japaneseText)
      } else {
        expect(translated).toBe(original)
      }
      if (field === '_key') {
        expect(translated).toBeTruthy()
        keys.push(translated as string)
      }
    } else if (Array.isArray(original)) {
      expect(Array.isArray(translated)).toBe(true)
      const translatedItems = translated as unknown[]
      expect(translatedItems).toHaveLength(original.length)
      original.forEach((item, index) => expectLocalizedContent(item, translatedItems[index], keys, field))
    } else if (original !== null && typeof original === 'object') {
      expect(translated).not.toBeNull()
      expect(typeof translated).toBe('object')
      const translatedObject = translated as Record<string, unknown>
      expect(Object.keys(translatedObject).sort()).toEqual(Object.keys(original).sort())
      for (const [key, value] of Object.entries(original)) {
        expectLocalizedContent(value, translatedObject[key], keys, key)
      }
    } else {
      expect(translated).toBe(original)
    }
  }

  it('keeps English exports separate and uses globally unique Japanese IDs with stable slugs', () => {
    const pairs = [
      {english: products, japanese: japaneseProducts},
      {english: collections, japanese: japaneseCollections},
      {english: articles, japanese: japaneseArticles},
    ]
    const ids = pairs.flatMap(({english, japanese}) => [...english, ...japanese].map((document) => document._id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const {english, japanese} of pairs) {
      expect(japanese.map((document) => document.slug)).toEqual(english.map((document) => document.slug))
      expect(new Set(japanese.map((document) => document.slug)).size).toBe(japanese.length)
      for (const document of english) expect(document.language).toBe('en')
      japanese.forEach((document, index) => {
        expect(document.language).toBe('ja')
        expect(document._id).toBe(`${english[index]._id}-ja`)
        expect(document.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      })
    }
  })

  it('retains product brands and translates every product and collection description', () => {
    japaneseProducts.forEach((product, index) => {
      expect(product.title).toBe(products[index].title)
      expect(product.icon).toBe(products[index].icon)
      expect(product.order).toBe(products[index].order)
      expect(product.description).not.toBe(products[index].description)
      expect(product.description).toMatch(japaneseText)
    })
    japaneseCollections.forEach((collection, index) => {
      expect(collection.title).not.toBe(collections[index].title)
      expect(collection.title).toMatch(japaneseText)
      expect(collection.description).not.toBe(collections[index].description)
      expect(collection.description).toMatch(japaneseText)
      expect(collection.productSlug).toBe(collections[index].productSlug)
    })
  })

  it.each([
    {language: 'en', localizedProducts: products, localizedCollections: collections, localizedArticles: articles},
    {language: 'ja', localizedProducts: japaneseProducts, localizedCollections: japaneseCollections, localizedArticles: japaneseArticles},
  ])('resolves all $language article and collection relationships within that language', ({language, localizedProducts, localizedCollections, localizedArticles}) => {
    for (const collection of localizedCollections) {
      if (collection.productSlug) {
        expect(localizedProducts.some((product) => product.slug === collection.productSlug && product.language === language)).toBe(true)
      }
    }
    for (const article of localizedArticles) {
      expect(article.language).toBe(language)
      expect(localizedCollections.some((collection) => collection.slug === article.collectionSlug && collection.language === language)).toBe(true)
      expect(article.productSlugs.length).toBeGreaterThan(0)
      for (const slug of article.productSlugs) {
        expect(localizedProducts.some((product) => product.slug === slug && product.language === language)).toBe(true)
      }
    }
  })

  it('pairs article translations by group with matching relationships and fully translated structured content', () => {
    expect(new Set(articles.map((article) => article.translationGroupId)).size).toBe(articles.length)
    expect(new Set(japaneseArticles.map((article) => article.translationGroupId)).size).toBe(japaneseArticles.length)
    for (const original of articles) {
      expect(original.translationGroupId).toBeTruthy()
      const equivalents = japaneseArticles.filter((article) => article.translationGroupId === original.translationGroupId)
      expect(equivalents).toHaveLength(1)
      const translated = equivalents[0]
      expect(translated.slug).toBe(original.slug)
      expect(translated.productSlugs).toEqual(original.productSlugs)
      expect(translated.collectionSlug).toBe(original.collectionSlug)
      expect(translated.contentType).toBe(original.contentType)
      expect(translated.title).not.toBe(original.title)
      expect(translated.title).toMatch(japaneseText)
      expect(translated.summary).not.toBe(original.summary)
      expect(translated.summary).toMatch(japaneseText)
      expect(translated.body.length).toBeGreaterThan(0)
      const keys: string[] = []
      expectLocalizedContent(original.body, translated.body, keys)
      expect(new Set(keys).size).toBe(keys.length)
      expectLocalizedContent(original.seo, translated.seo, [])
    }
  })
})