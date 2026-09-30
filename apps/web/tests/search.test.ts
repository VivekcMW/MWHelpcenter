import { describe, expect, it } from 'vitest'
import { articles, japaneseArticles } from '@mw/content/fixtures'
import { rankArticles, searchArticles, withinOneEdit, type SearchArticle } from '../app/features/search/rank'
import { bodySnippet, matchRanges, MAX_SNIPPET_LENGTH, queryTerms, visibleBodyText } from '../app/features/search/text'

describe('published summary search', () => {
  it('finds title and summary matches case insensitively', () => {
    expect(rankArticles(articles, 'INVENTORY')).toContainEqual(expect.objectContaining({ slug: 'import-inventories' }))
    expect(rankArticles(articles, 'identifiers')[0].slug).toBe('import-inventories')
  })
  it('requires all query terms and applies product scope', () => {
    expect(rankArticles(articles, 'inventory missingword')).toEqual([])
    expect(rankArticles(articles, 'inventory', 'cms')).toEqual([])
    expect(rankArticles(articles, 'inventory', 'inventory').length).toBeGreaterThan(0)
  })
  it('bounds input and handles empty results', () => {
    expect(rankArticles(articles, ' ')).toEqual([])
    expect(rankArticles(articles, 'x'.repeat(201))).toEqual([])
    expect(rankArticles([], 'campaign')).toEqual([])
  })
  it('searches Japanese words and normalizes full/half-width text', () => {
    for (const query of ['インポート', 'ｲﾝﾎﾟｰﾄ', '広告枠 インポート']) {
      expect(rankArticles(japaneseArticles, query, '', 'ja')).toContainEqual(expect.objectContaining({ slug: 'import-inventories' }))
    }
    expect(rankArticles(japaneseArticles, '確認', 'cms', 'ja').map((item) => item.slug)).toEqual(['campaign-delivery-checks', 'getting-started'])
    expect(rankArticles(japaneseArticles, 'インポート', 'cms', 'ja')).toEqual([])
    expect(rankArticles(japaneseArticles, '。！？', '', 'ja')).toEqual([])
  })
  it('preserves Japanese voiced consonants and isolates languages', () => {
    const voiced = { ...japaneseArticles[0], title: 'バス', summary: '' }
    expect(rankArticles([voiced], 'ハス', '', 'ja')).toEqual([])
    expect(rankArticles([voiced], 'ﾊﾞｽ', '', 'ja')).toEqual([voiced])
    expect(rankArticles([...articles, ...japaneseArticles], 'OOH', '', 'ja').every((item) => item.language === 'ja')).toBe(true)
    expect(rankArticles(japaneseArticles, 'OOH')).toEqual([])
  })
})

function document(title = '', summary = '', text = '', extra: Partial<SearchArticle> = {}): SearchArticle {
  return {
    _id: title || 'body-guide', slug: 'guide', title, summary, language: 'en', productSlugs: ['inventory'], contentType: 'guide',
    body: [{ _type: 'block', children: [{ _type: 'span', text }] }], ...extra,
  }
}

describe('full visible-body search', () => {
  const body = [
    { _type: 'block', _key: 'hiddenkey', children: [{ _type: 'span', text: 'inter' }, { _type: 'span', text: 'operability' }, { _type: 'secret', text: 'hiddenspan' }], markDefs: [{ href: 'https://hiddenurl.test', _key: 'hiddenmark' }] },
    { _type: 'callout', title: 'Caution', text: 'Deduplicate', tone: 'hiddentone' },
    { _type: 'procedure', title: 'Onboarding', steps: [{ title: 'Validate', description: 'Coordinates', _key: 'hiddenstep' }] },
    { _type: 'simpleTable', caption: 'Specification', columns: ['Latitude'], rows: [{ cells: ['Longitude'], _key: 'hiddenrow' }] },
    { _type: 'imageWithCaption', caption: 'Illustration', alt: 'hiddenalt', image: { asset: { url: 'https://hiddenasset.test' } } },
    { _type: 'unknown', text: 'hiddenunknown', title: 'hiddentitle' },
  ]

  it.each(['interoperability', 'caution', 'deduplicate', 'onboarding', 'validate', 'coordinates', 'specification', 'latitude', 'longitude', 'illustration'])('finds visible %s', (query) => {
    expect(searchArticles([document('', '', '', { body })], query)).toHaveLength(1)
  })

  it.each(['hiddenkey', 'hiddenspan', 'hiddenurl', 'hiddenmark', 'hiddentone', 'hiddenstep', 'hiddenrow', 'hiddenalt', 'hiddenasset', 'hiddenunknown', 'hiddentitle'])('does not index metadata %s', (query) => {
    expect(searchArticles([document('', '', '', { body })], query)).toEqual([])
  })

  it('handles null/malformed optional values without recursively indexing arbitrary fields', () => {
    expect(visibleBodyText(null)).toBe('')
    expect(visibleBodyText([null, 1, {}, { _type: 'block', children: null }, { _type: 'procedure', steps: [null] }, { _type: 'simpleTable', rows: [{ cells: [null, 4, 'Visible'] }] }])).toBe('Visible')
  })

  it('ranks title above summary above body and requires all terms across fields', () => {
    const records = [document('Body', '', 'calibration'), document('Summary', 'calibration'), document('Calibration')]
    expect(searchArticles(records, 'calibration').map((item) => item.title)).toEqual(['Calibration', 'Summary', 'Body'])
    expect(searchArticles([document('Calibration', 'coordinates', 'latitude')], 'calibration coordinates latitude')).toHaveLength(1)
    expect(searchArticles(records, 'calibration missingword')).toEqual([])
  })

  it('isolates locale/product and excludes draft/version records before matching', () => {
    const records = [document('English', '', 'calibration'), document('Japanese', '', 'calibration', { language: 'ja' }), document('Other', '', 'calibration', { productSlugs: ['cms'] }), document('Draft', '', 'calibration', { _id: 'drafts.guide' }), document('Version', '', 'calibration', { _id: 'versions.release.guide' })]
    expect(searchArticles(records, 'calibration', 'inventory').map((item) => item.title)).toEqual(['English'])
    expect(searchArticles(records, 'calibration', 'inventory', 'ja').map((item) => item.title)).toEqual(['Japanese'])
  })

  it('preserves the legacy summary-only ranker and input identity', () => {
    const item = document('Calibration', '', 'coordinates')
    expect(rankArticles([item], 'coordinates')).toEqual([])
    expect(rankArticles([item], 'calibration')[0]).toBe(item)
    expect(searchArticles([item], 'coordinates')).toHaveLength(1)
  })

  it('keeps generic summary objects intact without mutating input or reading bodies', () => {
    const first = Object.freeze({ ...document('Zulu calibration'), custom: { retained: true } })
    const second = Object.freeze({ ...document('Alpha calibration'), custom: { retained: false }, get body(): never { throw new Error('Summary search must not read body') } })
    const input = [first, second]
    Object.freeze(input)
    const result = rankArticles(input, 'calibration')
    expect(result).toEqual([second, first])
    expect(result[0]).toBe(second)
    expect(result[0].custom.retained).toBe(false)
    expect(input).toEqual([first, second])
  })

  it('orders title counts before summary counts before body counts across multiple terms', () => {
    const records = [document('Body', '', 'alpha bravo charlie'), document('Summary', 'alpha', 'bravo charlie'), document('Alpha', '', 'bravo charlie')]
    expect(searchArticles(records, 'alpha bravo charlie').map((item) => item.title)).toEqual(['Alpha', 'Summary', 'Body'])
    expect(searchArticles(records, 'alpha alpha bravo charlie').map((item) => item.title)).toEqual(['Alpha', 'Summary', 'Body'])
  })

  it('returns only public summary and search presentation fields', () => {
    const source = { ...document('Guide', '', 'needle'), translationGroupId: 'private-group', seo: { title: 'private' }, editorialNotes: 'private' }
    expect(Object.keys(searchArticles([source], 'needle')[0]).sort()).toEqual([
      '_id', 'title', 'slug', 'summary', 'language', 'productSlugs', 'collectionSlug', 'contentType', 'reviewedAt', 'snippet', 'highlightTerms', 'typo',
    ].sort())
  })

  it('caps queries at 200 without dropping all-term requirements', () => {
    const item = document('x'.repeat(200))
    expect(searchArticles([item], 'x'.repeat(200))).toHaveLength(1)
    expect(searchArticles([item], 'x'.repeat(201))).toEqual([])
    expect(searchArticles([item], '')).toEqual([])
  })
})

describe('bounded English typo matching', () => {
  it.each(['inventory2', '2inventory', 'inventory_id', 'inventory日本語', '日本語inventory', 'inventoryя'])('does not fuzzy-match ASCII fragments inside %s', (text) => {
    expect(searchArticles([document(text)], 'inventary')).toEqual([])
    // Exact substring matching remains backwards compatible.
    expect(searchArticles([document(text)], 'inventory')).toHaveLength(1)
  })

  it('still fuzzy-matches whole English words next to punctuation', () => {
    expect(searchArticles([document('“inventory”, (calibration).')], 'inventary calibratien')).toHaveLength(1)
  })

  it.each(['inventary', 'inventry', 'inventorry'])('supports a single edit in %s', (query) => {
    const [result] = searchArticles([document('Inventory')], query)
    expect(result.typo).toBe(true)
    expect(result.highlightTerms).toEqual(['inventory'])
  })

  it('prefers exact body results to fuzzy titles, then ranks fuzzy title/summary/body', () => {
    const records = [document('Inventory'), document('Summary', 'inventory'), document('Body', '', 'inventory'), document('Exact', '', 'inventary')]
    const results = searchArticles(records, 'inventary')
    expect(results.map((item) => item.title)).toEqual(['Exact', 'Inventory', 'Summary', 'Body'])
    expect(results.map((item) => item.typo)).toEqual([false, true, true, true])
  })

  it('does not allow two edits, short terms, non-Latin terms or Japanese typos', () => {
    expect(searchArticles([document('Inventory')], 'invantary')).toEqual([])
    expect(searchArticles([document('Help')], 'halp')).toEqual([])
    expect(searchArticles([document('商品について')], '商品についと')).toEqual([])
    expect(searchArticles([document('Inventory', '', '', { language: 'ja' })], 'inventary', '', 'ja')).toEqual([])
  })

  it('bounds fuzzy word length, query term count and candidate count without truncating exact body search', () => {
    expect(searchArticles([document('a'.repeat(33))], `${'a'.repeat(32)}b`)).toEqual([])
    const terms = 'alpha bravo charlie delta echo foxtrot golf hotel'
    expect(searchArticles([document(`${terms} inventory`)], `${terms} inventary`)).toEqual([])
    expect(searchArticles([document(`${terms} inventory`)], `${terms} inventory`)).toHaveLength(1)
    const item = document('', '', `${'word '.repeat(2048)}inventory`)
    expect(searchArticles([item], 'inventary')).toEqual([])
    expect(searchArticles([item], 'inventory')).toHaveLength(1)
    expect(searchArticles([document('', '', 'inventory extra')], 'inventary missingword')).toEqual([])
  })

  it('includes the last eligible term, word length and candidate at each fuzzy limit', () => {
    expect(searchArticles([document('apple')], 'appla')).toHaveLength(1)
    expect(searchArticles([document('a'.repeat(32))], `${'a'.repeat(31)}b`)).toHaveLength(1)
    const terms = 'alpha bravo charlie delta echo foxtrot golf'
    expect(searchArticles([document(`${terms} inventory`)], `${terms} inventary`)).toHaveLength(1)
    expect(searchArticles([document('', '', `${'word '.repeat(2047)}inventory`)], 'inventary')).toHaveLength(1)
  })

  it('agrees with a reference edit-distance calculation, including empty strings', () => {
    const words = ['']
    for (let length = 1; length <= 4; length++) {
      words.push(...words.filter((word) => word.length === length - 1).flatMap((word) => [`${word}a`, `${word}b`]))
    }
    for (const a of words) for (const b of words) {
      const distance = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0))
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
        distance[i][j] = Math.min(distance[i - 1][j] + 1, distance[i][j - 1] + 1, distance[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]))
      }
      expect(withinOneEdit(a, b), `${JSON.stringify(a)} / ${JSON.stringify(b)}`).toBe(distance[a.length][b.length] <= 1)
    }
  })

  it.each([
    ['abcde', 'abcde', true], ['abcde', 'xbcde', true], ['abcde', 'abcdf', true],
    ['abcde', 'abcd', true], ['abcde', 'abcdef', true], ['abcde', 'abde', true],
    ['abcde', 'abxcde', true], ['abcde', 'abxde', true], ['abcde', 'abxxe', false],
    ['abcde', 'abc', false], ['abcde', 'acbde', false],
  ])('distance-one check %s / %s', (a, b, expected) => {
    expect(withinOneEdit(a, b)).toBe(expected)
    expect(withinOneEdit(b, a)).toBe(expected)
  })
})

describe('localized snippets and safe highlight ranges', () => {
  it.each(['café', 'cafe\u0301', 'ＣＡＦÉ'])('maps cafe back to original graphemes in %s', (text) => {
    expect(matchRanges(`A ${text}!`, ['cafe'], 'en')).toEqual([{ start: 2, end: 2 + text.length }])
  })

  it('preserves Japanese dakuten, segmentation and full/half-width equivalence in body search', () => {
    const item = document('', '', '広告枠のインポートとバス', { language: 'ja' })
    expect(searchArticles([item], '広告枠 ｲﾝﾎﾟｰﾄ', '', 'ja')).toHaveLength(1)
    expect(searchArticles([item], 'ハス', '', 'ja')).toEqual([])
    expect(searchArticles([item], '。！？', '', 'ja')).toEqual([])
    expect(matchRanges('ﾊﾞｽ', queryTerms('バス', 'ja'), 'ja')).toEqual([{ start: 0, end: 3 }])
  })

  it('merges overlapping matches and retains original text', () => {
    expect(matchRanges('Inventory inventory', ['inventory', 'vent'], 'en')).toEqual([{ start: 0, end: 9 }, { start: 10, end: 19 }])
  })

  it('finds late matches, bounds snippets, and never returns full bodies or extra metadata', () => {
    const text = `${'prefix '.repeat(1000)}Café calibration ${'suffix '.repeat(1000)}`
    const source = { ...document('Guide', 'Summary', text), seo: { title: 'private' }, secret: 'private' }
    const [result] = searchArticles([source], 'cafe')
    expect(result.snippet).toContain('Café')
    expect(result.snippet?.startsWith('…')).toBe(true)
    expect(result.snippet?.endsWith('…')).toBe(true)
    expect(result.snippet!.length).toBeLessThanOrEqual(MAX_SNIPPET_LENGTH)
    expect(result).not.toHaveProperty('body')
    expect(result).not.toHaveProperty('seo')
    expect(result).not.toHaveProperty('secret')
    expect(JSON.stringify(result)).not.toContain('prefix '.repeat(100))
    expect(bodySnippet('No body match', ['absent'], 'en')).toBeUndefined()
  })
})