import { data, Link, redirect, useLoaderData, type ActionFunctionArgs, type HeadersFunction, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { requireLocale, localePath, formatDate } from '../i18n/config'
import { createI18n } from '../i18n/instance'
import { getArticle, getArticleRedirect, getCatalog } from '../lib/content.server'
import { RichContent, contentHeadings } from '../components/content/rich-content'
import { ArticleList } from '../components/ui/article-list'
import { ShareGuide } from '../components/ui/share-guide'
import { ArticleHelpfulness } from '../components/ui/article-helpfulness'
import { getHelpfulnessState, submitHelpfulness } from '../lib/helpfulness.server'
import type { HelpfulnessResult } from '../features/helpfulness'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale)
  const article = await getArticle(locale, params.slug ?? '')
  if (!article) {
    const legacy = await getArticleRedirect(locale, new URL(request.url).pathname)
    if (legacy) throw redirect(legacy.to, {status: legacy.statusCode})
    throw new Response('Not found', { status: 404 })
  }
  const catalog = await getCatalog(locale)
  const { enabled, demo, vote, reason } = await getHelpfulnessState(request, article._id, locale)
  return {
    locale, article,
    helpfulness: { enabled, demo, vote, reason },
    collection: catalog.collections.find((item) => item.slug === article.collectionSlug),
    related: catalog.articles.filter((item) => item._id !== article._id && item.productSlugs.some((slug) => article.productSlugs.includes(slug))).slice(0, 3),
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const response = await submitHelpfulness(request, requireLocale(params.locale), params.slug ?? '')
  return data(await response.json() as HelpfulnessResult, { status: response.status, headers: response.headers })
}

// Preserve parent security headers as well as per-visitor no-store and the
// action cookie for progressive-enhancement document submissions.
export const headers: HeadersFunction = ({ parentHeaders, loaderHeaders, actionHeaders }) => {
  const result = new Headers(parentHeaders)
  result.set('Cache-Control', 'no-store')
  for (const source of [loaderHeaders, actionHeaders]) {
    for (const cookie of source.getSetCookie()) result.append('Set-Cookie', cookie)
  }
  for (const name of ['Retry-After', 'Allow']) {
    const value = actionHeaders.get(name)
    if (value) result.set(name, value)
  }
  return result
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  const siteTitle = createI18n(data?.locale ?? 'en').t('siteTitle')
  return [
    { title: data?.article.seo?.title || (data ? `${data.article.title} | ${siteTitle}` : siteTitle) },
    { name: 'description', content: data?.article.seo?.description || data?.article.summary || '' },
  ]
}

export default function ArticlePage() {
  const { locale, article, collection, related, helpfulness } = useLoaderData<typeof loader>()
  const { t } = useTranslation()
  const { t: nav } = useTranslation('navigation')
  const headings = contentHeadings(article.body)
  return <div className="page-container inner-page">
    <nav className="breadcrumbs" aria-label={nav('breadcrumbs')}><Link to={localePath(locale)}>{nav('home')}</Link>{collection && <><ChevronRight size={16} aria-hidden="true" /><Link to={localePath(locale, `collections/${collection.slug}`)}>{collection.title}</Link></>}<ChevronRight size={16} aria-hidden="true" /><span>{article.title}</span></nav>
    <div className="article-layout"><article className="article-content"><div className="page-heading"><span className="tag">{t(`contentType.${article.contentType}`, { defaultValue: article.contentType })}</span><h1>{article.title}</h1><p>{article.summary}</p>{article.reviewedAt && <p className="article-metadata">{t('reviewed', { date: formatDate(article.reviewedAt, locale) })}</p>}</div>
      <div className="article-actions"><ShareGuide key={article._id} /></div>
      {headings.length > 0 && <details className="mobile-toc"><summary>{t('onThisPage')}</summary>{headings.map((heading) => <a href={`#${heading.id}`} key={heading.id}>{heading.text}</a>)}</details>}
      <RichContent body={article.body} />
      <ArticleHelpfulness key={article._id} locale={locale} slug={article.slug} saved={helpfulness} />
      <div className="article-support"><div><h2>{t('stuckTitle')}</h2><p>{t('stuckDescription')}</p></div><Link className="button button-outline" to={localePath(locale, 'support')}>{t('contactSupport')} <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
      {related.length > 0 && <section className="section"><h2>{t('relatedGuides')}</h2><ArticleList articles={related} locale={locale} /></section>}
    </article><aside className="article-toc" aria-label={t('onThisPage')}>{headings.length > 0 && <><h2>{t('onThisPage')}</h2>{headings.map((heading) => <a href={`#${heading.id}`} key={heading.id}>{heading.text}</a>)}</>}<Link className="toc-support" to={localePath(locale, 'support')}>{t('contactSupport')} <ArrowUpRight size={16} aria-hidden="true" /></Link></aside></div>
  </div>
}