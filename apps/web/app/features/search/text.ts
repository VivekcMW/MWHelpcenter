import type { Locale } from '../../i18n/config'

export const MAX_QUERY_LENGTH = 200
export const MAX_SNIPPET_LENGTH = 240

export function normalize(value: string, locale: Locale) {
  // Do not remove meaningful Japanese dakuten.
  return (locale === 'ja' ? value.normalize('NFKC') : value.normalize('NFKD').replace(/\p{M}/gu, '')).toLocaleLowerCase(locale)
}

export function queryTerms(query: string, locale: Locale) {
  if (query.length > MAX_QUERY_LENGTH) return []
  const value = normalize(query.trim(), locale)
  return [...new Set(locale === 'ja'
    ? [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(value)].filter((part) => part.isWordLike).map((part) => part.segment)
    : value.split(/\s+/).filter(Boolean))]
}

// Map normalized UTF-16 offsets back to complete original graphemes, including
// decomposed accents, compatibility characters and half-width voiced kana.
export function matchRanges(text: string, terms: readonly string[], locale: Locale, firstOnly = false) {
  const offsets: Array<{ start: number; end: number }> = []
  // Match the ranker's whole-text casing (e.g. Greek final sigma). In these
  // locales contextual casing preserves the per-grapheme UTF-16 lengths.
  const normalized = normalize(text, locale)
  for (const { segment, index } of new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(text)) {
    const folded = normalize(segment, locale)
    for (const character of folded) {
      const offset = { start: index, end: index + segment.length }
      offsets.push(offset)
      // String.indexOf uses UTF-16 units; astral code points occupy two.
      if (character.length === 2) offsets.push(offset)
    }
  }
  const ranges: Array<{ start: number; end: number }> = []
  for (const term of terms) {
    if (!term) continue
    let index = normalized.indexOf(term)
    while (index !== -1) {
      ranges.push({ start: offsets[index].start, end: offsets[index + term.length - 1].end })
      if (firstOnly) break
      index = normalized.indexOf(term, index + term.length)
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  if (firstOnly) return ranges.slice(0, 1)
  return ranges.reduce<typeof ranges>((merged, range) => {
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
    return merged
  }, [])
}

export function visibleBodyText(body: unknown): string {
  if (!Array.isArray(body)) return ''
  const string = (value: unknown) => typeof value === 'string' ? value : ''
  const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
  return body.flatMap((value) => {
    const block = object(value)
    switch (block._type) {
      case 'block': return [array(block.children).map((child) => {
        const span = object(child)
        return span._type === 'span' ? string(span.text) : ''
      }).join('')]
      case 'callout': return [string(block.title), string(block.text)]
      case 'codeBlock': return [string(block.code)]
      case 'procedure': return [string(block.title), ...array(block.steps).flatMap((step) => {
        const item = object(step)
        return [string(item.title), string(item.description)]
      })]
      case 'simpleTable': return [string(block.caption), ...array(block.columns).map(string), ...array(block.rows).flatMap((row) => array(object(row).cells).map(string))]
      case 'imageWithCaption': return [string(block.caption)]
      default: return []
    }
  }).filter(Boolean).join('\n')
}

export function bodySnippet(text: string, terms: string[], locale: Locale) {
  const visible = text.replace(/\s+/gu, ' ').trim()
  const first = matchRanges(visible, terms, locale, true)[0]
  if (!first) return undefined
  const budget = MAX_SNIPPET_LENGTH - 2
  const matchLength = first.end - first.start
  if (matchLength > budget) return undefined
  const desiredStart = Math.max(0, first.start - Math.min(60, budget - matchLength))
  // Reserve space for ellipses and never split a grapheme at either edge.
  let start: number | undefined
  let end = 0
  for (const part of new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(visible)) {
    if (part.index < desiredStart) continue
    start ??= part.index
    if (part.index + part.segment.length > start + budget) break
    end = part.index + part.segment.length
  }
  if (start === undefined || end < first.end) return undefined
  return `${start ? '…' : ''}${visible.slice(start, end)}${end < visible.length ? '…' : ''}`
}