import { isLocale, localePath, type Locale } from '../i18n/config'
import { getArticle, getCatalog, getTranslatedArticleSlug } from './content.server'

async function searchDestination(url: URL, target: Locale): Promise<string> {
  const query = new URLSearchParams()
  if (url.searchParams.has('q')) query.set('q', (url.searchParams.get('q') ?? '').slice(0, 200))
  const product = url.searchParams.get('product')
  if (product && (await getCatalog(target)).products.some((item) => item.slug === product)) query.set('product', product)
  return localePath(target, 'search') + (query.size ? `?${query}` : '')
}

async function articleDestination(slug: string, source: Locale, target: Locale, unavailable: string): Promise<string> {
  const article = await getArticle(source, slug)
  if (!article) return unavailable
  let translated: string | null = article.slug
  if (source !== target) {
    translated = article.translationGroupId ? await getTranslatedArticleSlug(target, article.translationGroupId) : null
  }
  // Section keys can differ between translations, so don't carry a stale hash.
  return translated ? localePath(target, `articles/${encodeURIComponent(translated)}`) : unavailable
}

async function detailDestination(segments: string[], source: Locale, target: Locale): Promise<string> {
  const unavailable = `${localePath(target)}?translation=unavailable`
  const [, kind, encodedSlug] = segments
  if (segments.length !== 3 || !encodedSlug) return unavailable
  let slug: string
  try { slug = decodeURIComponent(encodedSlug) } catch { return unavailable }
  if (kind === 'articles') return articleDestination(slug, source, target, unavailable)
  if (kind === 'products' || kind === 'collections') {
    // These documents use stable shared ASCII slugs as their translation key.
    const catalog = await getCatalog(target)
    return catalog[kind].some((item) => item.slug === slug)
      ? localePath(target, `${kind}/${encodeURIComponent(slug)}`) : unavailable
  }
  return unavailable
}

// Resolve only known local routes; never trust a supplied return URL or assume
// that changing a locale prefix makes an English CMS document Japanese.
export async function languageDestination(from: string, target: Locale): Promise<string> {
  const home = localePath(target)
  // eslint-disable-next-line no-control-regex -- Reject normalization tricks before URL parsing.
  if (!from.startsWith('/') || from.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(from)) return home
  const url = new URL(from, 'https://help.invalid')
  const segments = url.pathname.split('/').filter(Boolean)
  const [source, kind] = segments
  if (!isLocale(source)) return home
  if (segments.length === 1) return home + (url.hash === '#products' ? url.hash : '')
  if (segments.length === 2 && kind === 'support') return localePath(target, 'support')
  if (segments.length === 2 && kind === 'search') return searchDestination(url, target)
  return detailDestination(segments, source, target)
}