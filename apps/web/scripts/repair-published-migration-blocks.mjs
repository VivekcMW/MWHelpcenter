import {createClient} from '@sanity/client'
import {config} from 'dotenv'
import {readFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {buildDocuments} from './migrate-confluence.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')
const exportPath = resolve(repoRoot, 'data/confluence-helpdesk/export.json')
config({path: resolve(appDir, '.env'), quiet: true})
config({path: resolve(repoRoot, '.env.migration'), override: true, quiet: true})

const projectId = process.env.SANITY_PROJECT_ID?.trim()
const dataset = process.env.SANITY_DATASET?.trim()
const token = process.env.SANITY_MIGRATION_TOKEN?.trim()
if (projectId !== 'vjmj7stb' || dataset !== 'helpcenterdevelopment' || !token) {
  throw new Error('Refusing to run without the expected project, dataset, and migration token.')
}
const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false, perspective: 'raw', token})
const snapshot = JSON.parse(await readFile(exportPath, 'utf8'))
if (!Array.isArray(snapshot.pages) || !snapshot.pages.length) throw new Error('Confluence export is missing or empty.')

const targetCallout = (block) => block?._type === 'callout' && (
  block.title === 'Table requires review' || block.title?.startsWith('Confluence macro requires review:')
)
const current = await client.fetch('*[_type == "article" && language == "en" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, _rev, _updatedAt, body}')
const targets = current.filter((article) => (article.body || []).some(targetCallout))
const sourceIds = new Set(targets.map((article) => article._id.replace(/^confluence-article-/, '')))
const targetSources = snapshot.pages.filter((page) => sourceIds.has(String(page.id)))
if (targetSources.length !== targets.length) throw new Error('Refusing changes: not every affected published article has a source export page.')

const sourceAttachments = targetSources.flatMap((page) => page.attachments || [])
const filenames = [...new Set(sourceAttachments.map((item) => item.title).filter(Boolean))]
const assets = await client.fetch('*[_type in ["sanity.imageAsset", "sanity.fileAsset"] && originalFilename in $filenames]{_id, originalFilename}', {filenames})
const assetsByFilename = new Map(assets.map((asset) => [asset.originalFilename.toLowerCase(), asset._id]))
const assetIds = new Map()
for (const attachment of sourceAttachments) {
  const assetId = assetsByFilename.get(attachment.title.toLowerCase())
  if (assetId) assetIds.set(attachment.id, assetId)
}
const plan = buildDocuments(snapshot, assetIds)
const planById = new Map(plan.articles.map((article) => [article._id, article]))
const missingAssets = plan.warnings.filter((warning) => [...sourceIds].some((id) => warning.includes(`(${id})`)) && /Image (?:awaits asset upload|attachment not exported)/.test(warning))
const blockedSourceIds = [...new Set(missingAssets.map((warning) => warning.match(/\((\d+)\)$/)?.[1]).filter(Boolean))]
const patches = targets.map((article) => {
  const migrated = planById.get(article._id)
  if (!migrated) throw new Error(`Refusing changes: no source transformation exists for ${article._id}.`)
  const sourceId = article._id.replace(/^confluence-article-/, '')
  const currentCallouts = (article.body || []).filter(targetCallout)
  if (blockedSourceIds.includes(sourceId)) {
    if (!currentCallouts.length || currentCallouts.some((block) => block.title !== 'Confluence macro requires review: toc')) {
      throw new Error(`Refusing changes: unresolved assets affect a non-TOC repair in ${article._id}.`)
    }
    return {id: article._id, rev: article._rev, body: article.body.filter((block) => block.title !== 'Confluence macro requires review: toc'), keptExistingAssets: true}
  }
  if (migrated.body.some(targetCallout)) throw new Error(`Refusing changes: migration repair did not remove known placeholders for ${article._id}.`)
  return {id: article._id, rev: article._rev, body: migrated.body, keptExistingAssets: false}
})

console.log(JSON.stringify({
  projectId,
  dataset,
  affectedArticles: patches.length,
  mappedTargetAttachments: assetIds.size,
  targetAttachmentCount: sourceAttachments.length,
  unresolvedTargetAssetWarnings: missingAssets.length,
  sourceArticlesWithUnresolvedAssets: blockedSourceIds,
  tocOnlyRepairsKeepingExistingAssets: patches.filter((patch) => patch.keptExistingAssets).length,
  macroOrTablePlaceholdersToReplace: targets.reduce((sum, article) => sum + (article.body || []).filter(targetCallout).length, 0),
  publishedArticlesUpdatedSinceImport: targets.filter((article) => Date.parse(article._updatedAt) > Date.parse('2026-09-30T08:37:41.321Z')).length,
  applyRequested: process.argv.includes('--apply-reviewed-content'),
}, null, 2))

if (!process.argv.includes('--apply-reviewed-content')) {
  console.log('Dry run only. Re-run with --apply-reviewed-content to replace only the imported macro/table placeholders in affected published bodies.')
  process.exit(0)
}
if (missingAssets.length && blockedSourceIds.some((sourceId) => !patches.find((patch) => patch.id === `confluence-article-${sourceId}`)?.keptExistingAssets)) {
  throw new Error(`Refusing changes: ${missingAssets.length} unresolved asset warning(s) are not covered by a TOC-only preserve-existing-assets repair.`)
}

for (let index = 0; index < patches.length; index += 10) {
  let transaction = client.transaction()
  for (const patch of patches.slice(index, index + 10)) {
    transaction = transaction.patch(patch.id, (draft) => draft.ifRevisionId(patch.rev).set({body: patch.body}))
  }
  await transaction.commit()
}
console.log(`Replaced imported macro/table placeholders in ${patches.length} published article bodies.`)
