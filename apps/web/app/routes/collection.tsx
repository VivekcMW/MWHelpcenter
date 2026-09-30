import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { requireLocale, localePath } from '../i18n/config'
import { createI18n } from '../i18n/instance'
import { getCatalog } from '../lib/content.server'
import { ArticleList } from '../components/ui/article-list'

export async function loader({ params }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale)
  const catalog = await getCatalog(locale)
  const collection = catalog.collections.find((item) => item.slug === params.slug)
  if (!collection) throw new Response('Not found', { status: 404 })
  return { locale, collection, articles: catalog.articles.filter((item) => item.collectionSlug === collection.slug) }
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  const siteTitle = createI18n(data?.locale ?? 'en').t('siteTitle')
  return [{ title: data ? `${data.collection.title} | ${siteTitle}` : siteTitle }, { name: 'description', content: data?.collection.description ?? '' }]
}
export default function CollectionPage() {
  const { locale, collection, articles } = useLoaderData<typeof loader>()
  const { t } = useTranslation('navigation')
  return <div className="page-container inner-page narrow"><nav className="breadcrumbs" aria-label={t('breadcrumbs')}><Link to={localePath(locale)}>{t('home')}</Link><ChevronRight size={16} aria-hidden="true" /><span>{collection.title}</span></nav><div className="page-heading"><h1>{collection.title}</h1><p>{collection.description}</p></div><ArticleList articles={articles} locale={locale} /></div>
}