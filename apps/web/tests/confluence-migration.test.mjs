import {describe, expect, it} from 'vitest'
import {buildDocuments, buildDraftDocuments, classifyPages, parseConfluenceBody, preparePublishedDocument, slugify} from '../scripts/migrate-confluence.mjs'

describe('Confluence migration transformation', () => {
  it('maps headings, formatted paragraphs, lists, and nested tables to supported blocks', () => {
    const source = `<h1>Inventory setup</h1>
      <p>Use <strong>care</strong> and <a href="https://example.com/help">this guide</a>.</p>
      <ol><li>Open settings</li><li>Save changes</li></ol>
      <table><tbody><tr><th>Field</th><th>Value</th></tr><tr><td>Name</td><td>Demo</td></tr></tbody></table>`

    const result = parseConfluenceBody(source, {pageId: '100', pageTitle: 'Inventory setup'})

    expect(result.warnings).toEqual([])
    expect(result.body.map((block) => block._type)).toEqual(['block', 'block', 'block', 'block', 'simpleTable'])
    expect(result.body[0].style).toBe('h2')
    expect(result.body[1].children.some((span) => span.marks.includes('strong'))).toBe(true)
    expect(result.body[1].markDefs[0].href).toBe('https://example.com/help')
    expect(result.body[2].listItem).toBe('number')
    expect(result.body[4].columns).toEqual(['Field', 'Value'])
    expect(result.body[4].rows[0].cells).toEqual(['Name', 'Demo'])
  })

  it('decodes HTML entities consistently in body text, table cells, and summaries', () => {
    const html = '<p>Media &mdash; then save &amp; close.</p><table><tr><th>Mode</th><th>Action</th></tr><tr><td>Read &amp; write</td><td>Save &mdash; continue</td></tr></table>'
    const parsed = parseConfluenceBody(html, {pageId: '101', pageTitle: 'Entity handling'})
    const snapshot = {pages: [
      {id: 'cms-root', title: 'CMS', ancestors: [{id: 'help-center', title: 'Help Center'}]},
      {id: '101', title: 'Entity handling', storageHtml: html, ancestors: [{id: 'help-center', title: 'Help Center'}, {id: 'cms-root', title: 'CMS'}]},
    ]}
    const article = buildDocuments(snapshot).articles[0]

    expect(parsed.body[0].children[0].text).toBe('Media — then save & close.')
    expect(parsed.body[1].rows[0].cells).toEqual(['Read & write', 'Save — continue'])
    expect(article.summary).toContain('Media — then save & close.')
    expect(JSON.stringify(parsed.body)).not.toContain('&mdash;')
  })

  it('uploads a referenced Confluence image as the supported imageWithCaption member', () => {
    const source = '<ac:image ac:alt="Dashboard screenshot"><ri:attachment ri:filename="dashboard.png"/></ac:image>'
    const result = parseConfluenceBody(source, {
      pageId: '200',
      pageTitle: 'Dashboard',
      attachments: [{id: 'att-1', title: 'dashboard.png'}],
      assetIds: new Map([['att-1', 'image-asset-id']]),
    })

    expect(result.warnings).toEqual([])
    expect(result.body).toHaveLength(1)
    expect(result.body[0]).toMatchObject({
      _type: 'imageWithCaption',
      alt: 'Dashboard screenshot',
      image: {asset: {_ref: 'image-asset-id'}},
    })
  })

  it('converts code and info macros while omitting the redundant legacy table of contents', () => {
    const source = `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">bash</ac:parameter><ac:plain-text-body><![CDATA[echo "&mdash;"
ls -la]]></ac:plain-text-body></ac:structured-macro><ac:structured-macro ac:name="info"><ac:rich-text-body><p>Helpful &mdash; note</p></ac:rich-text-body></ac:structured-macro><ac:structured-macro ac:name="toc"><ac:parameter ac:name="maxLevel">3</ac:parameter></ac:structured-macro>`
    const result = parseConfluenceBody(source, {pageId: '202', pageTitle: 'Macro handling'})

    expect(result.warnings).toEqual([])
    expect(result.body).toEqual([
      {_key: 'code1', _type: 'codeBlock', language: 'bash', code: 'echo "&mdash;"\nls -la'},
      {_key: 'c2', _type: 'callout', tone: 'info', title: 'Information', text: 'Helpful — note'},
    ])
  })

  it('preserves headerless FAQ tables instead of dropping their only row', () => {
    const faq = parseConfluenceBody('<table><tr><td>How do I begin?</td><td>Open the dashboard.</td></tr></table>', {pageId: '203', pageTitle: 'Measure Platform FAQ'})
    const layout = parseConfluenceBody('<table><tr><td>Dashboard overview</td></tr></table>', {pageId: '204', pageTitle: 'Dashboard overview'})

    expect(faq.warnings).toEqual([])
    expect(faq.body[0]).toMatchObject({_type: 'simpleTable', columns: ['Question', 'Answer'], rows: [{cells: ['How do I begin?', 'Open the dashboard.']}]})
    expect(layout.warnings).toEqual([])
    expect(layout.body[0].children[0].text).toBe('Dashboard overview')
  })

  it('does not import scripts and flags images without uploaded assets', () => {
    const result = parseConfluenceBody('<p>Visible</p><script>steal()</script><ac:image><ri:attachment ri:filename="unmapped.png"/></ac:image>', {
      pageId: '300',
      pageTitle: 'Safe page',
      attachments: [{id: 'att-2', title: 'unmapped.png'}],
    })

    expect(JSON.stringify(result.body)).not.toContain('steal')
    expect(result.warnings.some((warning) => warning.includes('awaits asset upload'))).toBe(true)
  })

  it('quarantines explicit internal and old-copy pages but keeps possible duplicates as drafts', () => {
    const snapshot = {pages: [
      {id: 'root-1', title: 'CMS', ancestors: [{id: 'home', title: 'Help Center'}]},
      {id: 'internal-1', title: 'LMX Troubleshooting Guide (Internal)', ancestors: [{id: 'home', title: 'Help Center'}, {id: 'root-1', title: 'CMS'}]},
      {id: 'old-1', title: 'LMX Content Black Screen/Logo Issue (OLD COPY)', ancestors: [{id: 'home', title: 'Help Center'}, {id: 'root-1', title: 'CMS'}]},
      {id: 'duplicate-1', title: 'How to Schedule Place Exchange Widget', storageHtml: '<p>Approved draft candidate.</p>', ancestors: [{id: 'home', title: 'Help Center'}, {id: 'root-1', title: 'CMS'}]},
    ]}

    const classified = classifyPages(snapshot)
    const plan = buildDocuments(snapshot)

    expect(classified.excluded.map((page) => page.id)).toEqual(['internal-1', 'old-1'])
    expect(classified.articles.map((page) => page.id)).toEqual(['duplicate-1'])
    expect(classified.articles[0].duplicateReview).toBe(true)
    expect(plan.products[0]._id).toBe('confluence-product-cms')
    expect(plan.collections[0].product._ref).toBe(plan.products[0]._id)
    expect(plan.articles[0].primaryCollection._ref).toBe(plan.collections[0]._id)
    expect(plan.articles[0].translationGroupId).toBe('confluence-duplicate-1')

    const draftDocuments = buildDraftDocuments(plan)
    expect(draftDocuments.find((document) => document._type === 'collection').product._weak).toBe(true)
    expect(draftDocuments.find((document) => document._type === 'article').primaryCollection._weak).toBe(true)
    expect(draftDocuments.find((document) => document._type === 'article').products[0]._weak).toBe(true)
  })

  it('creates stable ASCII slugs for titles with punctuation or non-Latin text', () => {
    expect(slugify('View Network: External IDs')).toBe('view-network-external-ids')
    expect(slugify('日本語ガイド')).toBe('help-article')
  })

  it('promotes draft payloads to clean published IDs without weak refs or draft metadata', () => {
    const draft = {
      _id: 'drafts.confluence-article-42',
      _rev: 'draft-rev',
      _createdAt: '2026-09-30T00:00:00Z',
      _type: 'article',
      primaryCollection: {_type: 'reference', _ref: 'collection-1', _weak: true},
      products: [{_type: 'reference', _ref: 'product-1', _weak: true}],
    }

    const published = preparePublishedDocument(draft, 'confluence-article-42', {
      primaryCollection: {_type: 'reference', _ref: 'collection-1'},
      products: [{_type: 'reference', _ref: 'product-1'}],
    })

    expect(published._id).toBe('confluence-article-42')
    expect(published._rev).toBeUndefined()
    expect(published._createdAt).toBeUndefined()
    expect(published.primaryCollection._weak).toBeUndefined()
    expect(published.products[0]._weak).toBeUndefined()
  })
})