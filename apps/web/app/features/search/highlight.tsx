import { Fragment } from 'react'
import type { Locale } from '../../i18n/config'
import { matchRanges } from './text'

type HighlightProps = { readonly text: string; readonly terms: readonly string[]; readonly locale: Locale }

export function Highlight({ text, terms, locale }: HighlightProps) {
  const ranges = matchRanges(text, terms, locale)
  let end = 0
  return <>{ranges.map((range) => {
    const before = text.slice(end, range.start)
    end = range.end
    return <Fragment key={range.start}>{before}<mark>{text.slice(range.start, range.end)}</mark></Fragment>
  })}{text.slice(end)}</>
}