import {createClient} from '@sanity/client'
import {config} from 'dotenv'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {load} from 'cheerio'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')
config({path: resolve(appDir, '.env'), quiet: true})
config({path: resolve(repoRoot, '.env.migration'), override: true, quiet: true})

const projectId = process.env.SANITY_PROJECT_ID?.trim()
const dataset = process.env.SANITY_DATASET?.trim()
const token = process.env.SANITY_MIGRATION_TOKEN?.trim()
if (projectId !== 'vjmj7stb' || dataset !== 'helpcenterdevelopment' || !token) {
  throw new Error('Refusing to run without the expected project, dataset, and migration token.')
}
const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false, perspective: 'raw', token})
const source = JSON.parse(await readFile(join(repoRoot, 'data/confluence-helpdesk/export.json'), 'utf8'))
const exactDuplicatePairs = [
  {duplicate: 'guides-unable-to-publish-due-to-error-message', canonical: 'unable-to-publish-due-to-error-message', duplicateSourceId: '304942566', canonicalSourceId: '304940066'},
  {duplicate: 'how-to-schedule-vast-and-url', canonical: 'how-to-schedule-url-google-ima-vast', duplicateSourceId: '304941502', canonicalSourceId: '304939810'},
  {duplicate: 'how-to-schedule-place-exchange-widgets', canonical: 'how-to-schedule-place-exchange-widget', duplicateSourceId: '304939999', canonicalSourceId: '304941741'},
]

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['_key', '_rev', '_createdAt', '_updatedAt'].includes(key))
    .map(([key, item]) => [key, normalize(item)]))
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex')
}
function sourceText(page) {
  const $ = load(page.storageHtml || '', {xml: true})
  $('script, style').remove()
  return $.root().text().replace(/\s+/g, ' ').trim()
}
function sourceAttachmentHashes(page) {
  return (page.attachments || []).map((attachment) => createHash('sha256')
    .update(readFileSync(join(repoRoot, 'data/confluence-helpdesk/assets', attachment.localName)))
    .digest('hex')).sort()
}
function normalizePublishedBody(article) {
  return (article.body || []).map((block) => {
    const normalized = normalize(block)
    if (block._type === 'simpleTable' && block.caption === `Table from ${article.title}`) normalized.caption = 'Table from [article title]'
    if (block._type === 'imageWithCaption' && block.alt?.startsWith(`Image from ${article.title}: `)) normalized.alt = 'Image from [source page]'
    if (block._type === 'animatedImageWithCaption' && block.alt?.startsWith(`Animated image from ${article.title}: `)) normalized.alt = 'Animated image from [source page]'
    return normalized
  })
}

const slugs = [...new Set(exactDuplicatePairs.flatMap((pair) => [pair.duplicate, pair.canonical]))]
const articles = await client.fetch('*[_type == "article" && language == "en" && slug.current in $slugs && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, _rev, title, summary, reviewedAt, firstPublishedAt, seo, "slug": slug.current, contentType, "primaryCollection": primaryCollection._ref, products[]{_ref}, body}', {slugs})
const bySlug = new Map(articles.map((article) => [article.slug, article]))
const redirectSources = exactDuplicatePairs.map((pair) => `/en/articles/${pair.duplicate}`)
const existingRedirects = await client.fetch('*[_type == "redirect" && from in $sources && language == "en"]{_id, from, to, statusCode}', {sources: redirectSources})
const plan = []
for (const pair of exactDuplicatePairs) {
  const duplicate = bySlug.get(pair.duplicate)
  const canonical = bySlug.get(pair.canonical)
  const from = `/en/articles/${pair.duplicate}`
  const to = `/en/articles/${pair.canonical}`
  const existingRedirect = existingRedirects.find((item) => item.from === from)
  if (!duplicate && existingRedirect?.to === to && existingRedirect.statusCode === 301) {
    plan.push({from, to, duplicateId: `confluence-article-${pair.duplicateSourceId}`, canonicalId: `confluence-article-${pair.canonicalSourceId}`, alreadyDone: true})
    continue
  }
  if (!duplicate || !canonical) throw new Error(`Refusing incomplete duplicate pair: ${pair.duplicate} -> ${pair.canonical}.`)
  if (existingRedirect && (existingRedirect.to !== to || existingRedirect.statusCode !== 301)) throw new Error(`Refusing to replace a conflicting redirect for ${from}.`)
  const sourceDuplicate = source.pages.find((page) => String(page.id) === pair.duplicateSourceId)
  const sourceCanonical = source.pages.find((page) => String(page.id) === pair.canonicalSourceId)
  const sourceTextMatches = sourceDuplicate && sourceCanonical && sourceText(sourceDuplicate) === sourceText(sourceCanonical)
  const sourceAttachmentsMatch = sourceDuplicate && sourceCanonical && JSON.stringify(sourceAttachmentHashes(sourceDuplicate)) === JSON.stringify(sourceAttachmentHashes(sourceCanonical))
  const publishedBodyMatches = digest(normalizePublishedBody(duplicate)) === digest(normalizePublishedBody(canonical))
  const articleMetadataMatches = duplicate.summary === canonical.summary
    && duplicate.contentType === canonical.contentType
    && duplicate.primaryCollection === canonical.primaryCollection
    && JSON.stringify(duplicate.products) === JSON.stringify(canonical.products)
    && JSON.stringify(duplicate.seo) === JSON.stringify(canonical.seo)
    && duplicate.reviewedAt === canonical.reviewedAt
    && duplicate.firstPublishedAt === canonical.firstPublishedAt
  if (!sourceTextMatches || !sourceAttachmentsMatch || !publishedBodyMatches || !articleMetadataMatches) {
    throw new Error(`Refusing to consolidate ${pair.duplicate}: source, published body, or article metadata differ.`)
  }
  plan.push({
    _id: `mw-redirect-article-${pair.duplicate}-en`,
    _type: 'redirect',
    from,
    to,
    statusCode: 301,
    language: 'en',
    duplicateId: duplicate._id,
    duplicateRevision: duplicate._rev,
    canonicalId: canonical._id,
    alreadyDone: false,
  })
}

console.log(JSON.stringify({
  projectId,
  dataset,
  exactDuplicateConsolidations: plan.map(({from, to, duplicateId, canonicalId, alreadyDone}) => ({from, to, duplicateId, canonicalId, alreadyDone})),
  articleDocumentsToRemove: plan.filter((item) => !item.alreadyDone).length,
  applyRequested: process.argv.includes('--apply-reviewed-content'),
}, null, 2))
if (!process.argv.includes('--apply-reviewed-content')) {
  console.log('Dry run only. Re-run with --apply-reviewed-content to create 301 redirects and remove these three verified duplicate articles.')
  process.exit(0)
}

const pending = plan.filter((item) => !item.alreadyDone)
if (pending.length) {
  const currentRevisions = await client.fetch('*[_id in $ids]{_id, _rev}', {ids: pending.map((item) => item.duplicateId)})
  const revisions = new Map(currentRevisions.map((item) => [item._id, item._rev]))
  if (pending.some((item) => revisions.get(item.duplicateId) !== item.duplicateRevision)) {
    throw new Error('Refusing deletion: a duplicate article changed after the dry-run validation.')
  }
  let transaction = client.transaction()
  for (const item of pending) {
    const {_id, _type, from, to, statusCode, language} = item
    transaction = transaction.createIfNotExists({_id, _type, from, to, statusCode, language})
    transaction = transaction.delete(item.duplicateId)
  }
  await transaction.commit()
}

const verification = await client.fetch('*[_type == "redirect" && from in $sources && language == "en"]{from, to, statusCode}', {sources: redirectSources})
const remaining = await client.fetch('*[_id in $ids]._id', {ids: plan.map((item) => item.duplicateId)})
if (verification.length !== plan.length || remaining.length) throw new Error('Redirect/delete verification failed; inspect published Sanity documents before retrying.')
console.log(JSON.stringify({publishedRedirects: verification, removedArticleCount: plan.length}, null, 2))
