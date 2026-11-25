import type { ArticleSummary } from '@mw/content'

function collectionSlugs(article: ArticleSummary): Set<string> {
  return new Set([article.collectionSlug, ...(article.additionalCollectionSlugs ?? [])].filter((slug): slug is string => Boolean(slug)))
}

export function startingGuides(articles: ArticleSummary[]): ArticleSummary[] {
  return articles
    .map((article, index) => ({
      article,
      index,
      priority: collectionSlugs(article).has('getting-started') ? 0 : article.contentType === 'overview' ? 1 : 2,
    }))
    .filter(({priority}) => priority < 2)
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, 3)
    .map(({article}) => article)
}

export function relatedGuides(article: ArticleSummary, candidates: ArticleSummary[]): ArticleSummary[] {
  const collections = collectionSlugs(article)
  const products = new Set(article.productSlugs)
  return candidates
    .filter((candidate) => candidate._id !== article._id && candidate.language === article.language && candidate.productSlugs.some((slug) => products.has(slug)))
    .map((candidate, index) => ({
      candidate,
      index,
      sharedCollections: [...collectionSlugs(candidate)].filter((slug) => collections.has(slug)).length,
    }))
    .sort((a, b) => b.sharedCollections - a.sharedCollections || a.index - b.index)
    .slice(0, 3)
    .map(({candidate}) => candidate)
}
