import {describe, expect, it} from 'vitest'
import {buildDocuments, classifyPages, parseConfluenceBody, slugify} from '../scripts/migrate-confluence.mjs'

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
  })

  it('creates stable ASCII slugs for titles with punctuation or non-Latin text', () => {
    expect(slugify('View Network: External IDs')).toBe('view-network-external-ids')
    expect(slugify('日本語ガイド')).toBe('help-article')
  })
})