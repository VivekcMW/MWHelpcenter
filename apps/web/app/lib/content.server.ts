import type { Article, ArticleSummary, Collection, ContentRedirect, Product } from '@mw/content'
import { ARTICLE_QUERY, ARTICLES_QUERY, ARTICLE_TRANSLATIONS_QUERY, COLLECTIONS_QUERY, PRODUCTS_QUERY, REDIRECT_QUERY, SEARCH_ARTICLES_QUERY } from '@mw/content/queries'
import type { Locale } from '../i18n/config'
import type { SearchArticle } from '../features/search/rank'
import { getEnv } from './env.server'
import { getPublishedClient } from './sanity/client.server'

export async function getCatalog(language: Locale) {
  if (getEnv().CONTENT_MODE === 'demo') {
    const fixture = await import('@mw/content/fixtures')
    const products = language === 'ja' ? fixture.japaneseProducts : fixture.products
    const collections = language === 'ja' ? fixture.japaneseCollections : fixture.collections
    const articles = language === 'ja' ? fixture.japaneseArticles : fixture.articles
    return {
      products: products.filter((item) => item.language === language),
      collections: collections.filter((item) => item.language === language),
      articles: articles.filter((item) => item.language === language).map(({ body: _body, seo: _seo, ...summary }) => summary),
    }
  }
  const client = getPublishedClient()
  const [products, collections, articles] = await Promise.all([
    client.fetch<Product[]>(PRODUCTS_QUERY, { language }),
    client.fetch<Collection[]>(COLLECTIONS_QUERY, { language }),
    client.fetch<ArticleSummary[]>(ARTICLES_QUERY, { language }),
  ])
  return { products, collections, articles }
}

// Kept separate so navigation/catalog consumers never fetch article bodies.
export async function getSearchCatalog(language: Locale) {
  if (getEnv().CONTENT_MODE === 'demo') {
    const fixture = await import('@mw/content/fixtures')
    const catalog = await getCatalog(language)
    const articles = language === 'ja' ? fixture.japaneseArticles : fixture.articles
    return { ...catalog, articles: articles.filter((item) => item.language === language) }
  }
  const client = getPublishedClient()
  const [products, collections, articles] = await Promise.all([
    client.fetch<Product[]>(PRODUCTS_QUERY, { language }),
    client.fetch<Collection[]>(COLLECTIONS_QUERY, { language }),
    client.fetch<SearchArticle[]>(SEARCH_ARTICLES_QUERY, { language }),
  ])
  return { products, collections, articles }
}

export async function getArticle(language: Locale, slug: string): Promise<Article | null> {
  if (getEnv().CONTENT_MODE === 'demo') {
    const fixture = await import('@mw/content/fixtures')
    const articles = language === 'ja' ? fixture.japaneseArticles : fixture.articles
    return articles.find((item) => item.slug === slug && item.language === language) ?? null
  }
  return getPublishedClient().fetch<Article | null>(ARTICLE_QUERY, { language, slug })
}

export async function getArticleRedirect(language: Locale, from: string): Promise<ContentRedirect | null> {
  if (getEnv().CONTENT_MODE === 'demo') return null
  const result = await getPublishedClient().fetch<ContentRedirect | null>(REDIRECT_QUERY, {language, from})
  const safeLocalTarget = typeof result?.to === 'string' && /^\/(?!\/)[^?#\s\\]*$/.test(result.to) && !Array.from(result.to).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if (result?.language !== language || result?.from !== from || !safeLocalTarget || ![301, 302, 307, 308].includes(result?.statusCode ?? 0)) return null
  return result
}

export async function getTranslatedArticleSlug(language: Locale, translationGroupId: string): Promise<string | null> {
  if (!translationGroupId.trim()) return null
  if (getEnv().CONTENT_MODE === 'demo') {
    const fixture = await import('@mw/content/fixtures')
    const articles = language === 'ja' ? fixture.japaneseArticles : fixture.articles
    const matches = articles.filter((item) => item.language === language && item.translationGroupId === translationGroupId)
    return matches.length === 1 ? matches[0].slug : null
  }
  const matches = await getPublishedClient().fetch<Array<Pick<Article, 'slug'>>>(ARTICLE_TRANSLATIONS_QUERY, { language, translationGroupId })
  return matches.length === 1 ? matches[0].slug : null
}