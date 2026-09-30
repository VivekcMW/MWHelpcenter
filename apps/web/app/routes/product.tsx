import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { requireLocale, localePath } from '../i18n/config'
import { createI18n } from '../i18n/instance'
import { getCatalog } from '../lib/content.server'
import { SearchForm } from '../components/ui/search-form'
import { ArticleList } from '../components/ui/article-list'

export async function loader({ params }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale)
  const catalog = await getCatalog(locale)
  const product = catalog.products.find((item) => item.slug === params.slug)
  if (!product) throw new Response('Not found', { status: 404 })
  return { locale, product, products: catalog.products, articles: catalog.articles.filter((item) => item.productSlugs.includes(product.slug)), collections: catalog.collections.filter((item) => item.productSlug === product.slug) }
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  const siteTitle = createI18n(data?.locale ?? 'en').t('siteTitle')
  return [{ title: data ? `${data.product.title} | ${siteTitle}` : siteTitle }, { name: 'description', content: data?.product.description ?? '' }]
}

export default function ProductPage() {
  const { locale, product, products, articles, collections } = useLoaderData<typeof loader>()
  const { t } = useTranslation()
  const { t: nav } = useTranslation('navigation')
  return <div className="page-container inner-page"><nav className="breadcrumbs" aria-label={nav('breadcrumbs')}><Link to={localePath(locale)}>{nav('home')}</Link><ChevronRight size={16} aria-hidden="true" /><span>{product.title}</span></nav><div className="page-heading"><p className="eyebrow">{nav('products')}</p><h1>{product.title}</h1><p>{product.description}</p></div><SearchForm locale={locale} product={product.slug} /><div className="two-column"><aside className="side-nav" aria-label={nav('products')}><h2>{nav('products')}</h2>{products.map((item) => <Link key={item._id} aria-current={item.slug === product.slug ? 'page' : undefined} to={localePath(locale, `products/${item.slug}`)}>{item.title}<ArrowRight size={16} aria-hidden="true" /></Link>)}</aside><section><div className="section-heading"><h2>{t('allGuides')}</h2><span>{t('articleCount', { count: articles.length })}</span></div><ArticleList articles={articles} locale={locale} />{collections.length > 0 && <div className="section"><h2>{t('topics')}</h2><div className="topic-links">{collections.map((item) => <Link key={item._id} to={localePath(locale, `collections/${item.slug}`)}>{item.title} <ArrowRight size={16} aria-hidden="true" /></Link>)}</div></div>}</section></div></div>
}