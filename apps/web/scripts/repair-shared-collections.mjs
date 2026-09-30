import {createClient} from '@sanity/client'
import {config} from 'dotenv'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')
config({path: resolve(appDir, '.env'), quiet: true})
config({path: resolve(repoRoot, '.env.migration'), override: true, quiet: true})

const PROJECT_ID = 'vjmj7stb'
const DATASET = 'helpcenterdevelopment'
const INTRODUCTION_SLUGS = [
  'lmx-mw-content-training-guide-module',
  '01-introduction',
  'introduction-to-admin-console',
  'introduction-measure',
  'introduction-to-influence',
  'import-inventories-user-guide',
  'dashboard-module-overview-traditional',
]
const COLLECTIONS = [
  {
    title: 'Getting started',
    slug: 'getting-started',
    description: 'Introductory guides and first steps across the Moving Walls product suite.',
  },
  {
    title: 'Best practices',
    slug: 'best-practices',
    description: 'Published guides classified as best practices for Moving Walls products.',
  },
].map((collection) => ({
  ...collection,
  _id: `mw-shared-collection-${collection.slug}-en`,
  _type: 'collection',
  language: 'en',
  slug: {_type: 'slug', current: collection.slug},
}))

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} in the ignored migration environment file.`)
  return value
}

const projectId = process.env.SANITY_PROJECT_ID?.trim()
const dataset = process.env.SANITY_DATASET?.trim()
if (projectId !== PROJECT_ID || dataset !== DATASET) {
  throw new Error(`Refusing to modify content outside ${PROJECT_ID}/${DATASET}.`)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2025-02-19',
  useCdn: false,
  perspective: 'raw',
  token: requiredEnv('SANITY_MIGRATION_TOKEN'),
})

const [articles, currentCollections] = await Promise.all([
  client.fetch('*[_type == "article" && language == "en" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, title, contentType, "slug": slug.current, collections[]{_key, _ref}}'),
  client.fetch('*[_type == "collection" && language == "en" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, title, "slug": slug.current}'),
])
const bySlug = new Map(articles.map((article) => [article.slug, article]))
const byCollectionSlug = new Map(currentCollections.map((collection) => [collection.slug, collection]))
const missingIntro = INTRODUCTION_SLUGS.filter((slug) => !bySlug.has(slug))
if (missingIntro.length) throw new Error(`Refusing changes: ${missingIntro.length} approved getting-started article slug(s) are missing.`)

const selected = new Map()
for (const slug of INTRODUCTION_SLUGS) selected.set(bySlug.get(slug)._id, bySlug.get(slug))
for (const article of articles.filter((item) => item.contentType === 'best-practice')) selected.set(article._id, article)

const actualCollections = COLLECTIONS.map((document) => {
  const existing = byCollectionSlug.get(document.slug.current)
  if (existing && existing._id !== document._id) return {...document, _id: existing._id, exists: true}
  return {...document, exists: Boolean(existing)}
})
const collectionIdBySlug = new Map(actualCollections.map((collection) => [collection.slug.current, collection._id]))
const memberships = new Map()
for (const slug of INTRODUCTION_SLUGS) {
  const id = bySlug.get(slug)._id
  memberships.set(id, [...new Set([...(memberships.get(id) || []), 'getting-started'])])
}
for (const article of articles.filter((item) => item.contentType === 'best-practice')) {
  memberships.set(article._id, [...new Set([...(memberships.get(article._id) || []), 'best-practices'])])
}
const patches = []
for (const [articleId, slugs] of memberships) {
  const article = selected.get(articleId)
  const existing = (article.collections || []).filter((reference) => reference?._ref)
  const existingIds = new Set(existing.map((reference) => reference._ref))
  const additions = slugs
    .map((slug) => ({slug, id: collectionIdBySlug.get(slug)}))
    .filter(({id}) => !existingIds.has(id))
    .map(({slug, id}) => ({_key: `shared-${slug}`, _type: 'reference', _ref: id}))
  if (additions.length) patches.push({id: articleId, collections: [...existing, ...additions]})
}

const summary = {
  projectId,
  dataset,
  collections: actualCollections.map(({_id, title, slug, exists}) => ({_id, title, slug: slug.current, exists})),
  gettingStartedArticles: INTRODUCTION_SLUGS.map((slug) => ({title: bySlug.get(slug).title, slug})),
  bestPracticeArticleCount: articles.filter((item) => item.contentType === 'best-practice').length,
  articleMembershipPatches: patches.length,
  applyRequested: process.argv.includes('--apply-reviewed-content'),
}
console.log(JSON.stringify(summary, null, 2))

if (!summary.applyRequested) {
  console.log('Dry run only. Re-run with --apply-reviewed-content to publish the two shared collections and attach the listed published articles.')
  process.exit(0)
}

for (const collection of actualCollections) {
  if (collection.exists) continue
  const document = {...collection}
  delete document.exists
  await client.create(document)
}
for (let index = 0; index < patches.length; index += 20) {
  let transaction = client.transaction()
  for (const patch of patches.slice(index, index + 20)) {
    transaction = transaction.patch(patch.id, (draft) => draft.set({collections: patch.collections}))
  }
  await transaction.commit()
}

const verify = await client.fetch(`{
  "gettingStarted": *[_type == "collection" && language == "en" && slug.current == "getting-started" && !(_id in path("drafts.**"))]{_id, "articleCount": count(*[_type == "article" && references(^._id)])}[0],
  "bestPractices": *[_type == "collection" && language == "en" && slug.current == "best-practices" && !(_id in path("drafts.**"))]{_id, "articleCount": count(*[_type == "article" && references(^._id)])}[0]
}`)
console.log(JSON.stringify({publishedVerification: verify}, null, 2))
