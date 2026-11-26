import { describe, expect, it } from 'vitest'
import { meta as rootMeta } from '../app/root'
import { meta as homeMeta } from '../app/routes/home'
import { meta as productMeta } from '../app/routes/product'
import { meta as collectionMeta } from '../app/routes/collection'
import { meta as articleMeta } from '../app/routes/article'
import { meta as searchMeta } from '../app/routes/search'
import { meta as supportMeta } from '../app/routes/support'

describe.each(['en', 'ja'])('page titles (%s)', (locale) => {
  it('uses the same title on all pages, including pages with CMS SEO titles', () => {
    const metadata = [
      rootMeta({loaderData: {locale, siteSettings: {title: 'CMS site title'}}} as never),
      homeMeta({loaderData: {locale, homePage: {seo: {title: 'CMS home title', description: 'Home description'}}}} as never),
      productMeta({loaderData: {locale, product: {title: 'Product', description: 'Product description'}}} as never),
      collectionMeta({loaderData: {locale, collection: {title: 'Collection', description: 'Collection description'}}} as never),
      articleMeta({loaderData: {locale, article: {title: 'Article', summary: 'Summary', seo: {title: 'CMS article title', description: 'Article description'}}}} as never),
      searchMeta({loaderData: {locale}} as never),
      supportMeta({loaderData: {locale}} as never),
      rootMeta({loaderData: undefined} as never),
    ]
    for (const descriptors of metadata) expect(descriptors).toContainEqual({title: 'Moving Walls | Helpcenter'})
    expect(metadata[1]).toContainEqual({name: 'description', content: 'Home description'})
    expect(metadata[4]).toContainEqual({name: 'description', content: 'Article description'})
  })
})
