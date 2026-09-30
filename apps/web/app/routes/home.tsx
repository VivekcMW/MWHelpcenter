import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined, LayoutGrid, LifeBuoy, Megaphone, Monitor, Target, Users, type LucideIcon } from 'lucide-react'
import { getCatalog } from '../lib/content.server'
import { requireLocale, localePath } from '../i18n/config'
import { createI18n } from '../i18n/instance'
import { SearchForm } from '../components/ui/search-form'

export async function loader({ params }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale)
  return { locale, ...await getCatalog(locale) }
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  const t = createI18n(data?.locale ?? 'en').t
  return [{ title: t('siteTitle') }, { name: 'description', content: t('siteDescription') }]
}

const tasks = [
  { key: 'plan', product: 'planner', icon: Target },
  { key: 'inventory', product: 'inventory', icon: LayoutGrid },
  { key: 'deliver', product: 'influence', icon: Megaphone },
  { key: 'screens', product: 'cms', icon: Monitor },
  { key: 'measure', product: 'measure', icon: ChartNoAxesCombined },
  { key: 'users', product: 'admin-console', icon: Users },
] as const
const icons: Record<string, LucideIcon> = { inventory: LayoutGrid, planner: Target, influence: Megaphone, measure: ChartNoAxesCombined, cms: Monitor, 'admin-console': Users }
const accents: Record<string, 'accent-primary' | 'accent-flow' | 'accent-secondary'> = { inventory: 'accent-primary', planner: 'accent-flow', influence: 'accent-secondary', measure: 'accent-primary', cms: 'accent-flow', 'admin-console': 'accent-secondary' }

export default function Home() {
  const { locale, products } = useLoaderData<typeof loader>()
  const { t } = useTranslation()
  return <>
    <section className="hero"><div className="hero-orbit" aria-hidden="true" /><div className="hero-content"><p className="eyebrow"><BookOpen size={16} aria-hidden="true" />{t('eyebrow')}</p><h1>{t('heroTitle')}</h1><p className="hero-description">{t('heroDescription')}</p><SearchForm locale={locale} /></div></section>
    <div className="page-container home-content">
      <section className="section"><div className="section-heading"><h2>{t('tasksTitle')}</h2><span>{t('tasksDescription')}</span></div><div className="task-grid">{tasks.filter((task) => products.some((product) => product.slug === task.product)).map((task) => <Link key={task.key} className="task-card" to={localePath(locale, `products/${task.product}`)}><task.icon className="task-icon" size={20} aria-hidden="true" />{t(`tasks.${task.key}`)}<ArrowRight className="task-arrow" size={16} aria-hidden="true" /></Link>)}</div></section>
      <section className="section" id="products"><div className="section-heading"><h2>{t('productsTitle')}</h2><span>{t('productsDescription')}</span></div><div className="product-grid">{products.map((product) => {
        const Icon = icons[product.slug] ?? LayoutGrid
        return <Link key={product._id} className="product-card" to={localePath(locale, `products/${encodeURIComponent(product.slug)}`)}><div className="product-card-top"><span className={`product-icon ${accents[product.slug] ?? 'accent-primary'}`} aria-hidden="true"><Icon size={22} aria-hidden="true" /></span><ArrowUpRight className="card-arrow" size={22} aria-hidden="true" /></div><h3>{product.title}</h3><p>{product.description}</p><span className="text-link">{t('exploreGuides')} <ArrowRight size={16} aria-hidden="true" /></span></Link>
      })}</div>{!products.length && <p>{t('empty')}</p>}</section>
      <section className="section"><div className="section-heading"><h2>{t('resourcesTitle')}</h2></div><div className="resource-grid"><div className="resource-panel"><BookOpen className="resource-symbol" size={22} aria-hidden="true" /><div><h3>{t('newHere')}</h3><p>{t('newHereDescription')}</p><Link className="text-link" to={localePath(locale, 'collections/getting-started')}>{t('startLearning')} <ArrowRight size={16} aria-hidden="true" /></Link></div></div><div className="resource-panel"><LifeBuoy className="resource-symbol" size={22} aria-hidden="true" /><div><h3>{t('stuckTitle')}</h3><p>{t('stuckDescription')}</p><Link className="text-link" to={`${localePath(locale, 'search')}?q=${encodeURIComponent(t('troubleshootingQuery'))}`}>{t('troubleshooting')} <ArrowRight size={16} aria-hidden="true" /></Link></div></div></div></section>
    </div>
  </>
}