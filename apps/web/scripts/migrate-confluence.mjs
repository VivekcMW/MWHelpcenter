import {createClient} from '@sanity/client'
import {load} from 'cheerio'
import {config} from 'dotenv'
import {createReadStream} from 'node:fs'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join, resolve, sep} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')
const exportDir = join(repoRoot, 'data', 'confluence-helpdesk')
const exportFile = join(exportDir, 'export.json')
const assetsDir = join(exportDir, 'assets')

config({path: join(appDir, '.env'), quiet: true})
config({path: join(repoRoot, '.env.migration'), override: true, quiet: true})

const PRODUCTS = [
  {title: 'CMS', slug: 'cms', icon: 'monitor', order: 0},
  {title: 'Planner', slug: 'planner', icon: 'calendar', order: 1},
  {title: 'Admin Console', slug: 'admin-console', icon: 'settings', order: 2},
  {title: 'Measure Platform', slug: 'measure-platform', icon: 'chart', order: 3},
  {title: 'Influence', slug: 'influence', icon: 'megaphone', order: 4},
  {title: 'Inventory', slug: 'inventory', icon: 'box', order: 5},
  {title: 'LMX GSL', slug: 'lmx-gsl', icon: 'signage', order: 6},
]
const PRODUCT_TITLES = new Set(PRODUCTS.map(({title}) => title))
const PRODUCT_IDS = new Map(PRODUCTS.map((product) => [product.title, `confluence-product-${product.slug}`]))
const COLLECTION_IDS = new Map(PRODUCTS.map((product) => [product.title, `confluence-collection-${product.slug}`]))
const OLD_COPY_TITLES = new Set(['LMX Content Black Screen/Logo Issue (OLD COPY)'])
const DUPLICATE_GROUPS = [
  ['CMS Installations Guide Android and Windows', 'Installations Guide for Android and Windows'],
  ['Unable to Publish due to error Message', 'Guides - Unable to Publish due to error Message'],
  ['How to Schedule URL & Google IMA(VAST)', 'How to Schedule Vast and URL'],
  ['How to Schedule Place Exchange Widget', 'How to Schedule Place Exchange Widgets'],
]

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. Set it in the ignored root .env.migration file.`)
  return value
}

function confluenceOrigin() {
  const url = new URL(process.env.CONFLUENCE_BASE_URL?.trim() || 'https://movingwallshub.atlassian.net')
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CONFLUENCE_BASE_URL must be an HTTPS origin without a path, query, or fragment.')
  }
  return url.origin
}

function apiUrl(path) {
  const origin = confluenceOrigin()
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/rest/') || path.startsWith('/download/')) return `${origin}/wiki${path}`
  if (path.startsWith('/wiki/')) return `${origin}${path}`
  if (path.startsWith('/')) return `${origin}${path}`
  return `${origin}/wiki/${path}`
}

async function confluenceFetch(path, binary = false) {
  const authorization = `Basic ${Buffer.from(`${requiredEnv('CONFLUENCE_EMAIL')}:${requiredEnv('CONFLUENCE_API_TOKEN')}`).toString('base64')}`
  const response = await fetch(apiUrl(path), {
    headers: {Authorization: authorization, Accept: binary ? '*/*' : 'application/json'},
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Confluence request failed (${response.status}) for ${path.split('?')[0]}; check API-token permissions.`)
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json()
}

async function fetchPaged(path) {
  const results = []
  let next = path
  while (next) {
    const page = await confluenceFetch(next)
    results.push(...(page.results || []))
    next = page._links?.next || null
  }
  return results
}

async function forEachLimit(items, limit, callback) {
  let index = 0
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (index < items.length) await callback(items[index++])
  }))
}

function safeFilename(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'attachment'
}

const ANIMATED_IMAGE_MIMES = new Set(['image/gif', 'image/webp', 'image/apng'])

async function exportSpace() {
  await mkdir(assetsDir, {recursive: true})
  const pages = await fetchPaged('/rest/api/content?spaceKey=Helpdesk&type=page&status=current&limit=100&expand=ancestors,body.storage,metadata.labels,version')
  const exported = []
  console.log(`Exporting ${pages.length} current Helpdesk pages and their attachments...`)

  await forEachLimit(pages, 4, async (page) => {
    const attachments = await fetchPaged(`/rest/api/content/${encodeURIComponent(page.id)}/child/attachment?limit=100`)
    const savedAttachments = []
    await forEachLimit(attachments, 3, async (attachment) => {
      const localName = `${safeFilename(attachment.id)}_${safeFilename(attachment.title || 'attachment')}`
      const path = resolve(assetsDir, localName)
      if (!path.startsWith(`${resolve(assetsDir)}${sep}`)) throw new Error('Unsafe attachment path in Confluence response.')
      const bytes = await confluenceFetch(attachment._links?.download || '', true)
      await writeFile(path, bytes, {mode: 0o600})
      savedAttachments.push({
        id: attachment.id,
        title: attachment.title || localName,
        mediaType: attachment.metadata?.mediaType || 'application/octet-stream',
        localName,
      })
    })
    exported.push({
      id: page.id,
      title: page.title,
      status: page.status,
      version: page.version?.number ?? null,
      ancestors: (page.ancestors || []).map(({id, title}) => ({id, title})),
      labels: (page.metadata?.labels?.results || []).map(({name}) => name),
      storageHtml: page.body?.storage?.value || '',
      attachments: savedAttachments,
    })
  })

  exported.sort((left, right) => Number(left.id) - Number(right.id))
  const snapshot = {exportedAt: new Date().toISOString(), source: {baseUrl: confluenceOrigin(), spaceKey: 'Helpdesk'}, pages: exported}
  await writeFile(exportFile, `${JSON.stringify(snapshot)}\n`, {mode: 0o600})
  console.log(`Saved ${exported.length} pages and ${exported.reduce((sum, page) => sum + page.attachments.length, 0)} attachments to ${exportFile}`)
}

function localName(node) {
  return (node?.name || node?.tagName || '').toLowerCase().split(':').at(-1)
}

function decodeHtmlEntities(value) {
  if (!value?.includes('&')) return value ?? ''
  // Parse as textarea text so `<` remains text while HTML5 named entities decode.
  const safeText = value.replaceAll('<', '&lt;')
  return load(`<textarea>${safeText}</textarea>`).root().find('textarea').text()
}

function attribute(node, name) {
  const attributes = node?.attribs || {}
  const key = Object.keys(attributes).find((candidate) => candidate === name || candidate.endsWith(`:${name}`))
  return key ? decodeHtmlEntities(attributes[key]) : undefined
}

function plainText(html) {
  const $ = load(html || '', {xml: true})
  $('script, style').remove()
  return decodeHtmlEntities($.root().text()).replaceAll('\u00a0', ' ').replaceAll(/\s+/g, ' ').trim()
}

function findDescendant(node, target) {
  for (const child of node?.children || []) {
    if (child.type === 'tag' && localName(child) === target) return child
    const nested = findDescendant(child, target)
    if (nested) return nested
  }
  return undefined
}

function rawText(node) {
  if (node?.type === 'text') return node.data || ''
  return (node?.children || []).map(rawText).join('')
}

function slugify(value) {
  const slug = value.normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'help-article'
}

function inferContentType(title, text) {
  const value = `${title} ${text.slice(0, 500)}`.toLowerCase()
  if (/faq|frequently asked/.test(value)) return 'faq'
  if (/troubleshoot|error|unable to|issue|problem|fix /.test(value)) return 'troubleshooting'
  if (/best practice|recommendation/.test(value)) return 'best-practice'
  if (/overview|introduction|about /.test(value)) return 'overview'
  return 'guide'
}

function isSafeHref(value) {
  const href = value?.trim()
  // eslint-disable-next-line no-control-regex -- Reject control chars in imported links.
  if (!href || /[\s\\\u0000-\u001f\u007f]/.test(href)) return false
  return /^\/(?!\/)/.test(href) || /^#[\w-]+$/.test(href) || /^(https?:\/\/|mailto:)[^\s]+$/i.test(href)
}

function parseConfluenceBody(html, {pageId, pageTitle, attachments = [], assetIds = new Map()} = {}) {
  const $ = load(html || '', {xml: true})
  $('script, style').remove()
  const root = $('body').length ? $('body').first() : $.root()
  const key = (() => {let index = 0; return (prefix) => `${prefix}${++index}`})()
  const warnings = []
  const body = []
  const attachmentByName = new Map(attachments.map((attachment) => [attachment.title.toLowerCase(), attachment]))

  function addInline(nodes, marks = [], spans = [], markDefs = []) {
    for (const node of nodes || []) {
      if (node.type === 'text') {
        const text = decodeHtmlEntities(node.data)
        if (!text) continue
        const previous = spans.at(-1)
        if (previous && previous.marks.join('|') === marks.join('|')) previous.text += text
        else spans.push({_key: key('s'), _type: 'span', text, marks: [...marks]})
        continue
      }
      if (node.type !== 'tag') continue
      const tag = localName(node)
      if (tag === 'image' || tag === 'structured-macro') continue
      let nextMarks = marks
      if (['strong', 'b'].includes(tag)) nextMarks = [...marks, 'strong']
      else if (['em', 'i'].includes(tag)) nextMarks = [...marks, 'em']
      else if (tag === 'code') nextMarks = [...marks, 'code']
      else if (tag === 'a') {
        const href = attribute(node, 'href')
        if (isSafeHref(href)) {
          const markKey = key('m')
          markDefs.push({_key: markKey, _type: 'link', href})
          nextMarks = [...marks, markKey]
        } else if (href) warnings.push(`Unsafe link removed: ${pageTitle} (${pageId})`)
      }
      addInline(node.children, nextMarks, spans, markDefs)
    }
    return {spans, markDefs}
  }

  function addTextBlock(nodes, style = 'normal', listItem, level = 1) {
    const {spans, markDefs} = addInline(nodes)
    if (!spans.some((span) => span.text.trim())) return
    const block = {_key: key('b'), _type: 'block', style, children: spans, markDefs}
    if (listItem) Object.assign(block, {listItem, level})
    body.push(block)
  }

  function addCallout(title, text, tone = 'warning') {
    body.push({_key: key('c'), _type: 'callout', tone, title: title.slice(0, 100), text: (text || 'Review the original Confluence content before publication.').replace(/\s+/g, ' ').slice(0, 1500)})
  }

  function addCodeBlock(node) {
    const plainTextBody = findDescendant(node, 'plain-text-body')
    const code = rawText(plainTextBody).replace(/\r\n?/g, '\n')
    if (!code.trim()) {
      warnings.push(`Empty Confluence code macro requires review: ${pageTitle} (${pageId})`)
      addCallout('Code block requires review', 'The source code macro was empty or could not be decoded.')
      return
    }
    const languageParameter = (node.children || []).find((child) =>
      localName(child) === 'parameter' && attribute(child, 'name') === 'language',
    )
    const language = decodeHtmlEntities(rawText(languageParameter)).trim()
    body.push({_key: key('code'), _type: 'codeBlock', code, ...(language ? {language: language.slice(0, 40)} : {})})
  }

  function attachmentFilename(node) {
    let filename
    const visit = (current) => {
      if (filename || !current) return
      if (current.type === 'tag' && localName(current) === 'attachment') filename = attribute(current, 'filename')
      for (const child of current.children || []) visit(child)
    }
    visit(node)
    return filename
  }

  function addImage(node) {
    const filename = attachmentFilename(node) || attribute(node, 'src')?.split('/').pop()
    if (!filename) {
      warnings.push(`Image without a source: ${pageTitle} (${pageId})`)
      return
    }
    const attachment = attachmentByName.get(decodeURIComponent(filename).toLowerCase())
    if (!attachment) {
      warnings.push(`Image attachment not exported (${filename}): ${pageTitle} (${pageId})`)
      addCallout('Image requires review', `Image attachment "${filename}" could not be matched to the Confluence export.`)
      return
    }
    const assetId = assetIds.get(attachment.id)
    if (!assetId) {
      warnings.push(`Image awaits asset upload (${filename}): ${pageTitle} (${pageId})`)
      return
    }
    const alt = attribute(node, 'alt') || attribute(node, 'title') || ''
    if (!alt) warnings.push(`Image needs human-written alt text (${filename}): ${pageTitle} (${pageId})`)
    const caption = plainText($(node).find('caption').first().html() || '').slice(0, 320)
    if (ANIMATED_IMAGE_MIMES.has(attachment.mediaType?.toLowerCase())) {
      body.push({
        _key: key('i'),
        _type: 'animatedImageWithCaption',
        file: {_type: 'file', asset: {_type: 'reference', _ref: assetId}},
        alt: (alt || `Animated image from ${pageTitle}: ${filename}`).slice(0, 250),
        ...(caption ? {caption} : {}),
      })
      return
    }
    body.push({
      _key: key('i'),
      _type: 'imageWithCaption',
      image: {_type: 'image', asset: {_type: 'reference', _ref: assetId}},
      alt: (alt || `Image from ${pageTitle}: ${filename}`).slice(0, 250),
      ...(caption ? {caption} : {}),
    })
  }

  function addTable(node) {
    const rows = $(node).find('tr').toArray().map((row) => $(row).children('th, td').toArray())
      .filter((cells) => cells.length > 0)
    if (!rows.length) return
    const headerIndex = rows.findIndex((cells) => cells.some((cell) => localName(cell) === 'th'))
    const header = headerIndex >= 0 ? rows.splice(headerIndex, 1)[0] : undefined
    if (header && !rows.length) {
      // A header-only table still contains readable text; preserve it as prose
      // rather than replacing it with a warning callout.
      header.forEach((cell) => addTextBlock(cell.children))
      return
    }
    const columnCount = header?.length ?? Math.max(...rows.map((cells) => cells.length))
    if (!header && rows.length === 1 && columnCount === 1) {
      addTextBlock(rows[0][0].children)
      return
    }
    const columns = header
      ? header.map((cell) => plainText($.html(cell)).slice(0, 100))
      : Array.from({length: columnCount}, (_, index) => `Column ${index + 1}`)
    if (!header && /faq/i.test(pageTitle) && columnCount === 2) columns.splice(0, 2, 'Question', 'Answer')
    if (!columns.length || columns.length > 8 || rows.length > 50) {
      warnings.push(`Table needs manual conversion (${columns.length} columns, ${rows.length} rows): ${pageTitle} (${pageId})`)
      addCallout('Table requires review', `A Confluence table exceeds the supported Sanity table limits. Review "${pageTitle}" in Confluence.`)
      return
    }
    const normalizedRows = rows.map((cells) => Array.from({length: columns.length}, (_, index) => plainText(cells[index] ? $.html(cells[index]) : '').slice(0, 500)))
    const caption = plainText($(node).find('caption').first().html() || '') || `Table from ${pageTitle}`
    body.push({_key: key('t'), _type: 'simpleTable', caption: caption.slice(0, 200), columns, rows: normalizedRows.map((cells) => ({_key: key('r'), _type: 'tableRow', cells}))})
  }

  function addList(node, listType, level = 1) {
    for (const item of node.children || []) {
      if (localName(item) !== 'li') continue
      addTextBlock((item.children || []).filter((child) => !['ul', 'ol'].includes(localName(child))), 'normal', listType, Math.min(level, 8))
      for (const child of item.children || []) {
        if (['ul', 'ol'].includes(localName(child))) addList(child, localName(child) === 'ol' ? 'number' : 'bullet', level + 1)
      }
    }
  }

  function walk(nodes) {
    for (const node of nodes || []) {
      if (node.type !== 'tag') continue
      const tag = localName(node)
      if (/^h[1-6]$/.test(tag)) addTextBlock(node.children, Number(tag.slice(1)) <= 2 ? 'h2' : 'h3')
      else if (tag === 'p') {
        addTextBlock(node.children)
        const images = []
        const findImages = (current) => {
          for (const child of current || []) {
            if (child.type === 'tag' && ['image', 'img'].includes(localName(child))) images.push(child)
            else findImages(child.children)
          }
        }
        findImages(node.children)
        images.forEach(addImage)
      } else if (['ul', 'ol'].includes(tag)) addList(node, tag === 'ol' ? 'number' : 'bullet')
      else if (tag === 'blockquote') addTextBlock(node.children, 'blockquote')
      else if (tag === 'table') addTable(node)
      else if (['image', 'img'].includes(tag)) addImage(node)
      else if (tag === 'structured-macro') {
        const macro = attribute(node, 'name') || 'unknown'
        if (macro === 'code') {
          addCodeBlock(node)
          continue
        }
        if (macro === 'toc') continue // The article page builds its own accessible table of contents.
        if (macro === 'info') {
          const titleParameter = (node.children || []).find((child) =>
            localName(child) === 'parameter' && attribute(child, 'name') === 'title',
          )
          const richTextBody = findDescendant(node, 'rich-text-body')
          const text = richTextBody ? plainText($.html(richTextBody)) : plainText($.html(node))
          addCallout(decodeHtmlEntities(rawText(titleParameter)).trim() || 'Information', text, 'info')
          continue
        }
        warnings.push(`Unsupported Confluence macro "${macro}": ${pageTitle} (${pageId})`)
        addCallout(`Confluence macro requires review: ${macro}`, plainText($.html(node)))
      } else if (['div', 'section', 'article', 'ac', 'span'].includes(tag) || node.children?.length) walk(node.children)
    }
  }

  walk(root.contents().toArray())
  if (!body.length) {
    const text = plainText(html)
    if (text) body.push({_key: key('b'), _type: 'block', style: 'normal', children: [{_key: key('s'), _type: 'span', text, marks: []}], markDefs: []})
  }
  return {body, warnings}
}

function classifyPages(snapshot) {
  const rootPages = new Set(snapshot.pages
    .filter((page) => page.ancestors?.at(-1)?.title === 'Help Center' && PRODUCT_TITLES.has(page.title))
    .map((page) => page.title))
  const articles = []
  const excluded = []
  const unsupported = []
  const duplicateTitles = new Set(DUPLICATE_GROUPS.flat())

  for (const page of snapshot.pages) {
    if (page.title === 'Help Center' || (PRODUCT_TITLES.has(page.title) && page.ancestors?.at(-1)?.title === 'Help Center')) continue
    const product = page.ancestors?.at(-1)?.title
    if (!rootPages.has(product)) {
      unsupported.push({id: page.id, title: page.title, reason: `No recognized product ancestor: ${product || '(none)'}`})
      continue
    }
    const reason = /\binternal\b/i.test(page.title)
      ? 'Internal title requires Admin clearance'
      : OLD_COPY_TITLES.has(page.title)
        ? 'Old-copy title requires Admin disposition'
        : null
    if (reason) excluded.push({id: page.id, title: page.title, product, reason})
    else articles.push({...page, product, duplicateReview: duplicateTitles.has(page.title)})
  }
  return {articles, excluded, unsupported, products: PRODUCTS.filter((product) => rootPages.has(product.title))}
}

function buildDocuments(snapshot, assetIds = new Map()) {
  const classification = classifyPages(snapshot)
  const slugOwners = new Set()
  const warnings = []
  const products = classification.products.map((product) => ({
    _id: PRODUCT_IDS.get(product.title),
    _type: 'product',
    title: product.title,
    slug: {_type: 'slug', current: product.slug},
    description: `Confluence Helpdesk content for ${product.title}. Admin review required before publication.`,
    icon: product.icon,
    order: product.order,
    language: 'en',
  }))
  const collections = classification.products.map((product) => ({
    _id: COLLECTION_IDS.get(product.title),
    _type: 'collection',
    title: `${product.title} Help`,
    slug: {_type: 'slug', current: `${product.slug}-help`},
    description: `Migrated help articles for ${product.title}; review before publication.`,
    product: {_type: 'reference', _ref: PRODUCT_IDS.get(product.title)},
    language: 'en',
  }))
  const articles = []

  for (const page of classification.articles) {
    const text = plainText(page.storageHtml)
    const excerpt = text.slice(0, 320).trim().replace(/\s+\S*$/, '')
    const summary = (excerpt.length >= 10 ? excerpt : `Imported Confluence article: ${page.title}`).slice(0, 320)
    const language = /[\u3040-\u30ff\u3400-\u9fff]/.test(text) ? 'ja' : 'en'
    const baseSlug = slugify(page.title)
    const slugKey = `${language}:${baseSlug}`
    const slug = slugOwners.has(slugKey) ? `${baseSlug}-${page.id}`.slice(0, 96) : baseSlug
    slugOwners.add(slugKey)
    const transformed = parseConfluenceBody(page.storageHtml, {pageId: page.id, pageTitle: page.title, attachments: page.attachments, assetIds})
    warnings.push(...transformed.warnings)
    articles.push({
      _id: `confluence-article-${page.id}`,
      _type: 'article',
      title: page.title.replace(/_/g, ' ').slice(0, 120),
      slug: {_type: 'slug', current: slug},
      summary,
      language,
      translationGroupId: `confluence-${page.id}`,
      primaryCollection: {_type: 'reference', _ref: COLLECTION_IDS.get(page.product)},
      products: [{_type: 'reference', _ref: PRODUCT_IDS.get(page.product)}],
      contentType: inferContentType(page.title, text),
      body: transformed.body,
    })
  }
  return {...classification, sourceArticles: classification.articles, products, collections, articles, warnings}
}

function buildDraftDocuments(plan) {
  const weakReference = (reference) => ({...reference, _weak: true})
  return [
    ...plan.products,
    ...plan.collections.map((document) => document.product
      ? {...document, product: weakReference(document.product)}
      : document),
    ...plan.articles.map((document) => ({
      ...document,
      primaryCollection: weakReference(document.primaryCollection),
      products: document.products.map(weakReference),
    })),
  ]
}

function duplicateReviewReport(articles) {
  return DUPLICATE_GROUPS.map((titles) => ({titles, found: titles.map((title) => articles.find((article) => article.title === title)?._id || null)}))
    .filter((group) => group.found.some(Boolean))
}

async function readSnapshot() {
  const snapshot = JSON.parse(await readFile(exportFile, 'utf8'))
  if (!Array.isArray(snapshot.pages) || !snapshot.pages.length) throw new Error('Confluence export is empty or malformed.')
  return snapshot
}

async function writeDryRunReport(snapshot, plan) {
  const report = {
    createdAt: new Date().toISOString(),
    sourcePages: snapshot.pages.length,
    productDrafts: plan.products.length,
    collectionDrafts: plan.collections.length,
    articleDrafts: plan.articles.length,
    excludedForAdminReview: plan.excluded,
    unsupportedPages: plan.unsupported,
    possibleDuplicateGroups: duplicateReviewReport(plan.articles),
    pagesWithAttachments: plan.sourceArticles.filter((page) => page.attachments?.length).length,
    plannedAssets: plan.sourceArticles.reduce((sum, page) => sum + (page.attachments?.length || 0), 0),
    warnings: plan.warnings,
  }
  await writeFile(join(exportDir, 'dry-run-report.json'), `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600})
  return report
}

async function applyDraftImport(snapshot) {
  if (!process.argv.includes('--apply-drafts')) throw new Error('No writes made. Review the dry-run report, then pass --apply-drafts to create Sanity drafts.')
  const projectId = process.env.SANITY_PROJECT_ID?.trim()
  const dataset = process.env.SANITY_DATASET?.trim()
  if (projectId !== 'vjmj7stb') throw new Error('Refusing import: SANITY_PROJECT_ID must be vjmj7stb.')
  if (dataset !== 'helpcenterdevelopment') throw new Error('Refusing import: SANITY_DATASET must be helpcenterdevelopment.')
  const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false, token: requiredEnv('SANITY_MIGRATION_TOKEN')})
  const classification = classifyPages(snapshot)
  const assetIds = new Map()
  const attachments = classification.articles.flatMap((page) => page.attachments || [])
  const filenames = [...new Set(attachments.map((attachment) => attachment.title).filter(Boolean))]
  const existingAssets = await client.fetch(
    '*[_type in ["sanity.imageAsset", "sanity.fileAsset"] && originalFilename in $filenames]{_id, originalFilename}',
    {filenames},
  )
  const existingByFilename = new Map(existingAssets.map((asset) => [asset.originalFilename.toLowerCase(), asset._id]))
  for (const attachment of attachments) {
    const existingId = existingByFilename.get(attachment.title.toLowerCase())
    if (existingId) assetIds.set(attachment.id, existingId)
  }
  let completed = assetIds.size
  console.log(`Reusing ${completed} matching Sanity assets; uploading ${attachments.length - completed} remaining attachments...`)

  await forEachLimit(attachments.filter((attachment) => !assetIds.has(attachment.id)), 6, async (attachment) => {
    if (!attachment.localName) throw new Error(`Missing exported asset filename for ${attachment.id}.`)
    const fullPath = resolve(assetsDir, attachment.localName)
    if (!fullPath.startsWith(`${resolve(assetsDir)}${sep}`)) throw new Error('Unsafe local asset path in migration snapshot.')
    const mimeType = attachment.mediaType?.toLowerCase()
    const type = mimeType?.startsWith('image/') && !ANIMATED_IMAGE_MIMES.has(mimeType) ? 'image' : 'file'
    const uploaded = await client.assets.upload(type, createReadStream(fullPath), {filename: attachment.title, contentType: attachment.mediaType})
    assetIds.set(attachment.id, uploaded._id)
    completed += 1
    if (completed % 25 === 0 || completed === attachments.length) console.log(`Assets ready: ${completed}/${attachments.length}`)
  })

  const plan = buildDocuments(snapshot, assetIds)
  const documents = buildDraftDocuments(plan)
  const batches = []
  for (let index = 0; index < documents.length; index += 20) batches.push(documents.slice(index, index + 20))
  for (const batch of batches) {
    let transaction = client.transaction()
    for (const document of batch) transaction = transaction.createOrReplace({...document, _id: `drafts.${document._id}`})
    await transaction.commit()
  }

  const report = {
    completedAt: new Date().toISOString(),
    projectId,
    dataset,
    draftProducts: plan.products.length,
    draftCollections: plan.collections.length,
    draftArticles: plan.articles.length,
    uploadedAssets: assetIds.size,
    excludedForAdminReview: plan.excluded,
    possibleDuplicateGroups: duplicateReviewReport(plan.articles),
    warnings: plan.warnings,
    published: false,
  }
  await writeFile(join(exportDir, 'import-report.json'), `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600})
  console.log(`Created drafts: ${report.draftProducts} products, ${report.draftCollections} collections, ${report.draftArticles} articles; uploaded ${report.uploadedAssets} assets.`)
  console.log('Nothing was published. Admin review and explicit publishing in Studio are required.')
}

async function linkPublishedDocuments(snapshot) {
  if (!process.argv.includes('--apply-links')) throw new Error('No links changed. Review the Admin-published base documents, then pass --apply-links.')
  const projectId = process.env.SANITY_PROJECT_ID?.trim()
  const dataset = process.env.SANITY_DATASET?.trim()
  if (projectId !== 'vjmj7stb' || dataset !== 'helpcenterdevelopment') {
    throw new Error('Refusing link operation outside vjmj7stb/helpcenterdevelopment.')
  }
  const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false, token: requiredEnv('SANITY_MIGRATION_TOKEN')})
  const classification = classifyPages(snapshot)
  const products = classification.products
  const productIds = products.map((product) => PRODUCT_IDS.get(product.title))
  const collectionIds = products.map((product) => COLLECTION_IDS.get(product.title))
  const publishedIds = new Set(await client.fetch('*[_id in $ids]._id', {ids: [...productIds, ...collectionIds]}))
  const patches = []
  const pendingProducts = []
  const pendingCollections = []
  const pendingArticles = []

  for (const product of products) {
    const productId = PRODUCT_IDS.get(product.title)
    const collectionId = COLLECTION_IDS.get(product.title)
    if (!publishedIds.has(productId)) {
      pendingProducts.push(product.title)
      pendingCollections.push(product.title)
      continue
    }
    patches.push(client.patch(`drafts.${collectionId}`).set({product: {_type: 'reference', _ref: productId}}))
  }

  for (const page of classification.articles) {
    const productId = PRODUCT_IDS.get(page.product)
    const collectionId = COLLECTION_IDS.get(page.product)
    if (!publishedIds.has(productId) || !publishedIds.has(collectionId)) {
      pendingArticles.push(page.title)
      continue
    }
    patches.push(client.patch(`drafts.confluence-article-${page.id}`).set({
      primaryCollection: {_type: 'reference', _ref: collectionId},
      products: [{_type: 'reference', _ref: productId}],
    }))
  }

  for (let index = 0; index < patches.length; index += 20) {
    let transaction = client.transaction()
    for (const patch of patches.slice(index, index + 20)) transaction = transaction.patch(patch)
    await transaction.commit()
  }

  const report = {
    linkedAt: new Date().toISOString(),
    linkedDraftCount: patches.length,
    pendingPublishedProducts: [...new Set(pendingProducts)],
    pendingPublishedCollections: [...new Set(pendingCollections)],
    pendingArticleCount: pendingArticles.length,
    pendingArticleExamples: pendingArticles.slice(0, 20),
    published: false,
  }
  await writeFile(join(exportDir, 'link-report.json'), `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600})
  console.log(`Linked ${report.linkedDraftCount} drafts to Admin-published dependencies.`)
  console.log(`Pending product groups: ${report.pendingPublishedProducts.length}; pending articles: ${report.pendingArticleCount}.`)
  console.log('This command only links drafts; it does not publish them.')
}

function preparePublishedDocument(document, id, overrides = {}) {
  const content = {...document}
  delete content._id
  delete content._rev
  delete content._createdAt
  delete content._updatedAt
  return {...content, ...overrides, _id: id}
}

async function promoteDraft(client, draftId, publishedId, overrides = {}) {
  const draft = await client.fetch('*[_id == $id][0]', {id: draftId})
  if (!draft) {
    const alreadyPublished = await client.fetch('*[_id == $id][0]._id', {id: publishedId})
    if (alreadyPublished) return 'already-published'
    throw new Error(`Cannot publish: both draft ${draftId} and published document ${publishedId} are missing.`)
  }
  const alreadyPublished = await client.fetch('*[_id == $id][0]._id', {id: publishedId})
  if (alreadyPublished) throw new Error(`Refusing to overwrite existing published document ${publishedId}.`)
  const published = preparePublishedDocument(draft, publishedId, overrides)
  await client.transaction()
    .createOrReplace(published)
    .delete(draftId)
    .commit()
  return 'published'
}

async function publishAll(snapshot) {
  if (!process.argv.includes('--confirm-admin-approval')) {
    throw new Error('Publishing is blocked. Admin must explicitly confirm by passing --confirm-admin-approval after reviewing the drafts.')
  }
  const projectId = process.env.SANITY_PROJECT_ID?.trim()
  const dataset = process.env.SANITY_DATASET?.trim()
  if (projectId !== 'vjmj7stb' || dataset !== 'helpcenterdevelopment') {
    throw new Error('Refusing publication outside project vjmj7stb dataset helpcenterdevelopment.')
  }
  const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false, token: requiredEnv('SANITY_MIGRATION_TOKEN'), perspective: 'raw'})
  const classification = classifyPages(snapshot)
  const expectedArticleIds = classification.articles.map((page) => `confluence-article-${page.id}`)
  const expectedProductIds = classification.products.map((product) => PRODUCT_IDS.get(product.title))
  const expectedCollectionIds = classification.products.map((product) => COLLECTION_IDS.get(product.title))
  const expectedIds = [...expectedProductIds, ...expectedCollectionIds, ...expectedArticleIds]
  const existingDocuments = await client.fetch('*[_id in $ids || _id in $draftIds]{_id,_type,body[]{_type,image{asset{_ref}}}}', {
    ids: expectedIds,
    draftIds: expectedIds.map((id) => `drafts.${id}`),
  })
  const existingIds = new Set(existingDocuments.map((document) => document._id))
  const missingDocuments = expectedIds.filter((id) => !existingIds.has(id) && !existingIds.has(`drafts.${id}`))
  if (missingDocuments.length) throw new Error(`Refusing to publish: ${missingDocuments.length} expected published/draft document(s) are missing.`)
  const conflictingDocuments = expectedIds.filter((id) => existingIds.has(id) && existingIds.has(`drafts.${id}`))
  if (conflictingDocuments.length) throw new Error(`Refusing to publish: ${conflictingDocuments.length} document(s) have both a published record and a draft.`)

  const imageIds = [...new Set(existingDocuments.flatMap((document) => document.body || [])
    .filter((block) => block._type === 'imageWithCaption')
    .map((block) => block.image?.asset?._ref)
    .filter(Boolean))]
  const foundImages = imageIds.length ? await client.fetch('*[_id in $ids && _type == "sanity.imageAsset"]._id', {ids: imageIds}) : []
  if (foundImages.length !== imageIds.length) throw new Error(`Refusing to publish: only ${foundImages.length}/${imageIds.length} referenced image assets resolve.`)

  const report = {startedAt: new Date().toISOString(), dataset, adminConfirmed: true, published: {products: 0, collections: 0, articles: 0}, skippedAlreadyPublished: 0, completed: false}
  const reportPath = join(exportDir, 'publish-report.json')
  const saveProgress = async () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600})

  for (const product of classification.products) {
    const result = await promoteDraft(client, `drafts.${PRODUCT_IDS.get(product.title)}`, PRODUCT_IDS.get(product.title))
    if (result === 'published') report.published.products += 1
    else report.skippedAlreadyPublished += 1
    await saveProgress()
  }

  for (const product of classification.products) {
    const productId = PRODUCT_IDS.get(product.title)
    const result = await promoteDraft(
      client,
      `drafts.${COLLECTION_IDS.get(product.title)}`,
      COLLECTION_IDS.get(product.title),
      {product: {_type: 'reference', _ref: productId}},
    )
    if (result === 'published') report.published.collections += 1
    else report.skippedAlreadyPublished += 1
    await saveProgress()
  }

  for (const page of classification.articles) {
    const productId = PRODUCT_IDS.get(page.product)
    const collectionId = COLLECTION_IDS.get(page.product)
    const result = await promoteDraft(
      client,
      `drafts.confluence-article-${page.id}`,
      `confluence-article-${page.id}`,
      {
        primaryCollection: {_type: 'reference', _ref: collectionId},
        products: [{_type: 'reference', _ref: productId}],
      },
    )
    if (result === 'published') report.published.articles += 1
    else report.skippedAlreadyPublished += 1
    if ((report.published.articles + report.skippedAlreadyPublished) % 10 === 0) await saveProgress()
  }

  report.completedAt = new Date().toISOString()
  report.completed = true
  await saveProgress()
  console.log(`Published ${report.published.products} products, ${report.published.collections} collections, and ${report.published.articles} articles.`)
  console.log(`Admin-confirmed publish report: ${reportPath}`)
}

async function main() {
  const command = process.argv[2] || 'dry-run'
  if (command === 'export') return exportSpace()
  const snapshot = await readSnapshot()
  if (command === 'link-published') return linkPublishedDocuments(snapshot)
  if (command === 'publish') return publishAll(snapshot)
  const plan = buildDocuments(snapshot)
  const report = await writeDryRunReport(snapshot, plan)
  console.log(`Pages ${report.sourcePages}; products ${report.productDrafts}; collections ${report.collectionDrafts}; article drafts ${report.articleDrafts}.`)
  console.log(`Admin exclusions ${report.excludedForAdminReview.length}; duplicate review groups ${report.possibleDuplicateGroups.length}; transformation warnings ${report.warnings.length}.`)
  console.log(`Dry-run report: ${join(exportDir, 'dry-run-report.json')}`)
  if (command === 'dry-run') return
  if (command === 'import') return applyDraftImport(snapshot)
  throw new Error('Usage: migrate-confluence.mjs export | dry-run | import --apply-drafts | link-published --apply-links | publish --confirm-admin-approval')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Migration failed.')
    process.exitCode = 1
  })
}

export {buildDocuments, buildDraftDocuments, classifyPages, parseConfluenceBody, preparePublishedDocument, slugify}
