import type { ArticleSummary } from '@mw/content'
import type { Locale } from '../../i18n/config'
import { bodySnippet, normalize, queryTerms, visibleBodyText } from './text'

export type SearchArticle = ArticleSummary & { body?: unknown }
export type SearchResult = ArticleSummary & { snippet?: string; highlightTerms: string[]; typo: boolean }

const MAX_FUZZY_TERMS = 8
const MAX_FUZZY_WORDS = 2048
const MAX_FUZZY_WORD_LENGTH = 32

function fuzzyEligible(word: string) {
  return word.length >= 5 && word.length <= MAX_FUZZY_WORD_LENGTH && /^[a-z]+$/.test(word)
}

// Linear, constant-space Levenshtein distance <= 1 (no unbounded DP matrix).
export function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length >= b.length) i++
    if (b.length >= a.length) j++
  }
  return edits + Number(i < a.length || j < b.length) <= 1
}

function fuzzyWords(fields: string[]) {
  const words: Array<{ word: string; field: number }> = []
  for (const [field, text] of fields.entries()) {
    // Keep identifiers and mixed-script words intact: only complete ASCII
    // words may qualify, never an English-looking fragment within a token.
    for (const match of text.matchAll(/[\p{L}\p{M}\p{N}\p{Pc}]+/gu)) {
      // Count all words, but never retain oversized tokens for fuzzy work.
      words.push({ word: match[0].length <= MAX_FUZZY_WORD_LENGTH ? match[0] : '', field })
      if (words.length >= MAX_FUZZY_WORDS) return words
    }
  }
  return words
}

function scoreTerms(fields: string[], terms: string[], locale: Locale) {
  const base = terms.length + 1
  const weights = [base * base, base, 1]
  let words: ReturnType<typeof fuzzyWords> | undefined
  let score = 0
  let typos = 0
  const matches: string[] = []
  for (const term of terms) {
    let field = fields.findIndex((text) => text.includes(term))
    let matched = term
    if (field === -1 && locale === 'en' && terms.length <= MAX_FUZZY_TERMS && fuzzyEligible(term)) {
      words ??= fuzzyWords(fields)
      const candidate = words.find(({ word }) => fuzzyEligible(word) && withinOneEdit(term, word))
      if (candidate) { field = candidate.field; matched = candidate.word; typos++ }
    }
    if (field === -1) return { score: 0, typos, matches }
    matches.push(matched)
    score += weights[field]
  }
  return { score, typos, matches }
}

function ranked<T extends SearchArticle>(articles: T[], query: string, product: string, locale: Locale, includeBody: boolean) {
  const terms = queryTerms(query, locale)
  if (!terms.length) return []
  const collator = new Intl.Collator(locale)
  return articles.filter((article) => article.language === locale && !/^(drafts|versions)\./.test(article._id) && (!product || article.productSlugs.includes(product)))
    .map((article) => {
      const body = includeBody ? visibleBodyText(article.body) : ''
      const fields = [article.title, article.summary, body].map((text) => normalize(text, locale))
      return { article, body, ...scoreTerms(fields, terms, locale) }
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => a.typos - b.typos || b.score - a.score || collator.compare(a.article.title, b.article.title))
}

// Preserve summary-only public defaults, arguments and original article objects.
export function rankArticles<T extends ArticleSummary>(articles: T[], query: string, product = '', locale: Locale = 'en'): T[] {
  return ranked(articles, query, product, locale, false).map(({ article }) => article)
}

// Explicit response whitelist: never spread a CMS document into loader data.
export function searchArticles(articles: SearchArticle[], query: string, product = '', locale: Locale = 'en'): SearchResult[] {
  return ranked(articles, query, product, locale, true).map(({ article, matches, typos, body }) => ({
    _id: article._id, title: article.title, slug: article.slug, summary: article.summary,
    language: article.language, productSlugs: article.productSlugs,
    collectionSlug: article.collectionSlug, contentType: article.contentType, reviewedAt: article.reviewedAt,
    snippet: bodySnippet(body, matches, locale), highlightTerms: matches, typo: typos > 0,
  }))
}