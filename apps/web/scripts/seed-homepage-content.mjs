import {createClient} from '@sanity/client'
import {config} from 'dotenv'
import {readFile} from 'node:fs/promises'
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

const localeDir = resolve(appDir, 'app/i18n/locales/en')
const [common, navigation] = await Promise.all([
  readFile(resolve(localeDir, 'common.json'), 'utf8').then(JSON.parse),
  readFile(resolve(localeDir, 'navigation.json'), 'utf8').then(JSON.parse),
])
const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false, perspective: 'raw', token})
const [products, collections] = await Promise.all([
  client.fetch('*[_type == "product" && language == "en" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, "slug": slug.current}'),
  client.fetch('*[_type == "collection" && language == "en" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, "slug": slug.current}'),
])
const productBySlug = new Map(products.map((item) => [item.slug, item]))
const collectionBySlug = new Map(collections.map((item) => [item.slug, item]))
const taskProduct = {plan: 'planner', inventory: 'inventory', deliver: 'influence', screens: 'cms', measure: 'measure-platform', users: 'admin-console'}
const missingProducts = [...new Set(Object.values(taskProduct))].filter((slug) => !productBySlug.has(slug))
const sharedCollectionSlugs = ['getting-started', 'best-practices']
const missingCollections = sharedCollectionSlugs.filter((slug) => !collectionBySlug.has(slug))
if (missingProducts.length || missingCollections.length) {
  throw new Error(`Refusing homepage setup: required published references are missing (${missingProducts.length} products, ${missingCollections.length} collections).`)
}

const settings = {
  _id: 'siteSettings-en',
  _type: 'siteSettings',
  title: common.siteTitle,
  description: common.siteDescription,
  language: 'en',
  navigationLinks: [
    { _key: 'nav-products', label: navigation.products, destination: 'products' },
    { _key: 'nav-getting-started', label: navigation.gettingStarted, destination: 'getting-started' },
    { _key: 'nav-best-practices', label: navigation.bestPractices, destination: 'best-practices' },
  ],
  footerText: common.footer,
  footerNote: common.footerNote,
  supportLinkLabel: navigation.support,
}
const homePage = {
  _id: 'homePage-en',
  _type: 'homePage',
  language: 'en',
  eyebrow: common.eyebrow,
  heroTitle: common.heroTitle,
  heroDescription: common.heroDescription,
  taskShortcuts: Object.entries(taskProduct).map(([key, slug]) => ({
    _key: `task-${key}`,
    label: common.tasks[key],
    product: {_type: 'reference', _ref: productBySlug.get(slug)._id},
  })),
  featuredProducts: products
    .sort((a, b) => ['cms','planner','admin-console','measure-platform','influence','inventory','lmx-gsl'].indexOf(a.slug) - ['cms','planner','admin-console','measure-platform','influence','inventory','lmx-gsl'].indexOf(b.slug))
    .map((product) => ({_type: 'reference', _ref: product._id})),
  featuredCollections: sharedCollectionSlugs.map((slug) => ({_type: 'reference', _ref: collectionBySlug.get(slug)._id})),
  featuredArticles: [],
  resources: [
    {
      _key: 'resource-getting-started',
      title: common.newHere,
      description: common.newHereDescription,
      linkLabel: common.startLearning,
      icon: 'book',
      collection: {_type: 'reference', _ref: collectionBySlug.get('getting-started')._id},
    },
    {
      _key: 'resource-troubleshooting',
      title: common.stuckTitle,
      description: common.stuckDescription,
      linkLabel: common.troubleshooting,
      icon: 'support',
      searchQuery: common.troubleshootingQuery,
    },
  ],
  seo: {title: common.siteTitle, description: common.siteDescription},
}
const documents = [homePage, settings]
const ids = documents.map((document) => document._id)
const existing = await client.fetch('*[_id in $ids || _id in $draftIds]{_id, _type}', {ids, draftIds: ids.map((id) => `drafts.${id}`)})
const existingIds = new Set(existing.map((document) => document._id))
const plan = documents.map((document) => ({id: document._id, type: document._type, exists: existingIds.has(document._id) || existingIds.has(`drafts.${document._id}`)}))
console.log(JSON.stringify({projectId, dataset, documents: plan, applyRequested: process.argv.includes('--apply-reviewed-content')}, null, 2))
if (!process.argv.includes('--apply-reviewed-content')) {
  console.log('Dry run only. Re-run with --apply-reviewed-content to create these localized English homepage/settings documents if their singleton IDs remain unused.')
  process.exit(0)
}
if (existing.length) throw new Error('Refusing to overwrite an existing homepage or site-settings document; review it in Studio first.')
let transaction = client.transaction()
for (const document of documents) transaction = transaction.create(document)
await transaction.commit()
console.log('Published the English Home page and Site settings documents.')
