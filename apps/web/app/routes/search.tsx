import { Form, Link, useLoaderData, useNavigation, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useTranslation } from 'react-i18next'
import { localePath, requireLocale } from '../i18n/config'
import { getCatalog, getSearchCatalog } from '../lib/content.server'
import { searchArticles } from '../features/search/rank'
import { MAX_QUERY_LENGTH, queryTerms } from '../features/search/text'
import { SearchForm } from '../components/ui/search-form'
import { ArticleList } from '../components/ui/article-list'
import { createI18n } from '../i18n/instance'
import { ResultsSkeleton } from '../components/ui/loading-feedback'
import { Spinner } from '../components/ui/spinner'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale)
  const url = new URL(request.url)
  const rawQuery = url.searchParams.get('q') ?? ''
  const query = rawQuery.trim()
  const product = url.searchParams.get('product') ?? ''
  const tooLong = rawQuery.length > MAX_QUERY_LENGTH
  const searchable = !tooLong && queryTerms(query, locale).length > 0
  const { products, collections, articles } = await (searchable ? getSearchCatalog(locale) : getCatalog(locale))
  const gettingStartedPath = collections.some((item) => item.language === locale && item.slug === 'getting-started')
    ? localePath(locale, 'collections/getting-started') : localePath(locale)
  const results = searchable ? searchArticles(articles, query, product, locale) : []
  return { locale, query: query.slice(0, MAX_QUERY_LENGTH + 1), product, products, results, tooLong, gettingStartedPath, typoUsed: results.some((item) => item.typo) }
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => [{ title: `${createI18n(data?.locale ?? 'en').t('title', { ns: 'search' })} | Moving Walls` }]

export default function SearchPage() {
  const { locale, query, product, products, results, tooLong, gettingStartedPath, typoUsed } = useLoaderData<typeof loader>()
  const { t } = useTranslation('search')
  const { t: feedback } = useTranslation('feedback')
  const navigation = useNavigation()
  const pending = navigation.state !== 'idle' && navigation.location?.pathname === localePath(locale, 'search')
  const activeProduct = products.find((p) => p.slug === product)
  let content = <ArticleList articles={results} locale={locale} search />
  if (tooLong) content = <p className="mw-inline-error">{t('tooLong')}</p>
  else if (query && !results.length) content = <div className="empty-state"><p>{t('noResults')}</p><ul>
    {product && <li><Link to={`${localePath(locale, 'search')}?${new URLSearchParams({ q: query })}`}>{t('clearProduct')}</Link></li>}
    <li><Link to={gettingStartedPath}>{t('gettingStarted')}</Link></li>
    <li><Link to={localePath(locale, 'support')}>{t('support')}</Link></li>
  </ul></div>
  if (pending) content = <ResultsSkeleton />
  let heading = query ? t('queryLabel', { query }) : t('emptyQuery')
  if (pending) heading = feedback('searching')
  return <div className="page-container inner-page narrow">
    <div className="page-heading"><h1>{t('title')}</h1><p>{t('description')}</p></div>
    <SearchForm locale={locale} query={query} product={product} />
    <Form className="filter-form">
      <input type="hidden" name="q" value={query} />
      <label htmlFor="product-filter">{t('productLabel')}</label>
      <div className="filter-wrapper">
        <select key={product} id="product-filter" name="product" defaultValue={product}><option value="">{t('allProducts')}</option>{products.map((item) => <option key={item._id} value={item.slug}>{item.title}</option>)}</select>
        <button className="button button-outline" type="submit" aria-busy={pending}>{t('submit')}<span className="filter-spinner-slot" aria-hidden="true">{pending && <Spinner />}</span></button>
      </div>
      {activeProduct && (
        <div className="filter-badge" role="status" aria-live="polite">
          {t('filterActive')} <strong>{activeProduct.title}</strong>
          <Link className="filter-clear" to={`${localePath(locale, 'search')}?${new URLSearchParams({ q: query })}`} aria-label={t('clearFilter')}>×</Link>
        </div>
      )}
    </Form>
    <section aria-live="polite" aria-busy={pending}>
      <div className="section-heading"><h2>{heading}</h2>{query && !pending && <span>{t('resultCount', { count: results.length })}</span>}</div>
      {!pending && typoUsed && <p>{t('typoNotice')}</p>}
      {content}
    </section>
  </div>
}