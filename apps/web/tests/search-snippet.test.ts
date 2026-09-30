import { describe, expect, it } from 'vitest'
import { bodySnippet, matchRanges, MAX_SNIPPET_LENGTH } from '../app/features/search/text'

describe('snippet Unicode and length boundaries', () => {
  it.each(['en', 'ja'] as const)('uses whole-text contextual lowercasing for %s ranges and snippets', (locale) => {
    expect(matchRanges('An ΟΣ example', ['ος'], locale)).toEqual([{ start: 3, end: 5 }])
    expect(bodySnippet('An ΟΣ example', ['ος'], locale)).toBe('An ΟΣ example')
  })

  it('maps astral characters and compatibility expansions back to complete graphemes', () => {
    expect(matchRanges('A 𠮷 👩🏽‍💻 ﬃ Z', ['𠮷', '👩🏽‍💻', 'ffi'], 'en')
      .map(({ start, end }) => 'A 𠮷 👩🏽‍💻 ﬃ Z'.slice(start, end))).toEqual(['𠮷', '👩🏽‍💻', 'ﬃ'])
    expect(matchRanges('ﬃ', ['f', 'fi'], 'en')).toEqual([{ start: 0, end: 1 }])
  })

  it('preserves an entire maximum-length search term rather than clipping its end', () => {
    const term = 'x'.repeat(200)
    const snippet = bodySnippet(`${'before '.repeat(100)}${term}${' after'.repeat(100)}`, [term], 'en')!
    expect(snippet).toContain(term)
    expect(snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_LENGTH)
    expect(matchRanges(snippet, [term], 'en')).toHaveLength(1)
  })

  it('caps even huge combining-character graphemes without slicing one in half', () => {
    const giantGrapheme = `a${'\u0301'.repeat(500)}`
    expect(bodySnippet(giantGrapheme, ['a'], 'en')).toBeUndefined()
    const snippet = bodySnippet(`${giantGrapheme} needle`, ['needle'], 'en')!
    expect(snippet).toContain('needle')
    expect(snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_LENGTH)
    expect(snippet).not.toContain('\u0301')
  })

  it('does not split emoji or decomposed accents at snippet edges', () => {
    const snippet = bodySnippet(`${'👨‍👩‍👧‍👦'.repeat(30)} cafe\u0301 ${'👩🏽‍💻'.repeat(50)}`, ['cafe'], 'en')!
    expect(snippet).toContain('cafe\u0301')
    expect(snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_LENGTH)
    expect(snippet).not.toMatch(/\u200d…$/u)
    expect(snippet).not.toMatch(/^…\u200d/u)
    expect(matchRanges(snippet, ['cafe'], 'en').map(({ start, end }) => snippet.slice(start, end))).toEqual(['cafe\u0301'])
  })

  it('uses the first occurrence rather than merging adjacent matches into an oversized snippet', () => {
    const snippet = bodySnippet('a'.repeat(2000), ['a'], 'en')!
    expect(snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_LENGTH)
    expect(snippet).toContain('aaa')
    expect(snippet.endsWith('…')).toBe(true)
  })
})