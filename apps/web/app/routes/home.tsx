import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined, LayoutGrid, LifeBuoy, Megaphone, Monitor, Target, Users, type LucideIcon } from 'lucide-react'
import { getCatalog, getHomePage } from '../lib/content.server'
import { requireLocale, localePath } from '../i18n/config'
import { createI18n } from '../i18n/instance'
import { SearchForm } from '../components/ui/search-form'
import { ArticleList } from '../components/ui/article-list'

export async function loader({ params }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale)
  const [catalog, homePage] = await Promise.all([getCatalog(locale), getHomePage(locale)])
  return {locale, ...catalog, homePage}
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  const t = createI18n(data?.locale ?? 'en').t
  return [
    {title: data?.homePage?.seo?.title || t('siteTitle')},
    {name: 'description', content: data?.homePage?.seo?.description || data?.homePage?.heroDescription || t('siteDescription')},
  ]
}

const tasks = [
  { key: 'plan', product: 'planner', icon: Target },
  { key: 'inventory', product: 'inventory', icon: LayoutGrid },
  { key: 'deliver', product: 'influence', icon: Megaphone },
  { key: 'screens', product: 'cms', icon: Monitor },
  { key: 'measure', product: 'measure', icon: ChartNoAxesCombined },
  { key: 'users', product: 'admin-console', icon: Users },
] as const
const icons: Record<string, LucideIcon> = { box: LayoutGrid, calendar: Target, megaphone: Megaphone, monitor: Monitor, chart: ChartNoAxesCombined, settings: Users, signage: Monitor }
const accents: Record<string, 'accent-primary' | 'accent-flow' | 'accent-secondary'> = { inventory: 'accent-primary', planner: 'accent-flow', influence: 'accent-secondary', measure: 'accent-primary', cms: 'accent-flow', 'admin-console': 'accent-secondary' }

export default function Home() {
  const {locale, products, collections, articles, homePage} = useLoaderData<typeof loader>()
  const { t } = useTranslation()
  const taskLinks = homePage
    ? homePage.taskShortcuts.flatMap((shortcut) => {
      const product = products.find((item) => item.slug === shortcut.productSlug)
      return product ? [{key: shortcut._key, label: shortcut.label, product: product.slug, icon: icons[product.icon] ?? LayoutGrid}] : []
    })
    : tasks.filter((task) => products.some((product) => product.slug === task.product)).map((task) => ({...task, label: t(`tasks.${task.key}`)}))
  const featuredProducts = homePage?.featuredProductSlugs.length
    ? homePage.featuredProductSlugs.flatMap((slug) => products.filter((product) => product.slug === slug))
    : products
  const featuredCollections = homePage?.featuredCollectionSlugs.flatMap((slug) => collections.filter((collection) => collection.slug === slug)) ?? []
  const featuredArticles = homePage?.featuredArticleSlugs.flatMap((slug) => articles.filter((article) => article.slug === slug)) ?? []
  const resources = homePage
    ? homePage.resources.map((resource) => ({
      ...resource,
      icon: resource.icon === 'book' ? BookOpen : LifeBuoy,
      href: resource.collectionSlug
        ? localePath(locale, `collections/${resource.collectionSlug}`)
        : `${localePath(locale, 'search')}?q=${encodeURIComponent(resource.searchQuery || '')}`,
    }))
    : null
  return <>
    <section className="hero"><div className="hero-orbit" aria-hidden="true" /><div className="hero-content"><p className="eyebrow"><BookOpen size={16} aria-hidden="true" />{homePage?.eyebrow || t('eyebrow')}</p><h1>{homePage?.heroTitle || t('heroTitle')}</h1><p className="hero-description">{homePage?.heroDescription || t('heroDescription')}</p><SearchForm locale={locale} /></div></section>
    <div className="page-container home-content">
      <section className="section"><div className="section-heading"><h2>{homePage?.tasksTitle || t('tasksTitle')}</h2><span>{homePage?.tasksDescription || t('tasksDescription')}</span></div><div className="task-grid">{taskLinks.map((task) => {const Icon = task.icon; return <Link key={task.key} className="task-card" to={localePath(locale, `products/${task.product}`)}><Icon className="task-icon" size={20} aria-hidden="true" />{task.label}<ArrowRight className="task-arrow" size={16} aria-hidden="true" /></Link>})}</div></section>
      <section className="section" id="products"><div className="section-heading"><h2>{homePage?.productsTitle || t('productsTitle')}</h2><span>{homePage?.productsDescription || t('productsDescription')}</span></div><div className="product-grid">{featuredProducts.map((product) => {
        const Icon = icons[product.icon] ?? LayoutGrid
        return <Link key={product._id} className="product-card" to={localePath(locale, `products/${encodeURIComponent(product.slug)}`)}><div className="product-card-top"><span className={`product-icon ${accents[product.slug] ?? 'accent-primary'}`} aria-hidden="true"><Icon size={22} aria-hidden="true" /></span><ArrowUpRight className="card-arrow" size={22} aria-hidden="true" /></div><h3>{product.title}</h3><p>{product.description}</p><span className="text-link">{t('exploreGuides')} <ArrowRight size={16} aria-hidden="true" /></span></Link>
      })}</div>{!featuredProducts.length && <p>{t('empty')}</p>}</section>
      {featuredCollections.length > 0 && <section className="section"><div className="section-heading"><h2>{homePage?.collectionsTitle || t('topics')}</h2></div><div className="topic-links">{featuredCollections.map((collection) => <Link key={collection._id} to={localePath(locale, `collections/${collection.slug}`)}>{collection.title} <ArrowRight size={16} aria-hidden="true" /></Link>)}</div></section>}
      {featuredArticles.length > 0 && <section className="section"><div className="section-heading"><h2>{homePage?.featuredArticlesTitle || t('nextSteps')}</h2></div><ArticleList articles={featuredArticles} locale={locale} /></section>}
      <section className="section"><div className="section-heading"><h2>{homePage?.resourcesTitle || t('resourcesTitle')}</h2></div><div className="resource-grid">{resources ? resources.map((resource) => {const Icon = resource.icon; return <div className="resource-panel" key={resource._key}><Icon className="resource-symbol" size={22} aria-hidden="true" /><div><h3>{resource.title}</h3><p>{resource.description}</p><Link className="text-link" to={resource.href}>{resource.linkLabel} <ArrowRight size={16} aria-hidden="true" /></Link></div></div>}) : <><div className="resource-panel"><BookOpen className="resource-symbol" size={22} aria-hidden="true" /><div><h3>{t('newHere')}</h3><p>{t('newHereDescription')}</p><Link className="text-link" to={localePath(locale, 'collections/getting-started')}>{t('startLearning')} <ArrowRight size={16} aria-hidden="true" /></Link></div></div><div className="resource-panel"><LifeBuoy className="resource-symbol" size={22} aria-hidden="true" /><div><h3>{t('stuckTitle')}</h3><p>{t('stuckDescription')}</p><Link className="text-link" to={`${localePath(locale, 'search')}?q=${encodeURIComponent(t('troubleshootingQuery'))}`}>{t('troubleshooting')} <ArrowRight size={16} aria-hidden="true" /></Link></div></div></>}</div></section>
    </div>
  </>
}