import {createClient} from '@sanity/client'
import {load} from 'cheerio'
import {config} from 'dotenv'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

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

function decode(value) {
  if (typeof value !== 'string' || !value.includes('&')) return value
  const safeText = value.replaceAll('<', '&lt;')
  return load(`<textarea>${safeText}</textarea>`).root().find('textarea').text()
}

function decodeBlock(block) {
  if (!block || typeof block !== 'object') return block
  const next = {...block}
  const fields = {
    block: [],
    callout: ['title', 'text'],
    imageWithCaption: ['alt', 'caption'],
    animatedImageWithCaption: ['alt', 'caption'],
    videoWithCaption: ['title', 'caption', 'transcript'],
    audioWithTranscript: ['title', 'caption', 'transcript'],
    downloadableFile: ['title', 'caption'],
    procedure: ['title'],
    simpleTable: ['caption'],
    codeBlock: [],
  }[block._type] || []
  for (const field of fields) {
    if (field in next) next[field] = decode(next[field])
  }
  if (block._type === 'block') {
    next.children = (block.children || []).map((child) => child?._type === 'span' ? {...child, text: decode(child.text)} : child)
  }
  if (block._type === 'procedure') {
    next.steps = (block.steps || []).map((step) => ({...step, title: decode(step.title), description: decode(step.description)}))
  }
  if (block._type === 'simpleTable') {
    next.columns = (block.columns || []).map(decode)
    next.rows = (block.rows || []).map((row) => ({...row, cells: (row.cells || []).map(decode)}))
  }
  if (block._type === 'videoWithCaption' || block._type === 'audioWithTranscript') {
    next.captions = (block.captions || []).map((track) => ({...track, label: decode(track.label)}))
  }
  return next
}

const articles = await client.fetch('*[_type == "article" && language == "en" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, _rev, title, summary, seo, body}')
const patches = []
for (const article of articles) {
  const next = {
    title: decode(article.title),
    summary: decode(article.summary),
    body: (article.body || []).map(decodeBlock),
    ...(article.seo ? {seo: { ...article.seo, title: decode(article.seo.title), description: decode(article.seo.description)}} : {}),
  }
  const before = JSON.stringify({title: article.title, summary: article.summary, body: article.body, ...(article.seo ? {seo: article.seo} : {})})
  const after = JSON.stringify(next)
  if (before !== after) patches.push({id: article._id, rev: article._rev, value: next})
}

console.log(JSON.stringify({projectId, dataset, publishedArticles: articles.length, articlesNeedingEntityDecode: patches.length, applyRequested: process.argv.includes('--apply')}, null, 2))
if (!process.argv.includes('--apply')) {
  console.log('Dry run only. Re-run with --apply after reviewing the scope; code block content and asset URLs are excluded.')
  process.exit(0)
}

for (let index = 0; index < patches.length; index += 20) {
  let transaction = client.transaction()
  for (const patch of patches.slice(index, index + 20)) {
    transaction = transaction.patch(patch.id, (draft) => draft.ifRevisionId(patch.rev).set(patch.value))
  }
  await transaction.commit()
}
console.log(`Decoded visible HTML entities in ${patches.length} published articles.`)
