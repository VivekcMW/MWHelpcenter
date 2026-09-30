import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, FileText } from 'lucide-react'
import type { ArticleSummary } from '@mw/content'
import { localePath, type Locale } from '../../i18n/config'
import { Highlight } from '../../features/search/highlight'
import type { SearchResult } from '../../features/search/rank'

export function ArticleList({ articles, locale, search = false }: Readonly<{ articles: Array<ArticleSummary & Partial<Pick<SearchResult, 'snippet' | 'highlightTerms' | 'typo'>>>; locale: Locale; search?: boolean }>) {
  const { t } = useTranslation()
  if (!articles.length) return <p className="empty-state">{t('empty')}</p>
  return <div className="article-list">{articles.map((article) => <Link className="article-row" key={article._id} to={localePath(locale, `articles/${encodeURIComponent(article.slug)}`)}>
    <FileText className="document-icon" size={22} aria-hidden="true" /><div><span className="tag">{t(`contentType.${article.contentType}`, { defaultValue: article.contentType })}</span>
      <h3>{search ? <Highlight text={article.title} terms={article.highlightTerms ?? []} locale={locale} /> : article.title}</h3>
      <p>{search ? <Highlight text={article.summary} terms={article.highlightTerms ?? []} locale={locale} /> : article.summary}</p>
      {search && article.snippet && <p><Highlight text={article.snippet} terms={article.highlightTerms ?? []} locale={locale} /></p>}
      {search && article.typo && <span className="tag">{t('typoResult', { ns: 'search' })}</span>}
    </div><ArrowUpRight size={18} aria-hidden="true" />
  </Link>)}</div>
}